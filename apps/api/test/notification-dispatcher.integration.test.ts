import 'reflect-metadata';
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { Pool } from 'pg';
import { WorkerDatabaseService } from '../src/database/worker-database.service.js';
import { NotificationDispatcherService } from '../src/reminders/notification-dispatcher.service.js';
import { ReminderSchedulerService } from '../src/reminders/reminder-scheduler.service.js';

const enabled = Boolean(process.env.DATABASE_URL);
const pool = enabled ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
const workerDatabases: WorkerDatabaseService[] = [];

const ownerId = '00000000-0000-4000-8000-000000000451';
const householdId = '10000000-0000-4000-8000-000000000451';
const obligationId = '50000000-0000-4000-8000-000000000451';
const deadlineId = '60000000-0000-4000-8000-000000000451';
const taskId = '70000000-0000-4000-8000-000000000451';

after(async () => {
  await Promise.all(workerDatabases.map((database) => database.onModuleDestroy()));
  await pool?.end();
});

test('two dispatchers cannot deliver the same in-app reminder twice', { skip: !enabled }, async () => {
  await seedDeadline();

  if (!process.env.WORKER_DATABASE_URL && process.env.DATABASE_URL) {
    process.env.WORKER_DATABASE_URL = process.env.DATABASE_URL;
  }

  const schedulerDb = new WorkerDatabaseService();
  const firstDb = new WorkerDatabaseService();
  const secondDb = new WorkerDatabaseService();
  workerDatabases.push(schedulerDb, firstDb, secondDb);

  const scheduler = new ReminderSchedulerService(schedulerDb);
  const seeded = await scheduler.runOnce();
  assert.equal(seeded.enqueued, 1);

  const first = new NotificationDispatcherService(firstDb);
  const second = new NotificationDispatcherService(secondDb);

  const [a, b] = await Promise.all([first.runOnce(), second.runOnce()]);
  assert.equal(a.sent + b.sent, 1, 'exactly one dispatcher must send the notification');
  assert.equal(a.claimed + b.claimed, 1, 'exactly one dispatcher must lease the notification');

  const snapshot = await readOwnerSnapshot();
  assert.equal(snapshot.outbox.length, 1);
  assert.equal(snapshot.outbox[0].status, 'sent');
  assert.equal(snapshot.outbox[0].attempts, 1);
  assert.ok(snapshot.outbox[0].sent_at);
  assert.equal(snapshot.reminders.length, 1);
  assert.equal(snapshot.reminders[0].status, 'dispatched');
  assert.ok(snapshot.reminders[0].dispatched_at);

  const replay = await first.runOnce();
  assert.equal(replay.claimed, 0);
  assert.equal(replay.sent, 0);
});

async function seedDeadline() {
  if (!pool) throw new Error('DATABASE_URL is required');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('lifeos.user_id', $1, true)", [ownerId]);

    await client.query(
      `insert into public.app_users(id,email,display_name)
       values ($1,'dispatcher-owner@example.test','Dispatcher Owner')
       on conflict (id) do nothing`,
      [ownerId],
    );
    await client.query(
      `insert into public.households(id,name,created_by)
       values ($1,'Dispatcher Household',$2)
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
       values ($1,$2,'EXPIRY_PROTECTION','Dispatcher passport expiry','protected',1,'generic_expiry_protection_v1',$3)
       on conflict (id) do nothing`,
      [obligationId, householdId, ownerId],
    );
    await client.query(
      `insert into public.deadlines(
         id,household_id,obligation_id,due_at,recommended_action_at,severity,status,source
       )
       values ($1,$2,$3,current_date + 1,current_date - 89,'critical','protected','test.dispatcher')
       on conflict (id) do nothing`,
      [deadlineId, householdId, obligationId],
    );
    await client.query(
      `insert into public.tasks(
         id,household_id,deadline_id,created_by,assigned_to_user_id,title,status,due_at
       )
       values ($1,$2,$3,$4,$4,'Prepare dispatcher passport','ready',current_date)
       on conflict (id) do nothing`,
      [taskId, householdId, deadlineId, ownerId],
    );

    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

async function readOwnerSnapshot() {
  if (!pool) throw new Error('DATABASE_URL is required');
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('lifeos.user_id', $1, true)", [ownerId]);
    const outbox = await client.query<{
      status: string;
      attempts: number;
      sent_at: string | null;
    }>(`
      select status,attempts,sent_at::text
      from public.notification_outbox
      where household_id=$1
      order by created_at,id
    `, [householdId]);
    const reminders = await client.query<{
      status: string;
      dispatched_at: string | null;
    }>(`
      select status,dispatched_at::text
      from public.deadline_reminders
      where household_id=$1 and reminder_kind='1d'
      order by created_at,id
    `, [householdId]);
    await client.query('commit');
    return { outbox: outbox.rows, reminders: reminders.rows };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
