import 'reflect-metadata';
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { Pool } from 'pg';
import { WorkerDatabaseService } from '../src/database/worker-database.service.js';
import { ReminderSchedulerService } from '../src/reminders/reminder-scheduler.service.js';

const enabled = Boolean(process.env.DATABASE_URL);
const pool = enabled ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
const workerDatabases: WorkerDatabaseService[] = [];

const ownerId = '00000000-0000-4000-8000-000000000401';
const outsiderId = '00000000-0000-4000-8000-000000000402';
const householdId = '10000000-0000-4000-8000-000000000401';
const obligationId = '50000000-0000-4000-8000-000000000401';
const deadlineId = '60000000-0000-4000-8000-000000000401';
const taskId = '70000000-0000-4000-8000-000000000401';

after(async () => {
  await Promise.all(workerDatabases.map((database) => database.onModuleDestroy()));
  await pool?.end();
});

test('scheduler seeds milestones, enqueues due reminders once, and completion cancels pending delivery', { skip: !enabled }, async () => {
  await seedDeadline();

  if (!process.env.WORKER_DATABASE_URL && process.env.DATABASE_URL) {
    process.env.WORKER_DATABASE_URL = process.env.DATABASE_URL;
  }

  const workerDatabase = new WorkerDatabaseService();
  workerDatabases.push(workerDatabase);
  const scheduler = new ReminderSchedulerService(workerDatabase);

  const first = await scheduler.runOnce();
  assert.ok(first.seeded >= 2, `expected reminder milestones, got ${first.seeded}`);
  assert.equal(first.enqueued, 1, 'the 1-day reminder should become due today');

  const second = await scheduler.runOnce();
  assert.equal(second.seeded, 0, 'scheduler seeding must be idempotent');
  assert.equal(second.enqueued, 0, 'outbox enqueue must be exactly-once');

  const beforeCompletion = await snapshotFor(ownerId);
  const oneDay = beforeCompletion.reminders.find((item) => item.reminder_kind === '1d');
  assert.ok(oneDay);
  assert.equal(oneDay.status, 'ready');
  assert.equal(beforeCompletion.outbox.length, 1);
  assert.equal(beforeCompletion.outbox[0].status, 'pending');
  assert.equal(beforeCompletion.outbox[0].channel, 'in_app');

  const outsider = await snapshotFor(outsiderId);
  assert.equal(outsider.reminders.length, 0, 'RLS must hide another user reminders');
  assert.equal(outsider.outbox.length, 0, 'RLS must hide another user notification outbox');

  await completeTask();

  const afterCompletion = await snapshotFor(ownerId, true);
  assert.ok(afterCompletion.reminders.length >= 2);
  assert.ok(afterCompletion.reminders.every((item) => item.status === 'cancelled'));
  assert.equal(afterCompletion.outbox.length, 1);
  assert.equal(afterCompletion.outbox[0].status, 'cancelled');
});

async function seedDeadline() {
  if (!pool) throw new Error('DATABASE_URL is required');
  const client = await pool.connect();
  try {
    await client.query('begin');

    await client.query("select set_config('lifeos.user_id', $1, true)", [ownerId]);
    await client.query(
      `insert into public.app_users(id,email,display_name)
       values ($1,'reminder-owner@example.test','Reminder Owner')
       on conflict (id) do nothing`,
      [ownerId],
    );
    await client.query(
      `insert into public.households(id,name,created_by)
       values ($1,'Reminder Household',$2)
       on conflict (id) do nothing`,
      [householdId, ownerId],
    );
    await client.query(
      `insert into public.household_members(household_id,user_id,role,status)
       values ($1,$2,'owner','active')
       on conflict (household_id,user_id) do update set role='owner',status='active'`,
      [householdId, ownerId],
    );
    await client.query(
      `insert into public.obligations(
         id,household_id,obligation_type,title,status,confidence,rule_code,created_by
       )
       values ($1,$2,'EXPIRY_PROTECTION','Reminder passport expiry','protected',1,'generic_expiry_protection_v1',$3)
       on conflict (id) do nothing`,
      [obligationId, householdId, ownerId],
    );
    await client.query(
      `insert into public.deadlines(
         id,household_id,obligation_id,due_at,recommended_action_at,severity,status,source
       )
       values ($1,$2,$3,current_date + 1,current_date - 89,'critical','protected','test.reminder')
       on conflict (id) do nothing`,
      [deadlineId, householdId, obligationId],
    );
    await client.query(
      `insert into public.tasks(
         id,household_id,deadline_id,created_by,assigned_to_user_id,title,status,due_at
       )
       values ($1,$2,$3,$4,$4,'Prepare reminder passport','ready',current_date)
       on conflict (id) do nothing`,
      [taskId, householdId, deadlineId, ownerId],
    );

    await client.query("select set_config('lifeos.user_id', $1, true)", [outsiderId]);
    await client.query(
      `insert into public.app_users(id,email,display_name)
       values ($1,'reminder-outsider@example.test','Reminder Outsider')
       on conflict (id) do nothing`,
      [outsiderId],
    );

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function snapshotFor(userId: string, includeCancelled = false) {
  if (!pool) throw new Error('DATABASE_URL is required');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('lifeos.user_id', $1, true)", [userId]);
    const reminders = await client.query<{
      reminder_kind: string;
      status: string;
      scheduled_on: string;
    }>(
      `select reminder_kind,status,scheduled_on::text
       from public.deadline_reminders
       ${includeCancelled ? '' : "where status <> 'cancelled'"}
       order by scheduled_on,reminder_kind`,
    );
    const outbox = await client.query<{ status: string; channel: string }>(
      `select status,channel from public.notification_outbox order by created_at,id`,
    );
    await client.query('commit');
    return { reminders: reminders.rows, outbox: outbox.rows };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function completeTask() {
  if (!pool) throw new Error('DATABASE_URL is required');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('lifeos.user_id', $1, true)", [ownerId]);
    const updated = await client.query(
      `update public.tasks
       set status='completed',completed_at=now()
       where id=$1`,
      [taskId],
    );
    assert.equal(updated.rowCount, 1);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
