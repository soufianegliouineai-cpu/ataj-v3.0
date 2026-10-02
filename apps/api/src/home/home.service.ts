import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

interface NextTaskRow {
  id: string;
  household_id: string;
  title: string;
  status: string;
  task_due_at: string | null;
  deadline_id: string | null;
  deadline_due_at: string | null;
  recommended_action_at: string | null;
  severity: string | null;
}

@Injectable()
export class HomeService {
  constructor(private readonly database: DatabaseService) {}

  get enabled() {
    return this.database.enabled;
  }

  async summary(userId: string) {
    return this.database.withUserTransaction(userId, async (client) => {
      const households = await client.query<{ count: number }>(
        'select count(*)::int as count from public.households',
      );

      const deadlines = await client.query<{
        total: number;
        overdue: number;
        action_due: number;
        protected: number;
      }>(
        `select
           count(*)::int as total,
           count(*) filter (where status = 'overdue' or severity = 'overdue')::int as overdue,
           count(*) filter (where status = 'action_due')::int as action_due,
           count(*) filter (where status = 'protected')::int as protected
         from public.deadlines`,
      );

      const obligations = await client.query<{
        active: number;
        completed: number;
      }>(
        `select
           count(*) filter (where status not in ('completed','archived'))::int as active,
           count(*) filter (where status = 'completed')::int as completed
         from public.obligations`,
      );

      const identityDocuments = await client.query<{ count: number }>(
        `select count(*)::int as count
         from public.documents
         where document_type in ('passport','identity_card')`,
      );

      const tasks = await client.query<NextTaskRow>(
        `select
           t.id,
           t.household_id,
           t.title,
           t.status,
           t.due_at::text as task_due_at,
           d.id as deadline_id,
           d.due_at::text as deadline_due_at,
           d.recommended_action_at::text,
           d.severity
         from public.tasks t
         left join public.deadlines d on d.id = t.deadline_id
         where t.status not in ('completed','cancelled')
         order by
           coalesce(d.recommended_action_at, t.due_at, d.due_at) nulls last,
           t.created_at,
           t.id
         limit 5`,
      );

      const deadlineCounts = deadlines.rows[0] ?? {
        total: 0,
        overdue: 0,
        action_due: 0,
        protected: 0,
      };
      const obligationCounts = obligations.rows[0] ?? { active: 0, completed: 0 };
      const next = tasks.rows[0] ?? null;

      const state = deadlineCounts.overdue > 0
        ? 'urgent'
        : deadlineCounts.action_due > 0
          ? 'needs_attention'
          : next
            ? 'upcoming'
            : 'calm';

      const message = state === 'urgent'
        ? `${deadlineCounts.overdue} overdue item${deadlineCounts.overdue === 1 ? '' : 's'} need attention`
        : state === 'needs_attention'
          ? `${deadlineCounts.action_due} item${deadlineCounts.action_due === 1 ? '' : 's'} need action`
          : state === 'upcoming'
            ? 'Your next protected action is ready'
            : 'Everything looks calm';

      return {
        status: { state, message },
        counts: {
          households: households.rows[0]?.count ?? 0,
          deadlines: deadlineCounts.total,
          protectedDeadlines: deadlineCounts.protected,
          overdueDeadlines: deadlineCounts.overdue,
          actionDueDeadlines: deadlineCounts.action_due,
          activeObligations: obligationCounts.active,
          completedObligations: obligationCounts.completed,
        },
        nextAction: next
          ? {
              taskId: next.id,
              householdId: next.household_id,
              title: next.title,
              status: next.status,
              dueAt: next.task_due_at,
              deadlineId: next.deadline_id,
              deadlineDueAt: next.deadline_due_at,
              recommendedActionAt: next.recommended_action_at,
              severity: next.severity,
            }
          : null,
        upcoming: tasks.rows.map((task) => ({
          taskId: task.id,
          householdId: task.household_id,
          title: task.title,
          status: task.status,
          dueAt: task.task_due_at,
          deadlineDueAt: task.deadline_due_at,
          recommendedActionAt: task.recommended_action_at,
          severity: task.severity,
        })),
        coverage: {
          identity: (identityDocuments.rows[0]?.count ?? 0) > 0 ? 'protected' : 'not_added',
          deadlineSafety: deadlineCounts.total > 0 ? 'ready' : 'not_started',
          emergencyKit: 'not_enabled',
        },
      };
    });
  }
}
