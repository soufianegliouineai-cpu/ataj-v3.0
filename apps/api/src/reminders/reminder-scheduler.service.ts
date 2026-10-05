import { Injectable } from '@nestjs/common';
import { WorkerDatabaseService } from '../database/worker-database.service.js';

@Injectable()
export class ReminderSchedulerService {
  constructor(private readonly database: WorkerDatabaseService) {}

  get configured() {
    return this.database.enabled;
  }

  get capability() {
    return {
      configured: this.configured,
      delivery: 'outbox_only' as const,
      milestones: ['preparation', '30d', '7d', '1d', 'due', 'overdue'] as const,
    };
  }

  async runOnce() {
    if (!this.configured) {
      throw new Error('Reminder scheduler database is not configured.');
    }

    return this.database.withTransaction(async (client) => {
      const seeded = await client.query<{ id: string }>(`
        with active_deadlines as (
          select
            d.id as deadline_id,
            d.household_id,
            d.due_at,
            d.recommended_action_at,
            o.id as obligation_id,
            o.title as obligation_title,
            coalesce(task_user.user_id, o.created_by) as user_id
          from public.deadlines d
          join public.obligations o on o.id = d.obligation_id
          left join lateral (
            select coalesce(t.assigned_to_user_id, t.created_by) as user_id
            from public.tasks t
            where t.deadline_id = d.id
              and t.status not in ('completed','cancelled')
            order by t.created_at, t.id
            limit 1
          ) task_user on true
          where d.status not in ('completed','archived')
            and o.status not in ('completed','archived')
            and coalesce(task_user.user_id, o.created_by) is not null
        ),
        future_slots as (
          select
            a.deadline_id,
            a.household_id,
            a.user_id,
            slot.reminder_kind,
            slot.scheduled_on
          from active_deadlines a
          cross join lateral (
            values
              ('preparation'::text, a.recommended_action_at),
              ('30d'::text, a.due_at - 30),
              ('7d'::text, a.due_at - 7),
              ('1d'::text, a.due_at - 1),
              ('due'::text, a.due_at)
          ) slot(reminder_kind, scheduled_on)
          where a.due_at >= current_date
            and slot.scheduled_on is not null
            and slot.scheduled_on >= current_date
            and (
              slot.reminder_kind = 'preparation'
              or a.recommended_action_at is null
              or slot.scheduled_on <> a.recommended_action_at
            )
        ),
        overdue_slots as (
          select
            a.deadline_id,
            a.household_id,
            a.user_id,
            'overdue'::text as reminder_kind,
            current_date as scheduled_on
          from active_deadlines a
          where a.due_at < current_date
        ),
        desired as (
          select * from future_slots
          union all
          select * from overdue_slots
        )
        insert into public.deadline_reminders(
          household_id,
          deadline_id,
          user_id,
          reminder_kind,
          scheduled_on
        )
        select
          household_id,
          deadline_id,
          user_id,
          reminder_kind,
          scheduled_on
        from desired
        on conflict (deadline_id, user_id, reminder_kind) do nothing
        returning id
      `);

      const enqueued = await client.query<{ id: string }>(`
        with due as (
          update public.deadline_reminders
          set status='ready',
              ready_at=coalesce(ready_at, now()),
              updated_at=now()
          where status='scheduled'
            and scheduled_on <= current_date
          returning id, household_id, deadline_id, user_id, reminder_kind, scheduled_on
        ),
        enriched as (
          select
            due.*,
            d.due_at,
            d.recommended_action_at,
            o.id as obligation_id,
            o.title as obligation_title
          from due
          join public.deadlines d on d.id = due.deadline_id
          join public.obligations o on o.id = d.obligation_id
        )
        insert into public.notification_outbox(
          reminder_id,
          household_id,
          user_id,
          event_type,
          channel,
          dedupe_key,
          payload,
          available_at
        )
        select
          e.id,
          e.household_id,
          e.user_id,
          'deadline_reminder',
          'in_app',
          'deadline:' || e.deadline_id::text || ':user:' || e.user_id::text || ':kind:' || e.reminder_kind,
          jsonb_build_object(
            'reminderId', e.id,
            'kind', e.reminder_kind,
            'deadlineId', e.deadline_id,
            'obligationId', e.obligation_id,
            'title', e.obligation_title,
            'scheduledOn', e.scheduled_on,
            'dueAt', e.due_at,
            'recommendedActionAt', e.recommended_action_at
          ),
          now()
        from enriched e
        on conflict (dedupe_key) do nothing
        returning id
      `);

      return {
        seeded: seeded.rowCount ?? 0,
        enqueued: enqueued.rowCount ?? 0,
      };
    });
  }
}
