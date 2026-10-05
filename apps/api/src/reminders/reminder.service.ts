import { Injectable } from '@nestjs/common';
import type { LifeOSIdentity } from '../auth/auth.types.js';
import { DatabaseService } from '../database/database.service.js';

@Injectable()
export class ReminderService {
  constructor(private readonly database: DatabaseService) {}

  get enabled() {
    return this.database.enabled;
  }

  async list(identity: LifeOSIdentity) {
    return this.database.withUserTransaction(identity.userId, async (client) => {
      const result = await client.query<{
        id: string;
        household_id: string;
        deadline_id: string;
        reminder_kind: string;
        scheduled_on: string;
        status: string;
        ready_at: string | null;
        dispatched_at: string | null;
        due_at: string;
        recommended_action_at: string | null;
        obligation_id: string;
        obligation_title: string;
        outbox_status: string | null;
        channel: string | null;
      }>(`
        select
          r.id,
          r.household_id,
          r.deadline_id,
          r.reminder_kind,
          r.scheduled_on::text,
          r.status,
          r.ready_at::text,
          r.dispatched_at::text,
          d.due_at::text,
          d.recommended_action_at::text,
          o.id as obligation_id,
          o.title as obligation_title,
          n.status as outbox_status,
          n.channel
        from public.deadline_reminders r
        join public.deadlines d on d.id = r.deadline_id
        join public.obligations o on o.id = d.obligation_id
        left join public.notification_outbox n on n.reminder_id = r.id
        where r.status <> 'cancelled'
        order by
          case when r.status='ready' then 0 else 1 end,
          r.scheduled_on,
          r.created_at,
          r.id
      `);

      return result.rows.map((row) => ({
        id: row.id,
        householdId: row.household_id,
        deadlineId: row.deadline_id,
        obligation: {
          id: row.obligation_id,
          title: row.obligation_title,
        },
        kind: row.reminder_kind,
        scheduledOn: row.scheduled_on,
        status: row.status,
        readyAt: row.ready_at,
        dispatchedAt: row.dispatched_at,
        dueAt: row.due_at,
        recommendedActionAt: row.recommended_action_at,
        delivery: row.outbox_status
          ? { channel: row.channel, status: row.outbox_status }
          : null,
      }));
    });
  }
}
