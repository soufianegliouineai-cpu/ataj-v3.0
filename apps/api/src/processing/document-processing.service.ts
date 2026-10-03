import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { LifeOSIdentity } from '../auth/auth.types.js';
import { DatabaseService } from '../database/database.service.js';

interface ProcessingUploadRow {
  id: string;
  status: string;
  malware_status: string;
  actual_size_bytes: string | null;
  actual_sha256: string | null;
}

interface ProcessingJobRow {
  id: string;
  status: string;
  processor: string;
  attempt_count: number;
  last_error_code: string | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
}

@Injectable()
export class DocumentProcessingService {
  constructor(private readonly database: DatabaseService) {}

  get enabled() {
    return this.database.enabled;
  }

  async enqueue(
    identity: LifeOSIdentity,
    householdId: string,
    uploadId: string,
    requestId: string,
  ) {
    return this.database.withUserTransaction(identity.userId, async (client) => {
      await this.requireHousehold(client, householdId);

      const uploadResult = await client.query<ProcessingUploadRow>(
        `select id, status, malware_status, actual_size_bytes::text, actual_sha256
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

      const existing = await this.findJob(client, uploadId);
      if (existing) {
        if (existing.status === 'failed' || existing.status === 'cancelled') {
          throw new ConflictException({
            code: 'PROCESSING_RETRY_REQUIRED',
            message: 'The previous processing attempt is terminal and requires an explicit retry.',
            details: {
              processingJobId: existing.id,
              status: existing.status,
              lastErrorCode: existing.last_error_code,
            },
          });
        }

        const extractionRunId = existing.status === 'succeeded'
          ? await this.findExtractionRunId(client, existing.id)
          : null;

        return {
          replayed: true,
          processingJobId: existing.id,
          extractionRunId,
          uploadId,
          status: existing.status,
          attemptCount: existing.attempt_count,
        };
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
      if (!jobId) throw new Error('Failed to enqueue document processing job.');

      await client.query(
        `insert into public.audit_logs(
           household_id, actor_user_id, action, entity_type, entity_id, request_id, metadata
         )
         values ($1,$2,'document_processing.enqueued','document_processing_job',$3,$4,$5::jsonb)`,
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
        replayed: false,
        processingJobId: jobId,
        extractionRunId: null,
        uploadId,
        status: 'queued',
        attemptCount: 0,
      };
    });
  }

  async status(identity: LifeOSIdentity, householdId: string, uploadId: string) {
    return this.database.withUserTransaction(identity.userId, async (client) => {
      await this.requireHousehold(client, householdId);

      const upload = await client.query<{ id: string }>(
        'select id from public.document_uploads where id=$1 and household_id=$2',
        [uploadId, householdId],
      );
      if (!upload.rows[0]) {
        throw new NotFoundException({
          code: 'UPLOAD_NOT_FOUND',
          message: 'Upload was not found.',
        });
      }

      const job = await this.findJob(client, uploadId);
      if (!job) {
        throw new NotFoundException({
          code: 'PROCESSING_JOB_NOT_FOUND',
          message: 'No processing job exists for this upload.',
        });
      }

      return {
        processingJobId: job.id,
        uploadId,
        status: job.status,
        processor: job.processor,
        attemptCount: job.attempt_count,
        lastErrorCode: job.last_error_code,
        extractionRunId: job.status === 'succeeded'
          ? await this.findExtractionRunId(client, job.id)
          : null,
        queuedAt: job.queued_at,
        startedAt: job.started_at,
        completedAt: job.completed_at,
      };
    });
  }

  private async requireHousehold(
    client: { query: <T extends Record<string, unknown>>(text: string, values?: unknown[]) => Promise<{ rows: T[] }> },
    householdId: string,
  ) {
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
  }

  private async findJob(
    client: { query: <T extends Record<string, unknown>>(text: string, values?: unknown[]) => Promise<{ rows: T[] }> },
    uploadId: string,
  ) {
    const result = await client.query<ProcessingJobRow>(
      `select id, status, processor, attempt_count, last_error_code,
              queued_at::text, started_at::text, completed_at::text
       from public.document_processing_jobs
       where upload_id=$1`,
      [uploadId],
    );
    return result.rows[0] ?? null;
  }

  private async findExtractionRunId(
    client: { query: <T extends Record<string, unknown>>(text: string, values?: unknown[]) => Promise<{ rows: T[] }> },
    jobId: string,
  ) {
    const result = await client.query<{ id: string }>(
      'select id from public.document_extraction_runs where processing_job_id=$1',
      [jobId],
    );
    return result.rows[0]?.id ?? null;
  }
}
