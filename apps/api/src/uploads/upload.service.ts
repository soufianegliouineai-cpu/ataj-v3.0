import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { LifeOSIdentity } from '../auth/auth.types.js';
import { DatabaseService } from '../database/database.service.js';
import {
  MalwareScannerError,
  MalwareScannerService,
} from '../scanning/malware-scanner.service.js';
import { ObjectStorageService } from '../storage/object-storage.service.js';
import type { AllowedUploadMimeType, CreateUploadIntentDto } from './upload.dto.js';

const EXTENSION_BY_MIME: Record<AllowedUploadMimeType, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
};

interface UploadRow {
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
  storage_etag: string | null;
  intent_expires_at: string;
  uploaded_at: string | null;
  created_at: string;
}

@Injectable()
export class UploadService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: ObjectStorageService,
    private readonly scanner: MalwareScannerService,
  ) {}

  get enabled() {
    return this.database.enabled;
  }

  get transportConfigured() {
    return this.storage.configured;
  }

  get scannerConfigured() {
    return this.scanner.configured;
  }

  async createIntent(
    identity: LifeOSIdentity,
    householdId: string,
    input: CreateUploadIntentDto,
    requestId: string,
  ) {
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

    const storageProvider = this.storage.configured
      ? this.storage.capability.provider
      : 'unconfigured';
    const initialStatus = this.storage.configured ? 'uploading' : 'intent_created';

    const row = await this.database.withUserTransaction(identity.userId, async (client) => {
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

      const result = await client.query<UploadRow>(
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
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'pending')
         returning
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
           storage_etag,
           intent_expires_at::text,
           uploaded_at::text,
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
          storageProvider,
          initialStatus,
        ],
      );

      const created = result.rows[0];
      if (!created) throw new Error('Failed to create document upload intent');

      await client.query(
        `insert into public.audit_logs(
           household_id, actor_user_id, action, entity_type, entity_id, request_id, metadata
         )
         values ($1,$2,'document_upload.intent_created','document_upload',$3,$4,$5::jsonb)`,
        [
          householdId,
          identity.userId,
          created.id,
          requestId,
          JSON.stringify({
            documentType: input.documentType,
            mimeType: input.mimeType,
            sizeBytes: input.sizeBytes,
            sha256Declared: Boolean(input.sha256),
            storageProvider,
            byteTransportConfigured: this.storage.configured,
          }),
        ],
      );

      return created;
    });

    const transport = await this.storage.createUploadTransport(row.object_key, input.mimeType);

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
        ...transport,
        objectKey: row.object_key,
      },
      expiresAt: row.intent_expires_at,
      createdAt: row.created_at,
    };
  }

  async finalize(
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

    const upload = await this.database.withUserTransaction(identity.userId, async (client) => {
      await this.requireHousehold(client, householdId);

      const result = await client.query<UploadRow>(
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
           storage_etag,
           intent_expires_at::text,
           uploaded_at::text,
           created_at::text
         from public.document_uploads
         where id = $1 and household_id = $2`,
        [uploadId, householdId],
      );

      const row = result.rows[0];
      if (!row) {
        throw new NotFoundException({
          code: 'UPLOAD_NOT_FOUND',
          message: 'Upload was not found.',
        });
      }

      if (
        new Date(row.intent_expires_at).getTime() < Date.now()
        && ['intent_created', 'uploading'].includes(row.status)
      ) {
        await client.query(
          `update public.document_uploads
           set status='expired', updated_at=now()
           where id=$1`,
          [row.id],
        );
        throw new ConflictException({
          code: 'UPLOAD_INTENT_EXPIRED',
          message: 'Upload authorization expired. Create a new upload intent.',
        });
      }

      return row;
    });

    const stored = await this.storage.statObject(upload.object_key);
    if (!stored) {
      throw new ConflictException({
        code: 'UPLOAD_BYTES_NOT_FOUND',
        message: 'Uploaded bytes were not found in object storage.',
      });
    }

    const expectedSize = Number(upload.declared_size_bytes);
    const sizeMatches = stored.sizeBytes === expectedSize;
    const mimeMatches = stored.contentType === upload.declared_mime_type;

    if (!sizeMatches || !mimeMatches) {
      await this.database.withUserTransaction(identity.userId, async (client) => {
        await client.query(
          `update public.document_uploads
           set status='rejected',
               actual_size_bytes=$2,
               storage_etag=$3,
               uploaded_at=coalesce(uploaded_at, now()),
               updated_at=now()
           where id=$1 and household_id=$4`,
          [upload.id, stored.sizeBytes, stored.etag, householdId],
        );

        await client.query(
          `insert into public.audit_logs(
             household_id, actor_user_id, action, entity_type, entity_id, request_id, metadata
           )
           values ($1,$2,'document_upload.rejected','document_upload',$3,$4,$5::jsonb)`,
          [
            householdId,
            identity.userId,
            upload.id,
            requestId,
            JSON.stringify({
              reason: !sizeMatches ? 'size_mismatch' : 'mime_mismatch',
              expectedSize,
              actualSize: stored.sizeBytes,
              expectedMimeType: upload.declared_mime_type,
              actualMimeType: stored.contentType,
            }),
          ],
        );
      });

      throw new ConflictException({
        code: !sizeMatches ? 'UPLOAD_SIZE_MISMATCH' : 'UPLOAD_MIME_MISMATCH',
        message: !sizeMatches
          ? 'Stored object size does not match the declared upload size.'
          : 'Stored object content type does not match the declared MIME type.',
      });
    }

    const finalized = await this.database.withUserTransaction(identity.userId, async (client) => {
      const result = await client.query<{
        status: string;
        malware_status: string;
        uploaded_at: string;
        actual_size_bytes: string;
        storage_etag: string | null;
      }>(
        `update public.document_uploads
         set status = case
               when status in ('intent_created','uploading') then 'quarantined'
               else status
             end,
             storage_provider=$2,
             actual_size_bytes=$3,
             storage_etag=$4,
             uploaded_at=coalesce(uploaded_at, now()),
             updated_at=now()
         where id=$1 and household_id=$5
         returning status, malware_status, uploaded_at::text,
                   actual_size_bytes::text, storage_etag`,
        [upload.id, stored.provider, stored.sizeBytes, stored.etag, householdId],
      );

      const row = result.rows[0];
      if (!row) throw new Error('Failed to finalize document upload');

      await client.query(
        `insert into public.audit_logs(
           household_id, actor_user_id, action, entity_type, entity_id, request_id, metadata
         )
         values ($1,$2,'document_upload.finalized','document_upload',$3,$4,$5::jsonb)`,
        [
          householdId,
          identity.userId,
          upload.id,
          requestId,
          JSON.stringify({
            objectKey: upload.object_key,
            sizeBytes: stored.sizeBytes,
            contentType: stored.contentType,
            etag: stored.etag,
            hashVerification: 'pending_scan',
          }),
        ],
      );

      return row;
    });

    return {
      id: upload.id,
      householdId,
      status: finalized.status,
      quarantine: {
        status: finalized.status,
        malwareStatus: finalized.malware_status,
        requiredBeforeProcessing: true,
      },
      file: {
        name: upload.original_filename,
        mimeType: upload.declared_mime_type,
        sizeBytes: Number(finalized.actual_size_bytes),
        declaredSha256: upload.declared_sha256,
        actualSha256: upload.actual_sha256,
        hashVerification: upload.actual_sha256 ? 'verified' : 'pending_scan',
      },
      storage: {
        provider: stored.provider,
        objectKey: stored.objectKey,
        etag: finalized.storage_etag,
        lastModified: stored.lastModified,
      },
      uploadedAt: finalized.uploaded_at,
    };
  }

  async scan(
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

    if (!this.scanner.configured) {
      throw new ServiceUnavailableException({
        code: 'MALWARE_SCANNER_NOT_CONFIGURED',
        message: 'Malware scanning is not configured for this deployment.',
      });
    }

    const claimed = await this.database.withUserTransaction(identity.userId, async (client) => {
      await this.requireHousehold(client, householdId);

      const result = await client.query<UploadRow>(
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
           storage_etag,
           intent_expires_at::text,
           uploaded_at::text,
           created_at::text
         from public.document_uploads
         where id=$1 and household_id=$2`,
        [uploadId, householdId],
      );

      const row = result.rows[0];
      if (!row) {
        throw new NotFoundException({
          code: 'UPLOAD_NOT_FOUND',
          message: 'Upload was not found.',
        });
      }

      if (row.status === 'clean' && row.malware_status === 'clean' && row.actual_sha256) {
        return { replayed: true as const, row };
      }

      if (row.status !== 'quarantined' || row.malware_status !== 'pending') {
        throw new ConflictException({
          code: 'UPLOAD_NOT_READY_FOR_SCAN',
          message: 'Only quarantined uploads with a pending malware status can be scanned.',
          details: {
            status: row.status,
            malwareStatus: row.malware_status,
          },
        });
      }

      const updated = await client.query<UploadRow>(
        `update public.document_uploads
         set status='scanning', updated_at=now()
         where id=$1
           and household_id=$2
           and status='quarantined'
           and malware_status='pending'
         returning
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
           storage_etag,
           intent_expires_at::text,
           uploaded_at::text,
           created_at::text`,
        [uploadId, householdId],
      );

      const locked = updated.rows[0];
      if (!locked) {
        throw new ConflictException({
          code: 'UPLOAD_SCAN_ALREADY_STARTED',
          message: 'This upload is already being scanned or changed state.',
        });
      }

      await client.query(
        `insert into public.audit_logs(
           household_id, actor_user_id, action, entity_type, entity_id, request_id, metadata
         )
         values ($1,$2,'document_upload.scan_started','document_upload',$3,$4,$5::jsonb)`,
        [
          householdId,
          identity.userId,
          uploadId,
          requestId,
          JSON.stringify({
            scanner: this.scanner.capability.provider,
            objectKey: locked.object_key,
          }),
        ],
      );

      return { replayed: false as const, row: locked };
    });

    if (claimed.replayed) {
      return {
        id: claimed.row.id,
        householdId,
        replayed: true,
        status: claimed.row.status,
        malwareStatus: claimed.row.malware_status,
        actualSha256: claimed.row.actual_sha256,
        sizeBytes: Number(claimed.row.declared_size_bytes),
        signature: null,
      };
    }

    try {
      const source = await this.storage.openReadStream(claimed.row.object_key);
      const scan = await this.scanner.scan(source.stream);

      const declaredSize = Number(claimed.row.declared_size_bytes);
      if (scan.sizeBytes !== declaredSize) {
        await this.persistRejectedScan(
          identity,
          householdId,
          claimed.row,
          requestId,
          scan,
          'stream_size_mismatch',
        );

        throw new ConflictException({
          code: 'UPLOAD_STREAM_SIZE_MISMATCH',
          message: 'Scanned byte count does not match the declared upload size.',
        });
      }

      if (scan.status === 'infected') {
        await this.persistRejectedScan(
          identity,
          householdId,
          claimed.row,
          requestId,
          scan,
          'malware_detected',
        );

        throw new ConflictException({
          code: 'MALWARE_DETECTED',
          message: 'The uploaded file was rejected by malware scanning.',
          details: { signature: scan.signature },
        });
      }

      if (
        claimed.row.declared_sha256
        && claimed.row.declared_sha256.toLowerCase() !== scan.sha256
      ) {
        await this.persistRejectedScan(
          identity,
          householdId,
          claimed.row,
          requestId,
          scan,
          'sha256_mismatch',
        );

        throw new ConflictException({
          code: 'UPLOAD_SHA256_MISMATCH',
          message: 'Uploaded bytes do not match the declared SHA-256 digest.',
        });
      }

      const clean = await this.database.withUserTransaction(identity.userId, async (client) => {
        const result = await client.query<{
          status: string;
          malware_status: string;
          actual_sha256: string;
          actual_size_bytes: string;
          scan_completed_at: string;
        }>(
          `update public.document_uploads
           set status='clean',
               malware_status='clean',
               actual_sha256=$2,
               actual_size_bytes=$3,
               scan_completed_at=now(),
               updated_at=now()
           where id=$1 and household_id=$4 and status='scanning'
           returning status, malware_status, actual_sha256,
                     actual_size_bytes::text, scan_completed_at::text`,
          [uploadId, scan.sha256, scan.sizeBytes, householdId],
        );

        const row = result.rows[0];
        if (!row) {
          throw new ConflictException({
            code: 'UPLOAD_SCAN_STATE_CHANGED',
            message: 'Upload state changed before the scan result could be saved.',
          });
        }

        await client.query(
          `insert into public.audit_logs(
             household_id, actor_user_id, action, entity_type, entity_id, request_id, metadata
           )
           values ($1,$2,'document_upload.scan_completed','document_upload',$3,$4,$5::jsonb)`,
          [
            householdId,
            identity.userId,
            uploadId,
            requestId,
            JSON.stringify({
              status: 'clean',
              scanner: this.scanner.capability.provider,
              sha256: scan.sha256,
              sizeBytes: scan.sizeBytes,
            }),
          ],
        );

        return row;
      });

      return {
        id: uploadId,
        householdId,
        replayed: false,
        status: clean.status,
        malwareStatus: clean.malware_status,
        actualSha256: clean.actual_sha256,
        sizeBytes: Number(clean.actual_size_bytes),
        signature: null,
        scanCompletedAt: clean.scan_completed_at,
      };
    } catch (error) {
      if (error instanceof ConflictException) throw error;

      const scannerCode = error instanceof MalwareScannerError
        ? error.scannerCode
        : 'UPLOAD_SCAN_PIPELINE_ERROR';

      await this.database.withUserTransaction(identity.userId, async (client) => {
        await client.query(
          `update public.document_uploads
           set status='failed',
               malware_status='error',
               scan_completed_at=now(),
               updated_at=now()
           where id=$1 and household_id=$2 and status='scanning'`,
          [uploadId, householdId],
        );

        await client.query(
          `insert into public.audit_logs(
             household_id, actor_user_id, action, entity_type, entity_id, request_id, metadata
           )
           values ($1,$2,'document_upload.scan_failed','document_upload',$3,$4,$5::jsonb)`,
          [
            householdId,
            identity.userId,
            uploadId,
            requestId,
            JSON.stringify({
              scanner: this.scanner.capability.provider,
              code: scannerCode,
            }),
          ],
        );
      });

      throw new ServiceUnavailableException({
        code: 'MALWARE_SCAN_FAILED',
        message: 'The upload could not be malware scanned.',
      });
    }
  }

  private async persistRejectedScan(
    identity: LifeOSIdentity,
    householdId: string,
    upload: UploadRow,
    requestId: string,
    scan: {
      status: 'clean' | 'infected';
      sha256: string;
      sizeBytes: number;
      signature: string | null;
    },
    reason: string,
  ) {
    await this.database.withUserTransaction(identity.userId, async (client) => {
      await client.query(
        `update public.document_uploads
         set status='rejected',
             malware_status=$2,
             actual_sha256=$3,
             actual_size_bytes=$4,
             scan_completed_at=now(),
             updated_at=now()
         where id=$1 and household_id=$5 and status='scanning'`,
        [
          upload.id,
          scan.status === 'infected' ? 'infected' : 'clean',
          scan.sha256,
          scan.sizeBytes,
          householdId,
        ],
      );

      await client.query(
        `insert into public.audit_logs(
           household_id, actor_user_id, action, entity_type, entity_id, request_id, metadata
         )
         values ($1,$2,'document_upload.rejected','document_upload',$3,$4,$5::jsonb)`,
        [
          householdId,
          identity.userId,
          upload.id,
          requestId,
          JSON.stringify({
            reason,
            scanner: this.scanner.capability.provider,
            malwareStatus: scan.status,
            signature: scan.signature,
            sha256: scan.sha256,
            sizeBytes: scan.sizeBytes,
          }),
        ],
      );
    });
  }

  async list(identity: LifeOSIdentity, householdId: string) {
    return this.database.withUserTransaction(identity.userId, async (client) => {
      await this.requireHousehold(client, householdId);

      const result = await client.query<UploadRow>(
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
           storage_etag,
           intent_expires_at::text,
           uploaded_at::text,
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
          actualSha256: row.actual_sha256,
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
          etag: row.storage_etag,
        },
        expiresAt: row.intent_expires_at,
        uploadedAt: row.uploaded_at,
        createdAt: row.created_at,
      }));
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
}
