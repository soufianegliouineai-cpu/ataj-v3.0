import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { LifeOSIdentity } from '../auth/auth.types.js';
import { DatabaseService } from '../database/database.service.js';
import { ObjectStorageService } from '../storage/object-storage.service.js';
import type { AllowedUploadMimeType, CreateUploadIntentDto } from './upload.dto.js';

const EXTENSION_BY_MIME: Record<AllowedUploadMimeType, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
};

@Injectable()
export class UploadService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: ObjectStorageService,
  ) {}

  get enabled() {
    return this.database.enabled;
  }

  async createIntent(
    identity: LifeOSIdentity,
    householdId: string,
    input: CreateUploadIntentDto,
  ) {
    return this.database.withUserTransaction(identity.userId, async (client) => {
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

      if (input.personId) {
        const person = await client.query<{ id: string }>(
          'select id from public.people where id = $1 and household_id = $2',
          [input.personId, householdId],
        );

        if (!person.rows[0]) {
          throw new NotFoundException({
            code: 'PERSON_NOT_FOUND',
            message: 'Person was not found in this household.',
          });
        }
      }

      const uploadId = randomUUID();
      const extension = EXTENSION_BY_MIME[input.mimeType];
      const objectKey = [
        'households',
        householdId,
        'users',
        identity.userId,
        'uploads',
        uploadId,
        'source.' + extension,
      ].join('/');

      const result = await client.query<{
        id: string;
        object_key: string;
        status: string;
        malware_status: string;
        intent_expires_at: string;
        created_at: string;
      }>(
        `insert into public.document_uploads(
           id,
           household_id,
           owner_user_id,
           owner_person_id,
           document_type,
           original_filename,
           declared_mime_type,
           declared_size_bytes,
           declared_sha256,
           object_key,
           storage_provider,
           status,
           malware_status
         )
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'unconfigured','intent_created','pending')
         returning
           id,
           object_key,
           status,
           malware_status,
           intent_expires_at::text,
           created_at::text`,
        [
          uploadId,
          householdId,
          identity.userId,
          input.personId ?? null,
          input.documentType,
          input.fileName.trim(),
          input.mimeType,
          input.sizeBytes,
          input.sha256?.toLowerCase() ?? null,
          objectKey,
        ],
      );

      const row = result.rows[0];
      if (!row) throw new Error('Failed to create document upload intent');

      await client.query(
        `insert into public.audit_logs(
           household_id, actor_user_id, action, entity_type, entity_id, request_id, metadata
         )
         values ($1,$2,'document_upload.intent_created','document_upload',$3,null,$4::jsonb)`,
        [
          householdId,
          identity.userId,
          row.id,
          JSON.stringify({
            documentType: input.documentType,
            mimeType: input.mimeType,
            sizeBytes: input.sizeBytes,
            sha256Declared: Boolean(input.sha256),
          }),
        ],
      );

      return {
        id: row.id,
        householdId,
        personId: input.personId ?? null,
        documentType: input.documentType,
        file: {
          name: input.fileName.trim(),
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          declaredSha256: input.sha256?.toLowerCase() ?? null,
          hashVerification: 'pending',
        },
        quarantine: {
          status: row.status,
          malwareStatus: row.malware_status,
          requiredBeforeProcessing: true,
        },
        storage: {
          ...this.storage.describeUnconfiguredTransport(),
          objectKey: row.object_key,
        },
        expiresAt: row.intent_expires_at,
        createdAt: row.created_at,
      };
    });
  }

  async list(identity: LifeOSIdentity, householdId: string) {
    return this.database.withUserTransaction(identity.userId, async (client) => {
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

      const result = await client.query<{
        id: string;
        owner_person_id: string | null;
        document_type: string;
        original_filename: string;
        declared_mime_type: string;
        declared_size_bytes: string;
        declared_sha256: string | null;
        actual_sha256: string | null;
        object_key: string;
        storage_provider: string;
        status: string;
        malware_status: string;
        intent_expires_at: string;
        created_at: string;
      }>(
        `select
           id,
           owner_person_id,
           document_type,
           original_filename,
           declared_mime_type,
           declared_size_bytes::text,
           declared_sha256,
           actual_sha256,
           object_key,
           storage_provider,
           status,
           malware_status,
           intent_expires_at::text,
           created_at::text
         from public.document_uploads
         where household_id = $1
         order by created_at desc, id`,
        [householdId],
      );

      return result.rows.map((row) => ({
        id: row.id,
        householdId,
        personId: row.owner_person_id,
        documentType: row.document_type,
        file: {
          name: row.original_filename,
          mimeType: row.declared_mime_type,
          sizeBytes: Number(row.declared_size_bytes),
          declaredSha256: row.declared_sha256,
          hashVerification: row.actual_sha256 ? 'verified' : 'pending',
        },
        quarantine: {
          status: row.status,
          malwareStatus: row.malware_status,
        },
        storage: {
          provider: row.storage_provider,
          configured: row.storage_provider !== 'unconfigured',
          objectKey: row.object_key,
        },
        expiresAt: row.intent_expires_at,
        createdAt: row.created_at,
      }));
    });
  }
}
