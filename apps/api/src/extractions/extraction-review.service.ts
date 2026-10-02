import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { LifeOSIdentity } from '../auth/auth.types.js';
import { DatabaseService } from '../database/database.service.js';

interface ExtractionRunRow {
  id: string;
  processing_job_id: string;
  upload_id: string;
  provider: string;
  model_name: string;
  model_version: string | null;
  status: string;
  source_sha256: string;
  page_count: number | null;
  started_at: string;
  completed_at: string | null;
  document_type: string;
  original_filename: string;
  owner_person_id: string | null;
  document_id: string | null;
}

interface ExtractedFieldRow {
  id: string;
  extraction_run_id: string;
  field_key: string;
  value_json: unknown;
  normalized_value: string | null;
  confidence: string | number;
  page_number: number;
  bounding_box: unknown;
  source_text_hash: string | null;
  review_status: string;
  created_at: string;
}

@Injectable()
export class ExtractionReviewService {
  constructor(private readonly database: DatabaseService) {}

  get enabled() {
    return this.database.enabled;
  }

  async getRun(identity: LifeOSIdentity, householdId: string, runId: string) {
    return this.database.withUserTransaction(identity.userId, async (client) => {
      await this.requireHousehold(client, householdId);

      const runResult = await client.query<ExtractionRunRow>(
        `select
           r.id,
           r.processing_job_id,
           r.upload_id,
           r.provider,
           r.model_name,
           r.model_version,
           r.status,
           r.source_sha256,
           r.page_count,
           r.started_at::text,
           r.completed_at::text,
           u.document_type,
           u.original_filename,
           u.owner_person_id,
           u.document_id
         from public.document_extraction_runs r
         join public.document_uploads u on u.id = r.upload_id
         where r.id = $1
           and r.household_id = $2`,
        [runId, householdId],
      );

      const run = runResult.rows[0];
      if (!run) {
        throw new NotFoundException({
          code: 'EXTRACTION_NOT_FOUND',
          message: 'Extraction was not found.',
        });
      }

      const fieldsResult = await client.query<ExtractedFieldRow>(
        `select
           id,
           extraction_run_id,
           field_key,
           value_json,
           normalized_value,
           confidence,
           page_number,
           bounding_box,
           source_text_hash,
           review_status,
           created_at::text
         from public.document_extracted_fields
         where extraction_run_id = $1
         order by page_number, field_key, id`,
        [run.id],
      );

      return {
        id: run.id,
        uploadId: run.upload_id,
        processingJobId: run.processing_job_id,
        documentId: run.document_id,
        documentType: run.document_type,
        sourceFileName: run.original_filename,
        personId: run.owner_person_id,
        status: run.status,
        engine: {
          provider: run.provider,
          modelName: run.model_name,
          modelVersion: run.model_version,
        },
        sourceIntegrity: {
          sha256: run.source_sha256,
        },
        pageCount: run.page_count,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        fields: fieldsResult.rows.map((field) => this.mapField(field)),
      };
    });
  }

  async confirmField(
    identity: LifeOSIdentity,
    householdId: string,
    runId: string,
    fieldId: string,
    requestId: string,
  ) {
    return this.database.withUserTransaction(identity.userId, async (client) => {
      await this.requireHousehold(client, householdId);

      const result = await client.query<ExtractionRunRow & ExtractedFieldRow>(
        `select
           r.id as extraction_run_id,
           r.processing_job_id,
           r.upload_id,
           r.provider,
           r.model_name,
           r.model_version,
           r.status,
           r.source_sha256,
           r.page_count,
           r.started_at::text,
           r.completed_at::text,
           u.document_type,
           u.original_filename,
           u.owner_person_id,
           u.document_id,
           f.id,
           f.field_key,
           f.value_json,
           f.normalized_value,
           f.confidence,
           f.page_number,
           f.bounding_box,
           f.source_text_hash,
           f.review_status,
           f.created_at::text
         from public.document_extracted_fields f
         join public.document_extraction_runs r on r.id = f.extraction_run_id
         join public.document_uploads u on u.id = r.upload_id
         where r.id = $1
           and f.id = $2
           and r.household_id = $3`,
        [runId, fieldId, householdId],
      );

      const field = result.rows[0];
      if (!field) {
        throw new NotFoundException({
          code: 'EXTRACTED_FIELD_NOT_FOUND',
          message: 'Extracted field was not found.',
        });
      }

      if (field.status !== 'succeeded') {
        throw new ConflictException({
          code: 'EXTRACTION_NOT_READY',
          message: 'Extraction must succeed before fields can be confirmed.',
        });
      }

      if (field.review_status === 'rejected') {
        throw new ConflictException({
          code: 'EXTRACTED_FIELD_REJECTED',
          message: 'A rejected field cannot be confirmed without a new extraction.',
        });
      }

      const existing = await client.query<{
        id: string;
        document_id: string;
        field_key: string;
        normalized_value: string | null;
        provenance: unknown;
      }>(
        `select id, document_id, field_key, normalized_value, provenance
         from public.document_facts
         where source_extracted_field_id = $1`,
        [fieldId],
      );

      const existingFact = existing.rows[0];
      if (existingFact) {
        return {
          replayed: true,
          trustClass: 'USER_CONFIRMED',
          documentId: existingFact.document_id,
          factId: existingFact.id,
          fieldKey: existingFact.field_key,
          normalizedValue: existingFact.normalized_value,
          provenance: existingFact.provenance,
        };
      }

      let documentId = field.document_id;
      if (!documentId) {
        const created = await client.query<{ id: string }>(
          `insert into public.documents(
             household_id,
             owner_person_id,
             owner_user_id,
             document_type,
             title,
             status,
             sensitivity
           )
           values ($1,$2,$3,$4,$5,'active','high')
           returning id`,
          [
            householdId,
            field.owner_person_id,
            identity.userId,
            field.document_type,
            field.original_filename,
          ],
        );

        documentId = created.rows[0]?.id ?? null;
        if (!documentId) throw new Error('Failed to create document for extraction review');

        await client.query(
          `update public.document_uploads
           set document_id = $2, updated_at = now()
           where id = $1`,
          [field.upload_id, documentId],
        );
      }

      const provenance = {
        source: 'document_extraction_review',
        sourceOrigin: 'ai_extracted',
        extractionRunId: runId,
        extractedFieldId: fieldId,
        processingJobId: field.processing_job_id,
        uploadId: field.upload_id,
        originalConfidence: Number(field.confidence),
        page: field.page_number,
        boundingBox: field.bounding_box,
        sourceTextHash: field.source_text_hash,
        sourceSha256: field.source_sha256,
        provider: field.provider,
        modelName: field.model_name,
        modelVersion: field.model_version,
        reviewedBy: identity.userId,
        requestId,
      };

      const factResult = await client.query<{ id: string }>(
        `insert into public.document_facts(
           document_id,
           field_key,
           value_json,
           normalized_value,
           confidence,
           origin,
           review_status,
           provenance,
           source_extracted_field_id
         )
         values ($1,$2,$3::jsonb,$4,1,'user_confirmed','confirmed',$5::jsonb,$6)
         returning id`,
        [
          documentId,
          field.field_key,
          JSON.stringify(field.value_json),
          field.normalized_value,
          JSON.stringify(provenance),
          fieldId,
        ],
      );

      const factId = factResult.rows[0]?.id;
      if (!factId) throw new Error('Failed to persist confirmed extraction fact');

      await client.query(
        `update public.document_extracted_fields
         set review_status='confirmed'
         where id = $1`,
        [fieldId],
      );

      await client.query(
        `insert into public.audit_logs(
           household_id,
           actor_user_id,
           action,
           entity_type,
           entity_id,
           request_id,
           metadata
         )
         values ($1,$2,'extracted_field.confirmed','document_fact',$3,$4,$5::jsonb)`,
        [
          householdId,
          identity.userId,
          factId,
          requestId,
          JSON.stringify({
            extractionRunId: runId,
            extractedFieldId: fieldId,
            documentId,
            fieldKey: field.field_key,
            originalConfidence: Number(field.confidence),
          }),
        ],
      );

      return {
        replayed: false,
        trustClass: 'USER_CONFIRMED',
        documentId,
        factId,
        fieldKey: field.field_key,
        normalizedValue: field.normalized_value,
        provenance,
      };
    });
  }

  private async requireHousehold(
    client: { query: <T extends Record<string, unknown>>(text: string, values?: unknown[]) => Promise<{ rows: T[] }> },
    householdId: string,
  ) {
    const household = await client.query<{ id: string }>(
      'select id from public.households where id = $1',
      [householdId],
    );

    if (!household.rows[0]) {
      throw new NotFoundException({
        code: 'HOUSEHOLD_NOT_FOUND',
        message: 'Household was not found.',
      });
    }
  }

  private mapField(field: ExtractedFieldRow) {
    return {
      id: field.id,
      key: field.field_key,
      value: field.value_json,
      normalizedValue: field.normalized_value,
      trustClass: 'AI_EXTRACTED',
      originalConfidence: Number(field.confidence),
      reviewStatus: field.review_status,
      reviewRequired: field.review_status === 'pending',
      provenance: {
        page: field.page_number,
        boundingBox: field.bounding_box,
        sourceTextHash: field.source_text_hash,
      },
      createdAt: field.created_at,
    };
  }
}
