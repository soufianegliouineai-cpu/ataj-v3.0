import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';

interface TaskRow {
  id: string;
  status: string;
  completed_at: string | null;
  deadline_id: string | null;
  obligation_id: string | null;
}

@Injectable()
export class TaskService {
  constructor(private readonly database: DatabaseService) {}

  get enabled() {
    return this.database.enabled;
  }

  async complete(userId: string, householdId: string, taskId: string, requestId: string) {
    return this.database.withUserTransaction(userId, async (client) => {
      const task = await client.query<TaskRow>(
        `select
           t.id,
           t.status,
           t.completed_at::text,
           t.deadline_id,
           d.obligation_id
         from public.tasks t
         left join public.deadlines d on d.id = t.deadline_id
         where t.id = $1
           and t.household_id = $2`,
        [taskId, householdId],
      );

      const row = task.rows[0];
      if (!row) {
        throw new NotFoundException({
          code: 'TASK_NOT_FOUND',
          message: 'Task was not found.',
        });
      }

      if (row.status === 'completed') {
        return {
          taskId: row.id,
          status: 'completed',
          completedAt: row.completed_at,
          deadlineId: row.deadline_id,
          deadlineStatus: row.deadline_id ? 'completed' : null,
          obligationId: row.obligation_id,
          obligationStatus: row.obligation_id ? 'completed' : null,
          replayed: true,
        };
      }

      const updatedTask = await client.query<{
        id: string;
        completed_at: string;
      }>(
        `update public.tasks
         set status = 'completed',
             completed_at = coalesce(completed_at, now())
         where id = $1
           and household_id = $2
         returning id, completed_at::text`,
        [taskId, householdId],
      );

      const completed = updatedTask.rows[0];
      if (!completed) {
        throw new NotFoundException({
          code: 'TASK_NOT_FOUND',
          message: 'Task was not found.',
        });
      }

      if (row.deadline_id) {
        await client.query(
          `update public.deadlines
           set status = 'completed'
           where id = $1`,
          [row.deadline_id],
        );
      }

      if (row.obligation_id) {
        await client.query(
          `update public.obligations
           set status = 'completed'
           where id = $1`,
          [row.obligation_id],
        );
      }

      await client.query(
        `insert into public.audit_logs(
           household_id, actor_user_id, action, entity_type, entity_id, request_id, metadata
         )
         values ($1, $2, 'task.completed', 'task', $3, $4, $5::jsonb)`,
        [
          householdId,
          userId,
          taskId,
          requestId,
          JSON.stringify({
            deadlineId: row.deadline_id,
            obligationId: row.obligation_id,
          }),
        ],
      );

      return {
        taskId,
        status: 'completed',
        completedAt: completed.completed_at,
        deadlineId: row.deadline_id,
        deadlineStatus: row.deadline_id ? 'completed' : null,
        obligationId: row.obligation_id,
        obligationStatus: row.obligation_id ? 'completed' : null,
        replayed: false,
      };
    });
  }
}
