import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { WorkerDatabaseService } from '../database/worker-database.service.js';

interface ClaimedNotification {
  id: string;
  reminder_id: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
}

@Injectable()
export class NotificationDispatcherService {
  private readonly workerId = process.env.NOTIFICATION_WORKER_ID?.trim() || randomUUID();
  private readonly leaseSeconds = parseBoundedInt(
    process.env.NOTIFICATION_LEASE_SECONDS,
    60,
    5,
    900,
  );
  private readonly batchSize = parseBoundedInt(
    process.env.NOTIFICATION_BATCH_SIZE,
    25,
    1,
    100,
  );

  constructor(private readonly database: WorkerDatabaseService) {}

  get configured() {
    return this.database.enabled;
  }

  get capability() {
    return {
      configured: this.configured,
      inApp: this.configured ? 'ready' as const : 'not_configured' as const,
      push: 'not_configured' as const,
      email: 'not_configured' as const,
      leaseSeconds: this.leaseSeconds,
      batchSize: this.batchSize,
    };
  }

  async runOnce() {
    if (!this.configured) {
      throw new Error('Notification dispatcher database is not configured.');
    }

    const recovered = await this.recoverExpiredLeases();
    const claimed = await this.claimInAppBatch();
    let sent = 0;

    for (const item of claimed) {
      if (await this.markInAppSent(item)) {
        sent += 1;
      }
    }

    return {
      recovered,
      claimed: claimed.length,
      sent,
    };
  }

  private async recoverExpiredLeases() {
    return this.database.withTransaction(async (client) => {
      const recovered = await client.query<{ id: string }>(`
        update public.notification_outbox
        set status = case when attempts >= max_attempts then 'cancelled' else 'failed' end,
            available_at = case
              when attempts >= max_attempts then available_at
              else now() + make_interval(secs => least(300, greatest(5, attempts * 10)))
            end,
            lease_owner = null,
            lease_expires_at = null,
            last_error_code = case
              when attempts >= max_attempts then 'LEASE_EXHAUSTED'
              else 'LEASE_EXPIRED'
            end,
            last_error_message = 'Notification delivery lease expired before acknowledgement.',
            updated_at = now()
        where status='leased'
          and lease_expires_at is not null
          and lease_expires_at <= now()
        returning id
      `);

      return recovered.rowCount ?? 0;
    });
  }

  private async claimInAppBatch(): Promise<ClaimedNotification[]> {
    return this.database.withTransaction(async (client) => {
      const result = await client.query<ClaimedNotification>(`
        with candidates as (
          select id
          from public.notification_outbox
          where channel='in_app'
            and status in ('pending','failed')
            and available_at <= now()
            and attempts < max_attempts
          order by available_at, created_at, id
          for update skip locked
          limit $1
        )
        update public.notification_outbox o
        set status='leased',
            lease_owner=$2,
            lease_expires_at=now() + make_interval(secs => $3),
            attempts=o.attempts + 1,
            last_error_code=null,
            last_error_message=null,
            updated_at=now()
        from candidates c
        where o.id=c.id
        returning o.id,o.reminder_id,o.payload,o.attempts,o.max_attempts
      `, [this.batchSize, this.workerId, this.leaseSeconds]);

      return result.rows;
    });
  }

  private async markInAppSent(item: ClaimedNotification) {
    return this.database.withTransaction(async (client) => {
      const sent = await client.query<{ reminder_id: string }>(`
        update public.notification_outbox
        set status='sent',
            sent_at=coalesce(sent_at, now()),
            lease_owner=null,
            lease_expires_at=null,
            updated_at=now()
        where id=$1
          and status='leased'
          and lease_owner=$2
        returning reminder_id
      `, [item.id, this.workerId]);

      const row = sent.rows[0];
      if (!row) return false;

      await client.query(`
        update public.deadline_reminders
        set status='dispatched',
            dispatched_at=coalesce(dispatched_at, now()),
            updated_at=now()
        where id=$1
          and status='ready'
      `, [row.reminder_id]);

      return true;
    });
  }
}

function parseBoundedInt(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
