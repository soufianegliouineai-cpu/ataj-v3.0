import { createHash, randomUUID } from 'node:crypto';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { SupportedDocumentType } from '../constants.js';
import { WorkerDatabaseService } from '../database/worker-database.service.js';
import {
  DocumentIntelligenceService,
  OcrProviderError,
  type OcrAnalysisResult,
} from '../ocr/document-intelligence.service.js';
import { ObjectStorageService } from '../storage/object-storage.service.js';

const MAX_SOURCE_BYTES = 26_214_400;

interface ClaimedJob {
  jobId: string;
  uploadId: string;
  householdId: string;
  ownerUserId: string;
  ownerPersonId: string | null;
  documentType: SupportedDocumentType;
  mimeType: string;
  objectKey: string;
  actualSizeBytes: number;
  actualSha256: string;
  attemptCount: number;
  leaseOwner: string;
}

class SourceIntegrityError extends Error {
  constructor(public readonly integrityCode: string, message: string) {
    super(message);
    this.name = 'SourceIntegrityError';
  }
}

class LeaseLostError extends Error {
  constructor() {
    super('Processing job worker lease was lost or expired.');
    this.name = 'LeaseLostError';
  }
}

@Injectable()
export class DocumentProcessingWorkerService {
  private readonly workerId = randomUUID();
  private readonly ocrTimeoutMs = parsePositiveInt(process.env.OCR_TIMEOUT_MS, 60_000);
  private readonly leaseMs = Math.max(
    parsePositiveInt(process.env.WORKER_LEASE_MS, 180_000),
    this.ocrTimeoutMs + 60_000,
  );
  private readonly recoveryBatchSize = clampInt(
    parsePositiveInt(process.env.WORKER_RECOVERY_BATCH_SIZE, 20),
    1,
    100,
  );
  private readonly retryBaseMs = clampInt(
    parsePositiveInt(process.env.WORKER_RETRY_BASE_MS, 5_000),
    1_000,
    300_000,
  );

  constructor(
    private readonly database: WorkerDatabaseService,
    private readonly storage: ObjectStorageService,
    private readonly ocr: DocumentIntelligenceService,
  ) {}

  get configured() {
    return this.database.enabled && this.storage.configured && this.ocr.configured;
  }

  get capability() {
    return {
      configured: this.configured,
      leaseMs: this.leaseMs,
      retryBaseMs: this.retryBaseMs,
      recoveryBatchSize: this.recoveryBatchSize,
    };
  }

  async runOnce() {
    this.assertConfigured();

    const recovered = await this.recoverStaleLeases();
    const job = await this.claimNext();
    if (!job) {
      return {
        claimed: false,
        status: 'idle' as const,
        recovered,
      };
    }

    try {
      const source = await this.readVerifiedSource(job);
      await this.renewLease(job);

      const analysis = await this.ocr.analyze(
        source.bytes,
        job.mimeType,
        job.documentType,
      );

      const result = await this.persistSucceededAnalysis(
        job,
        analysis,
        source.sha256,
        source.sizeBytes,
      );

      return { claimed: true, recovered, ...result };
    } catch (error) {
      if (error instanceof LeaseLostError) {
        return {
          claimed: true,
          recovered,
          processingJobId: job.jobId,
          uploadId: job.uploadId,
          status: 'lease_lost' as const,
          errorCode: 'WORKER_LEASE_LOST',
        };
      }

      const code = error instanceof OcrProviderError
        ? error.ocrCode
        : error instanceof SourceIntegrityError
          ? error.integrityCode
          : 'PROCESSING_PIPELINE_ERROR';

      const failed = await this.failProcessing(job, code);

      return {
        claimed: true,
        recovered,
        processingJobId: job.jobId,
        uploadId: job.uploadId,
        status: failed ? 'failed' as const : 'lease_lost' as const,
        errorCode: failed ? code : 'WORKER_LEASE_LOST',
      };
    }
  }

  private assertConfigured() {
    if (!this.database.enabled) {
      throw new ServiceUnavailableException({
        code: 'WORKER_DATABASE_NOT_CONFIGURED',
        message: 'Worker database connection is not configured.',
      });
    }
    if (!this.storage.configured) {
      throw new ServiceUnavailableException({
        code: 'OBJECT_STORAGE_NOT_CONFIGURED',
        message: 'Document byte storage is not configured for the worker.',
      });
    }
    if (!this.ocr.configured) {
      throw new ServiceUnavailableException({
        code: 'OCR_NOT_CONFIGURED',
        message: 'OCR extraction is not configured for the worker.',
      });
    }
  }

  private async recoverStaleLeases() {
    return this.database.withTransaction(async (client) => {
      const stale = await client.query<{
        id: string;
        upload_id: string;
        household_id: string;
        owner_user_id: string;
        attempt_count: number;
        max_attempts: number;
      }>(
        `select id, upload_id, household_id, owner_user_id, attempt_count, max_attempts
         from public.document_processing_jobs
         where status='running'
           and lease_expires_at is not null
           and lease_expires_at < now()
         order by lease_expires_at, id
         for update skip locked
         limit $1`,
        [this.recoveryBatchSize],
      );

      let requeued = 0;
      let exhausted = 0;

      for (const row of stale.rows) {
        await client.query(
          `update public.document_processing_jobs
           set status='failed',
               last_error_code='WORKER_LEASE_EXPIRED',
               last_error_message='Worker lease expired before processing completed.'
           where id=$1 and status='running'`,
          [row.id],
        );

        if (row.attempt_count < row.max_attempts) {
          const retryDelayMs = Math.min(
            this.retryBaseMs * (2 ** Math.max(0, row.attempt_count - 1)),
            300_000,
          );

          await client.query(
            `update public.document_uploads
             set status='clean', updated_at=now()
             where id=$1 and status='processing'`,
            [row.upload_id],
          );

          await client.query(
            `update public.document_processing_jobs
             set status='queued',
                 queued_at=now(),
                 next_attempt_at=now() + ($2::double precision * interval '1 millisecond')
             where id=$1 and status='failed'`,
            [row.id, retryDelayMs],
          );

          await client.query(
            `insert into public.audit_logs(
               household_id, actor_user_id, action, entity_type, entity_id, request_id, metadata
             )
             values ($1,null,'document_processing.lease_recovered','document_processing_job',$2,null,$3::jsonb)`,
            [
              row.household_id,
              row.id,
              JSON.stringify({
                uploadId: row.upload_id,
                ownerUserId: row.owner_user_id,
                attemptCount: row.attempt_count,
                maxAttempts: row.max_attempts,
                retryDelayMs,
              }),
            ],
          );
          requeued += 1;
        } else {
          await client.query(
            `update public.document_uploads
             set status='failed', updated_at=now()
             where id=$1 and status='processing'`,
            [row.upload_id],
          );

          await client.query(
            `insert into public.audit_logs(
               household_id, actor_user_id, action, entity_type, entity_id, request_id, metadata
             )
             values ($1,null,'document_processing.attempts_exhausted','document_processing_job',$2,null,$3::jsonb)`,
            [
              row.household_id,
              row.id,
              JSON.stringify({
                uploadId: row.upload_id,
                ownerUserId: row.owner_user_id,
                attemptCount: row.attempt_count,
                maxAttempts: row.max_attempts,
              }),
            ],
          );
          exhausted += 1;
        }
      }

      return {
        inspected: stale.rowCount ?? stale.rows.length,
        requeued,
        exhausted,
      };
    });
  }

  private async claimNext(): Promise<ClaimedJob | null> {
    return this.database.withTransaction(async (client) => {
      const result = await client.query<{
        job_id: string;
        upload_id: string;
        household_id: string;
        owner_user_id: string;
        owner_person_id: string | null;
        document_type: SupportedDocumentType;
        declared_mime_type: string;
        object_key: string;
        actual_size_bytes: string;
        actual_sha256: string;
        attempt_count: number;
      }>(
        `select
           j.id as job_id,
           j.upload_id,
           j.household_id,
           j.owner_user_id,
           u.owner_person_id,
           u.document_type,
           u.declared_mime_type,
           u.object_key,
           u.actual_size_bytes::text,
           u.actual_sha256,
           j.attempt_count
         from public.document_processing_jobs j
         join public.document_uploads u on u.id = j.upload_id
         where j.status='queued'
           and j.processor='azure_document_intelligence'
           and j.next_attempt_at <= now()
           and j.attempt_count < j.max_attempts
           and u.status='clean'
           and u.malware_status='clean'
           and u.actual_size_bytes is not null
           and u.actual_sha256 is not null
         order by j.next_attempt_at, j.queued_at, j.id
         for update of j skip locked
         limit 1`,
      );

      const row = result.rows[0];
      if (!row) return null;

      const claimed = await client.query(
        `update public.document_processing_jobs
         set status='running',
             lease_owner=$2,
             lease_expires_at=now() + ($3::double precision * interval '1 millisecond')
         where id=$1 and status='queued'`,
        [row.job_id, this.workerId, this.leaseMs],
      );

      if (claimed.rowCount !== 1) {
        return null;
      }

      const upload = await client.query(
        `update public.document_uploads
         set status='processing', updated_at=now()
         where id=$1 and status='clean'`,
        [row.upload_id],
      );

      if (upload.rowCount !== 1) {
        throw new Error('Failed to claim clean upload for processing.');
      }

      await client.query(
        `insert into public.audit_logs(
           household_id, actor_user_id, action, entity_type, entity_id, request_id, metadata
         )
         values ($1,null,'document_processing.claimed','document_processing_job',$2,null,$3::jsonb)`,
        [
          row.household_id,
          row.job_id,
          JSON.stringify({
            uploadId: row.upload_id,
            ownerUserId: row.owner_user_id,
            worker: 'lifeos-worker',
            workerId: this.workerId,
            leaseMs: this.leaseMs,
          }),
        ],
      );

      return {
        jobId: row.job_id,
        uploadId: row.upload_id,
        householdId: row.household_id,
        ownerUserId: row.owner_user_id,
        ownerPersonId: row.owner_person_id,
        documentType: row.document_type,
        mimeType: row.declared_mime_type,
        objectKey: row.object_key,
        actualSizeBytes: Number(row.actual_size_bytes),
        actualSha256: row.actual_sha256,
        attemptCount: row.attempt_count + 1,
        leaseOwner: this.workerId,
      };
    });
  }

  private async renewLease(job: ClaimedJob) {
    const renewed = await this.database.withTransaction(async (client) => {
      const result = await client.query(
        `update public.document_processing_jobs
         set lease_expires_at=now() + ($3::double precision * interval '1 millisecond'),
             updated_at=now()
         where id=$1
           and status='running'
           and lease_owner=$2
           and lease_expires_at > now()`,
        [job.jobId, job.leaseOwner, this.leaseMs],
      );
      return result.rowCount === 1;
    });

    if (!renewed) throw new LeaseLostError();
  }

  private async readVerifiedSource(job: ClaimedJob) {
    const source = await this.storage.openReadStream(job.objectKey);
    const chunks: Buffer[] = [];
    const hash = createHash('sha256');
    let sizeBytes = 0;

    for await (const value of source.stream) {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
      sizeBytes += chunk.length;
      if (sizeBytes > MAX_SOURCE_BYTES) {
        throw new SourceIntegrityError(
          'OCR_SOURCE_SIZE_LIMIT',
          'Source object exceeds the OCR processing size limit.',
        );
      }
      hash.update(chunk);
      chunks.push(chunk);
    }

    const sha256 = hash.digest('hex');

    if (sizeBytes !== job.actualSizeBytes) {
      throw new SourceIntegrityError(
        'OCR_SOURCE_SIZE_MISMATCH',
        'Source object changed size after malware verification.',
      );
    }

    if (sha256 !== job.actualSha256) {
      throw new SourceIntegrityError(
        'OCR_SOURCE_SHA256_MISMATCH',
        'Source object changed after malware verification.',
      );
    }

    return { bytes: Buffer.concat(chunks), sha256, sizeBytes };
  }

  private async persistSucceededAnalysis(
    job: ClaimedJob,
    analysis: OcrAnalysisResult,
    sha256: string,
    sizeBytes: number,
  ) {
    return this.database.withTransaction(async (client) => {
      const lease = await client.query<{ id: string }>(
        `select id
         from public.document_processing_jobs
         where id=$1
           and status='running'
           and lease_owner=$2
           and lease_expires_at > now()
         for update`,
        [job.jobId, job.leaseOwner],
      );

      if (!lease.rows[0]) throw new LeaseLostError();

      const runResult = await client.query<{ id: string }>(
        `insert into public.document_extraction_runs(
           processing_job_id,
           upload_id,
           household_id,
           owner_user_id,
           provider,
           model_name,
           model_version,
           status,
           source_sha256,
           page_count,
           completed_at
         )
         values ($1,$2,$3,$4,$5,$6,$7,'succeeded',$8,$9,now())
         returning id`,
        [
          job.jobId,
          job.uploadId,
          job.householdId,
          job.ownerUserId,
          analysis.provider,
          analysis.modelName,
          analysis.modelVersion,
          sha256,
          analysis.pageCount,
        ],
      );

      const runId = runResult.rows[0]?.id;
      if (!runId) throw new Error('Failed to create extraction run.');

      for (const field of analysis.fields) {
        await client.query(
          `insert into public.document_extracted_fields(
             extraction_run_id,
             field_key,
             value_json,
             normalized_value,
             confidence,
             page_number,
             bounding_box,
             source_text_hash,
             review_status
           )
           values ($1,$2,$3::jsonb,$4,$5,$6,$7::jsonb,$8,'pending')`,
          [
            runId,
            field.key,
            JSON.stringify(field.value),
            field.normalizedValue,
            field.confidence,
            field.pageNumber,
            field.boundingBox === null ? null : JSON.stringify(field.boundingBox),
            field.sourceTextHash,
          ],
        );
      }

      const succeeded = await client.query(
        `update public.document_processing_jobs
         set status='succeeded', result_json=$3::jsonb
         where id=$1 and status='running' and lease_owner=$2`,
        [
          job.jobId,
          job.leaseOwner,
          JSON.stringify({
            extractionRunId: runId,
            provider: analysis.provider,
            modelName: analysis.modelName,
            apiVersion: analysis.apiVersion,
            fieldCount: analysis.fields.length,
            sourceSha256: sha256,
            sizeBytes,
          }),
        ],
      );

      if (succeeded.rowCount !== 1) throw new LeaseLostError();

      await client.query(
        `update public.document_uploads
         set status='processed', updated_at=now()
         where id=$1 and status='processing'`,
        [job.uploadId],
      );

      await client.query(
        `insert into public.audit_logs(
           household_id, actor_user_id, action, entity_type, entity_id, request_id, metadata
         )
         values ($1,null,'document_processing.succeeded','document_extraction_run',$2,null,$3::jsonb)`,
        [
          job.householdId,
          runId,
          JSON.stringify({
            processingJobId: job.jobId,
            uploadId: job.uploadId,
            ownerUserId: job.ownerUserId,
            provider: analysis.provider,
            modelName: analysis.modelName,
            apiVersion: analysis.apiVersion,
            fieldCount: analysis.fields.length,
            sourceSha256: sha256,
            workerAttempt: job.attemptCount,
            workerId: this.workerId,
          }),
        ],
      );

      return {
        processingJobId: job.jobId,
        extractionRunId: runId,
        uploadId: job.uploadId,
        status: 'succeeded' as const,
        sourceIntegrity: {
          sha256,
          sizeBytes,
          reverifiedBeforeOcr: true,
        },
        engine: {
          provider: analysis.provider,
          modelName: analysis.modelName,
          modelVersion: analysis.modelVersion,
          apiVersion: analysis.apiVersion,
        },
        fieldCount: analysis.fields.length,
      };
    });
  }

  private async failProcessing(job: ClaimedJob, code: string) {
    return this.database.withTransaction(async (client) => {
      const failed = await client.query(
        `update public.document_processing_jobs
         set status='failed',
             last_error_code=$3,
             last_error_message='Processing failed. See structured error code.'
         where id=$1
           and status='running'
           and lease_owner=$2
           and lease_expires_at > now()`,
        [job.jobId, job.leaseOwner, code],
      );

      if (failed.rowCount !== 1) return false;

      await client.query(
        `update public.document_uploads
         set status='failed', updated_at=now()
         where id=$1 and household_id=$2 and status='processing'`,
        [job.uploadId, job.householdId],
      );

      await client.query(
        `insert into public.audit_logs(
           household_id, actor_user_id, action, entity_type, entity_id, request_id, metadata
         )
         values ($1,null,'document_processing.failed','document_processing_job',$2,null,$3::jsonb)`,
        [
          job.householdId,
          job.jobId,
          JSON.stringify({
            uploadId: job.uploadId,
            ownerUserId: job.ownerUserId,
            code,
            workerAttempt: job.attemptCount,
            workerId: this.workerId,
          }),
        ],
      );

      return true;
    });
  }
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function clampInt(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
