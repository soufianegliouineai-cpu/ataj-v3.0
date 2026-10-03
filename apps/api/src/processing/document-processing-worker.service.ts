import { createHash } from 'node:crypto';
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
}

class SourceIntegrityError extends Error {
  constructor(public readonly integrityCode: string, message: string) {
    super(message);
    this.name = 'SourceIntegrityError';
  }
}

@Injectable()
export class DocumentProcessingWorkerService {
  constructor(
    private readonly database: WorkerDatabaseService,
    private readonly storage: ObjectStorageService,
    private readonly ocr: DocumentIntelligenceService,
  ) {}

  get configured() {
    return this.database.enabled && this.storage.configured && this.ocr.configured;
  }

  async runOnce() {
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

    const job = await this.claimNext();
    if (!job) {
      return { claimed: false, status: 'idle' as const };
    }

    try {
      const source = await this.readVerifiedSource(job);
      const analysis = await this.ocr.analyze(
        source.bytes,
        job.mimeType,
        job.documentType,
      );
      const result = await this.persistSucceededAnalysis(job, analysis, source.sha256, source.sizeBytes);
      return { claimed: true, ...result };
    } catch (error) {
      const code = error instanceof OcrProviderError
        ? error.ocrCode
        : error instanceof SourceIntegrityError
          ? error.integrityCode
          : 'PROCESSING_PIPELINE_ERROR';

      await this.failProcessing(job, code);

      return {
        claimed: true,
        processingJobId: job.jobId,
        uploadId: job.uploadId,
        status: 'failed' as const,
        errorCode: code,
      };
    }
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
           and u.status='clean'
           and u.malware_status='clean'
           and u.actual_size_bytes is not null
           and u.actual_sha256 is not null
         order by j.queued_at, j.id
         for update of j skip locked
         limit 1`,
      );

      const row = result.rows[0];
      if (!row) return null;

      await client.query(
        `update public.document_processing_jobs
         set status='running'
         where id=$1 and status='queued'`,
        [row.job_id],
      );

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
      };
    });
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

      await client.query(
        `update public.document_processing_jobs
         set status='succeeded', result_json=$2::jsonb
         where id=$1 and status='running'`,
        [
          job.jobId,
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
    await this.database.withTransaction(async (client) => {
      await client.query(
        `update public.document_processing_jobs
         set status='failed',
             last_error_code=$2,
             last_error_message='Processing failed. See structured error code.'
         where id=$1 and status='running'`,
        [job.jobId, code],
      );

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
          }),
        ],
      );
    });
  }
}
