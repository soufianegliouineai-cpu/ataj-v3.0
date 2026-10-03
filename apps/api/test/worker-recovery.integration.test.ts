import 'reflect-metadata';
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { Pool } from 'pg';
import { WorkerDatabaseService } from '../src/database/worker-database.service.js';
import { DocumentProcessingWorkerService } from '../src/processing/document-processing-worker.service.js';
import type { DocumentIntelligenceService } from '../src/ocr/document-intelligence.service.js';
import type { ObjectStorageService } from '../src/storage/object-storage.service.js';

const enabled = Boolean(process.env.DATABASE_URL);
const pool = enabled ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
const workerDatabases: WorkerDatabaseService[] = [];

const requeueUser = '00000000-0000-4000-8000-000000000301';
const requeueHousehold = '10000000-0000-4000-8000-000000000301';
const requeueUpload = '30000000-0000-4000-8000-000000000301';
const requeueJob = '40000000-0000-4000-8000-000000000301';

const exhaustUser = '00000000-0000-4000-8000-000000000302';
const exhaustHousehold = '10000000-0000-4000-8000-000000000302';
const exhaustUpload = '30000000-0000-4000-8000-000000000302';
const exhaustJob = '40000000-0000-4000-8000-000000000302';

after(async () => {
  await Promise.all(workerDatabases.map((database) => database.onModuleDestroy()));
  await pool?.end();
});

test('expired worker lease requeues a recoverable processing job with backoff', { skip: !enabled }, async () => {
  await seedExpiredRunningJob({
    userId: requeueUser,
    householdId: requeueHousehold,
    uploadId: requeueUpload,
    jobId: requeueJob,
    maxAttempts: 3,
  });

  const worker = createRecoveryWorker();
  const result = await worker.runOnce();

  assert.equal(result.claimed, false);
  assert.equal(result.status, 'idle');
  assert.equal(result.recovered.requeued, 1);
  assert.equal(result.recovered.exhausted, 0);

  const snapshot = await fetchSnapshot(requeueJob, requeueUpload);
  assert.equal(snapshot.job_status, 'queued');
  assert.equal(snapshot.attempt_count, 1);
  assert.equal(snapshot.last_error_code, 'WORKER_LEASE_EXPIRED');
  assert.equal(snapshot.lease_owner, null);
  assert.equal(snapshot.lease_expires_at, null);
  assert.equal(snapshot.upload_status, 'clean');
  assert.ok(new Date(snapshot.next_attempt_at).getTime() > Date.now());
});

test('expired worker lease becomes terminal after attempt budget is exhausted', { skip: !enabled }, async () => {
  await seedExpiredRunningJob({
    userId: exhaustUser,
    householdId: exhaustHousehold,
    uploadId: exhaustUpload,
    jobId: exhaustJob,
    maxAttempts: 1,
  });

  const worker = createRecoveryWorker();
  const result = await worker.runOnce();

  assert.equal(result.claimed, false);
  assert.equal(result.status, 'idle');
  assert.equal(result.recovered.requeued, 0);
  assert.equal(result.recovered.exhausted, 1);

  const snapshot = await fetchSnapshot(exhaustJob, exhaustUpload);
  assert.equal(snapshot.job_status, 'failed');
  assert.equal(snapshot.attempt_count, 1);
  assert.equal(snapshot.last_error_code, 'WORKER_LEASE_EXPIRED');
  assert.equal(snapshot.lease_owner, null);
  assert.equal(snapshot.lease_expires_at, null);
  assert.equal(snapshot.upload_status, 'failed');
});

function createRecoveryWorker() {
  if (!process.env.WORKER_DATABASE_URL && process.env.DATABASE_URL) {
    process.env.WORKER_DATABASE_URL = process.env.DATABASE_URL;
  }
  process.env.WORKER_RETRY_BASE_MS = '60000';

  const database = new WorkerDatabaseService();
  workerDatabases.push(database);

  const storage = {
    configured: true,
    openReadStream: async () => {
      throw new Error('recovered job must not be claimed before retry delay');
    },
  } as unknown as ObjectStorageService;

  const ocr = {
    configured: true,
    analyze: async () => {
      throw new Error('recovered job must not reach OCR before retry delay');
    },
  } as unknown as DocumentIntelligenceService;

  return new DocumentProcessingWorkerService(database, storage, ocr);
}

async function seedExpiredRunningJob(input: {
  userId: string;
  householdId: string;
  uploadId: string;
  jobId: string;
  maxAttempts: number;
}) {
  if (!pool) throw new Error('DATABASE_URL is required');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('lifeos.user_id', $1, true)", [input.userId]);

    await client.query(
      `insert into public.app_users(id,email,display_name)
       values ($1,$2,'Lease Recovery User')
       on conflict (id) do nothing`,
      [input.userId, `${input.userId}@lease.test`],
    );

    await client.query(
      `insert into public.households(id,name,created_by)
       values ($1,'Lease Recovery Household',$2)
       on conflict (id) do nothing`,
      [input.householdId, input.userId],
    );

    await client.query(
      `insert into public.household_members(household_id,user_id,role,status)
       values ($1,$2,'owner','active')
       on conflict (household_id,user_id) do update set role='owner',status='active'`,
      [input.householdId, input.userId],
    );

    await client.query(
      `insert into public.document_uploads(
         id,household_id,owner_user_id,document_type,original_filename,
         declared_mime_type,declared_size_bytes,declared_sha256,object_key,
         storage_provider,status,malware_status,actual_size_bytes,actual_sha256,
         uploaded_at,scan_completed_at
       ) values (
         $1,$2,$3,'passport','lease.pdf','application/pdf',1024,$4,$5,
         'azure_blob','clean','clean',1024,$4,now(),now()
       )`,
      [input.uploadId, input.householdId, input.userId, 'a'.repeat(64), `lease/${input.uploadId}.pdf`],
    );

    await client.query(
      `insert into public.document_processing_jobs(
         id,upload_id,household_id,owner_user_id,processor,status,max_attempts
       ) values ($1,$2,$3,$4,'azure_document_intelligence','queued',$5)`,
      [input.jobId, input.uploadId, input.householdId, input.userId, input.maxAttempts],
    );

    await client.query(
      `update public.document_processing_jobs
       set status='running',
           lease_owner='cccccccc-cccc-4ccc-8ccc-cccccccccccc',
           lease_expires_at=now() + interval '5 minutes'
       where id=$1`,
      [input.jobId],
    );

    await client.query(
      `update public.document_uploads set status='processing' where id=$1`,
      [input.uploadId],
    );

    await client.query(
      `update public.document_processing_jobs
       set lease_expires_at=now() - interval '1 second'
       where id=$1`,
      [input.jobId],
    );

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function fetchSnapshot(jobId: string, uploadId: string) {
  if (!pool) throw new Error('DATABASE_URL is required');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('set local role lifeos_worker');
    const result = await client.query<{
      job_status: string;
      attempt_count: number;
      last_error_code: string | null;
      lease_owner: string | null;
      lease_expires_at: string | null;
      next_attempt_at: string;
      upload_status: string;
    }>(
      `select
         j.status as job_status,
         j.attempt_count,
         j.last_error_code,
         j.lease_owner::text,
         j.lease_expires_at::text,
         j.next_attempt_at::text,
         u.status as upload_status
       from public.document_processing_jobs j
       join public.document_uploads u on u.id=j.upload_id
       where j.id=$1 and u.id=$2`,
      [jobId, uploadId],
    );
    await client.query('commit');

    const row = result.rows[0];
    if (!row) throw new Error('lease recovery fixture snapshot not found');
    return row;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
