import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

interface TimelineRow {
  deadline_id: string;
  due_at: string;
  recommended_action_at: string | null;
  severity: string;
  deadline_status: string;
  obligation_id: string;
  obligation_type: string;
  obligation_title: string;
  document_id: string | null;
  document_type: string | null;
  document_title: string | null;
  task_id: string | null;
  task_title: string | null;
  task_status: string | null;
}

@Injectable()
export class TimelineService {
  constructor(private readonly database: DatabaseService) {}

  get enabled() {
    return this.database.enabled;
  }

  async forHousehold(userId: string, householdId: string) {
    return this.database.withUserTransaction(userId, async (client) => {
      const household = await client.query<{ id: string; name: string }>(
        `select id, name from public.households where id = $1`,
        [householdId],
      );

      if (!household.rows[0]) {
        throw new NotFoundException({
          code: 'HOUSEHOLD_NOT_FOUND',
          message: 'Household was not found.',
        });
      }

      const rows = await client.query<TimelineRow>(
        `select
           dl.id as deadline_id,
           dl.due_at::text,
           dl.recommended_action_at::text,
           dl.severity,
           dl.status as deadline_status,
           o.id as obligation_id,
           o.obligation_type,
           o.title as obligation_title,
           d.id as document_id,
           d.document_type,
           d.title as document_title,
           t.id as task_id,
           t.title as task_title,
           t.status as task_status
         from public.deadlines dl
         join public.obligations o on o.id = dl.obligation_id
         left join public.documents d on d.id = o.source_document_id
         left join public.tasks t on t.deadline_id = dl.id
         where dl.household_id = $1
         order by coalesce(dl.recommended_action_at, dl.due_at), dl.due_at, dl.id`,
        [householdId],
      );

      return {
        household: household.rows[0],
        items: rows.rows.map((row) => ({
          deadline: {
            id: row.deadline_id,
            dueAt: row.due_at,
            recommendedActionAt: row.recommended_action_at,
            severity: row.severity,
            status: row.deadline_status,
          },
          obligation: {
            id: row.obligation_id,
            type: row.obligation_type,
            title: row.obligation_title,
          },
          document: row.document_id
            ? {
                id: row.document_id,
                type: row.document_type,
                title: row.document_title,
              }
            : null,
          task: row.task_id
            ? {
                id: row.task_id,
                title: row.task_title,
                status: row.task_status,
              }
            : null,
        })),
      };
    });
  }
}
