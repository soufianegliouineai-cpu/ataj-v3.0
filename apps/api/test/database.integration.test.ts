import 'reflect-metadata';
import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { DatabaseService } from '../src/database/database.service.js';
import { ProtectionRepository } from '../src/protection/protection.repository.js';
import { ProtectionService } from '../src/protection/protection.service.js';

const enabled = Boolean(process.env.DATABASE_URL);

let app: INestApplication;
let database: DatabaseService;
let repository: ProtectionRepository;
let protection: ProtectionService;

const ownerId = '00000000-0000-0000-0000-000000000011';
const outsiderId = '00000000-0000-0000-0000-000000000012';
const householdId = '10000000-0000-0000-0000-000000000011';
const personId = '20000000-0000-0000-0000-000000000011';

before(async () => {
  if (!enabled) return;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  await app.init();

  database = app.get(DatabaseService);
  repository = app.get(ProtectionRepository);
  protection = app.get(ProtectionService);
});

after(async () => {
  if (app) await app.close();
});

test('database transaction sets the expected RLS identity and household membership', { skip: !enabled }, async () => {
  const context = await database.withUserTransaction(ownerId, async (client) => {
    const result = await client.query<{
      db_user: string;
      setting: string | null;
      current_user_id: string | null;
      is_member: boolean;
      membership_rows: number;
    }>(`
      select
        current_user::text as db_user,
        current_setting('lifeos.user_id', true) as setting,
        private.current_user_id()::text as current_user_id,
        private.is_household_member($1)::boolean as is_member,
        (select count(*)::int from public.household_members where household_id=$1) as membership_rows
    `, [householdId]);
    return result.rows[0];
  });

  assert.equal(context?.db_user, 'lifeos_app');
  assert.equal(context?.setting, ownerId);
  assert.equal(context?.current_user_id, ownerId);
  assert.equal(context?.is_member, true);
  assert.equal(context?.membership_rows, 1);
});

test('PostgreSQL persistence creates the full protection graph atomically', { skip: !enabled }, async () => {
  assert.equal(database.enabled, true);
  const result = protection.protect('passport', '2028-06-12', 90, 'db-integration-atomic');

  const persisted = await repository.persistExpiryProtection({
    userId: ownerId,
    householdId,
    personId,
    documentType: 'passport',
    expiryDate: '2028-06-12',
    leadDays: 90,
    idempotencyKey: 'db-integration-atomic',
    requestId: 'integration-atomic',
    result,
  });

  assert.equal(persisted.replayed, false);
  assert.equal(persisted.statusCode, 201);
  const ids = (persisted.data as typeof persisted.data & {
    persistence: { documentId: string; obligationId: string; deadlineId: string; taskId: string };
  }).persistence;

  assert.ok(ids.documentId);
  assert.ok(ids.obligationId);
  assert.ok(ids.deadlineId);
  assert.ok(ids.taskId);

  const counts = await database.withUserTransaction(ownerId, async (client) => {
    const [documents, facts, obligations, deadlines, tasks, audit] = await Promise.all([
      client.query('select count(*)::int as count from public.documents where id=$1', [ids.documentId]),
      client.query('select count(*)::int as count from public.document_facts where document_id=$1', [ids.documentId]),
      client.query('select count(*)::int as count from public.obligations where id=$1', [ids.obligationId]),
      client.query('select count(*)::int as count from public.deadlines where id=$1', [ids.deadlineId]),
      client.query('select count(*)::int as count from public.tasks where id=$1', [ids.taskId]),
      client.query("select count(*)::int as count from public.audit_logs where request_id='integration-atomic'"),
    ]);
    return [documents, facts, obligations, deadlines, tasks, audit].map((item) => item.rows[0]?.count ?? 0);
  });

  assert.deepEqual(counts, [1, 1, 1, 1, 1, 1]);
});

test('idempotent replay returns the persisted graph without duplicating rows', { skip: !enabled }, async () => {
  const result = protection.protect('driving_license', '2028-08-20', 60, 'db-integration-replay');
  const input = {
    userId: ownerId,
    householdId,
    personId,
    documentType: 'driving_license' as const,
    expiryDate: '2028-08-20',
    leadDays: 60,
    idempotencyKey: 'db-integration-replay',
    requestId: 'integration-replay',
    result,
  };

  const first = await repository.persistExpiryProtection(input);
  const replay = await repository.persistExpiryProtection(input);

  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.data, first.data);

  const documentId = (first.data as typeof first.data & {
    persistence: { documentId: string };
  }).persistence.documentId;

  const count = await database.withUserTransaction(ownerId, async (client) => {
    const rows = await client.query(
      'select count(*)::int as count from public.documents where id=$1',
      [documentId],
    );
    return rows.rows[0]?.count ?? 0;
  });

  assert.equal(count, 1);
});

test('reusing an idempotency key with a different request is rejected', { skip: !enabled }, async () => {
  const first = protection.protect('visa', '2028-04-01', 45, 'db-integration-conflict');

  await repository.persistExpiryProtection({
    userId: ownerId,
    householdId,
    personId,
    documentType: 'visa',
    expiryDate: '2028-04-01',
    leadDays: 45,
    idempotencyKey: 'db-integration-conflict',
    requestId: 'integration-conflict-a',
    result: first,
  });

  const second = protection.protect('visa', '2028-05-01', 45, 'db-integration-conflict');

  await assert.rejects(
    () => repository.persistExpiryProtection({
      userId: ownerId,
      householdId,
      personId,
      documentType: 'visa',
      expiryDate: '2028-05-01',
      leadDays: 45,
      idempotencyKey: 'db-integration-conflict',
      requestId: 'integration-conflict-b',
      result: second,
    }),
    (error: unknown) => {
      const value = error as { getResponse?: () => unknown };
      const response = value.getResponse?.() as { code?: string } | undefined;
      return response?.code === 'IDEMPOTENCY_KEY_REUSED';
    },
  );
});

test('RLS prevents an outsider from persisting into another household', { skip: !enabled }, async () => {
  const result = protection.protect('insurance', '2028-03-15', 30, 'db-integration-outsider');

  await assert.rejects(
    () => repository.persistExpiryProtection({
      userId: outsiderId,
      householdId,
      personId: null,
      documentType: 'insurance',
      expiryDate: '2028-03-15',
      leadDays: 30,
      idempotencyKey: 'db-integration-outsider',
      requestId: 'integration-outsider',
      result,
    }),
    (error: unknown) => {
      const value = error as { code?: string };
      return value.code === '42501';
    },
  );

  const idempotencyRows = await database.withUserTransaction(outsiderId, async (client) => {
    const rows = await client.query(
      'select count(*)::int as count from public.idempotency_records where key=$1',
      ['db-integration-outsider'],
    );
    return rows.rows[0]?.count ?? 0;
  });

  assert.equal(idempotencyRows, 0, 'failed graph transaction must roll back idempotency placeholder too');
});
