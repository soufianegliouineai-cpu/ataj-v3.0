import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { LifeOSIdentity } from '../auth/auth.types.js';
import type { SupportedDocumentType } from '../constants.js';
import { DatabaseService } from '../database/database.service.js';
import {
  DocumentIntelligenceService,
  OcrProviderError,
  type OcrAnalysisResult,
} from '../ocr/document-intelligence.service.js';
import { ObjectStorageService } from '../storage/object-storage.service.js';

const MAX_SOURCE_BYTES = 26_214_400;

interface ProcessingUploadRow {
  id: string;
  household_id: string;
  owner_user_id: string;
  owner_person_id: string | null;
  document_type: SupportedDocumentType;
  original_filename: string;
  declared_mime_type: string;
  object_key: string;
  status: string;
  malware_status: string;
  actual_size_bytes: string | null;
  actual_sha256: string | null;
}

interface ExistingJobRow {
  id: string;
  status: string;
  processor: string;
}

class SourceIntegrityError extends Error {
  constructor(public readonly integrityCode: string, message: string) {
    super(message);
    this.name = 'SourceIntegrityError';
  }
}

@Injectable()
export class DocumentProcessingService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: ObjectStorageService,
    private readonly ocr: DocumentIntelligenceService,
  ) {}

  get enabled() {
    return this.database.enabled;
  }

  get configured() {
    return this.database.enabled && this.storage.configured && this.ocr.configured;
  }

  async process(
    identity: LifeOSIdentity,
    householdId: string,
    uploadId: string,
    requestId: string,
  ) {
    if (!this.storage.configured) {
      throw new ServiceUnavailableException({
        code: 'OBJECT_STORAGE_NOT_CONFIGURED',
        message: 'Document byte storage is not configured for this deployment.',
      });
    }

    if (!this.ocr.configured) {
      throw new ServiceUnavailableException({
        code: 'OCR_NOT_CONFIGURED',
        message: 'OCR extraction is not configured for this deployment.',
      });
    }

    const prepared = await this.database.withUserTransaction(identity.userId, async (client) => {
      const household = await client.query<{ id: string }>(
        'select id from public.households where id=$1',
        [householdId],
      );
      if (!household.rows[0]) {
        throw new NotFoundException({
          code: 'HOUSEHOLD_NOT_FOUND',
          message: 'Household was not found.',
        });
      }

      const uploadResult = await client.query<ProcessingUploadRow>(
        `select
           id, household_id, owner_user_id, owner_person_id, document_type,
           original_filename, declared_mime_type, object_key, status,
           malware_status, actual_size_bytes::text, actual_sha256
         from public.document_uploads
         where id=$1 and household_id=$2`,
        [uploadId, householdId],
      );

      const upload = uploadResult.rows[0];
      if (!upload) {
        throw new NotFoundException({
          code: 'UPLOAD_NOT_FOUND',
          message: 'Upload was not found.',
        });
      }

      const existingJob = await client.query<ExistingJobRow>(
        `select id, status, processor
         from public.document_processing_jobs
         where upload_id=$1`,
        [uploadId],
      );

      const existing = existingJob.rows[0];
      if (existing?.status === 'succeeded') {
        const run = await client.query<{ id: string }>(
          'select id from public.document_extraction_runs where processing_job_id=$1',
          [existing.id],
        );
        const runId = run.rows[0]?.id;
        if (!runId) throw new Error('Succeeded processing job has no extraction run.');

        return {
          replayed: true as const,
          upload,
          jobId: existing.id,
          extractionRunId: runId,
        };
      }

      if (existing) {
        throw new ConflictException({
          code: 'PROCESSING_JOB_EXISTS',
          message: 'A processing job already exists for this upload.',
          details: { status: existing.status },
        });
      }

      if (
        upload.status !== 'clean'
        || upload.malware_status !== 'clean'
        || !upload.actual_size_bytes
        || !upload.actual_sha256
      ) {
        throw new ConflictException({
          code: 'UPLOAD_NOT_READY_FOR_PROCESSING',
          message: 'Upload must be clean, malware-free, and byte-verified before OCR.',
          details: {
            status: upload.status,
            malwareStatus: upload.malware_status,
          },
        });
      }

      const jobResult = await client.query<{ id: string }>(
        `insert into public.document_processing_jobs(
           upload_id, household_id, owner_user_id, processor, status
         )
         values ($1,$2,$3,'azure_document_intelligence','queued')
         returning id`,
        [uploadId, householdId, identity.userId],
      );

      const jobId = jobResult.rows[0]?.id;
      if (!jobId) throw new Error('Failed to create document processing job.');

      await client.query(
        `update public.document_processing_jobs
         set status='running'
         where id=$1`,
        [jobId],
      );

      await client.query(
        `update public.document_uploads
         set status='processing', updated_at=now()
         where id=$1 and status='clean'`,
        [uploadId],
      );

      await client.query(
        `insert into public.audit_logs(
           household_id, actor_user_id, action, entity_type, entity_id, request_id, metadata
         )
         values ($1,$2,'document_processing.started','document_processing_job',$3,$4,$5::jsonb)`,
        [
          householdId,
          identity.userId,
          jobId,
          requestId,
          JSON.stringify({
            uploadId,
            processor: 'azure_document_intelligence',
            sourceSha256: upload.actual_sha256,
          }),
        ],
      );

      return {
        replayed: false as const,
        upload,
        jobId,
        extractionRunId: null,
      };
    });

    if (prepared.replayed) {
      return {
        replayed: true,
        processingJobId: prepared.jobId,
        extractionRunId: prepared.extractionRunId,
        uploadId,
        status: 'succeeded',
      };
    }

    try {
      const { bytes, sha256, sizeBytes } = await this.readVerifiedSource(prepared.upload);

      const analysis = await this.ocr.analyze(
        bytes,
        prepared.upload.declared_mime_type,
        prepared.upload.document_type,
      );

      return await this.persistSucceededAnalysis(
        identity,
        householdId,
        prepared.upload,
        prepared.jobId,
        analysis,
        sha256,
        sizeBytes,
        requestId,
      );
    } catch (error) {
      const code = error instanceof OcrProviderError
        ? error.ocrCode
        : error instanceof SourceIntegrityError
          ? error.integrityCode
          : 'PROCESSING_PIPELINE_ERROR';

      await this.failProcessing(
        identity,
        householdId,
        uploadId,
        prepared.jobId,
        requestId,
        code,
      );

      if (error instanceof SourceIntegrityError) {
        throw new ConflictException({
          code: error.integrityCode,
          message: error.message,
        });
      }

      if (error instanceof OcrProviderError) {
        throw new ServiceUnavailableException({
          code: 'OCR_PROCESSING_FAILED',
          message: 'Document OCR processing failed.',
          details: { providerCode: error.ocrCode },
        });
      }

      throw error;
    }
  }

  private async readVerifiedSource(upload: ProcessingUploadRow) {
    const source = await this.storage.openReadStream(upload.object_key);
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

    if (sizeBytes !== Number(upload.actual_size_bytes)) {
      throw new SourceIntegrityError(
        'OCR_SOURCE_SIZE_MISMATCH',
        'Source object changed size after malware verification.',
      );
    }

    if (sha256 !== upload.actual_sha256) {
      throw new SourceIntegrityError(
        'OCR_SOURCE_SHA256_MISMATCH',
        'Source object changed after malware verification.',
      );
    }

    return { bytes: Buffer.concat(chunks), sha256, sizeBytes };
  }

  private async persistSucceededAnalysis(
    identity: LifeOSIdentity,
    householdId: string,
    upload: ProcessingUploadRow,
    jobId: string,
    analysis: OcrAnalysisResult,
    sha256: string,
    sizeBytes: number,
    requestId: string,
  ) {
    return this.database.withUserTransaction(identity.userId, async (client) => {
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
          jobId,
          upload.id,
          householdId,
          identity.userId,
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
         set status='succeeded',
             result_json=$2::jsonb
         where id=$1 and status='running'`,
        [
          jobId,
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
        [upload.id],
      );

      await client.query(
        `insert into public.audit_logs(
           household_id, actor_user_id, action, entity_type, entity_id, request_id, metadata
         )
         values ($1,$2,'document_processing.succeeded','document_extraction_run',$3,$4,$5::jsonb)`,
        [
          householdId,
          identity.userId,
          runId,
          requestId,
          JSON.stringify({
            processingJobId: jobId,
            uploadId: upload.id,
            provider: analysis.provider,
            modelName: analysis.modelName,
            apiVersion: analysis.apiVersion,
            fieldCount: analysis.fields.length,
            sourceSha256: sha256,
          }),
        ],
      );

      return {
        replayed: false,
        processingJobId: jobId,
        extractionRunId: runId,
        uploadId: upload.id,
        status: 'succeeded',
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

  private async failProcessing(
    identity: LifeOSIdentity,
    householdId: string,
    uploadId: string,
    jobId: string,
    requestId: string,
    code: string,
  ) {
    await this.database.withUserTransaction(identity.userId, async (client) => {
      await client.query(
        `update public.document_processing_jobs
         set status='failed',
             last_error_code=$2,
             last_error_message='Processing failed. See structured error code.'
         where id=$1 and status='running'`,
        [jobId, code],
      );

      await client.query(
        `update public.document_uploads
         set status='failed', updated_at=now()
         where id=$1 and household_id=$2 and status='processing'`,
        [uploadId, householdId],
      );

      await client.query(
        `insert into public.audit_logs(
           household_id, actor_user_id, action, entity_type, entity_id, request_id, metadata
         )
         values ($1,$2,'document_processing.failed','document_processing_job',$3,$4,$5::jsonb)`,
        [
          householdId,
          identity.userId,
          jobId,
          requestId,
          JSON.stringify({ uploadId, code }),
        ],
      );
    });
  }
}
