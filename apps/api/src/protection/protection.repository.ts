import { ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { SupportedDocumentType } from '../constants.js';
import { DatabaseService } from '../database/database.service.js';
import type { ProtectionService } from './protection.service.js';

type ExpiryProtectionResult = ReturnType<ProtectionService['protect']>;

export interface PersistExpiryProtectionInput {
  userId: string;
  householdId: string;
  personId?: string | null;
  documentType: SupportedDocumentType;
  expiryDate: string;
  leadDays: number;
  idempotencyKey: string;
  requestId: string;
  result: ExpiryProtectionResult;
}

interface IdempotencyRow {
  request_hash: string;
  response_json: ExpiryProtectionResult | null;
  status_code: number | null;
}

@Injectable()
export class ProtectionRepository {
  constructor(private readonly database: DatabaseService) {}

  get enabled() {
    return this.database.enabled;
  }

  async persistExpiryProtection(input: PersistExpiryProtectionInput) {
    const requestHash = createHash('sha256')
      .update(JSON.stringify({
        householdId: input.householdId,
        personId: input.personId ?? null,
        documentType: input.documentType,
        expiryDate: input.expiryDate,
        leadDays: input.leadDays,
      }))
      .digest('hex');

    return this.database.withUserTransaction(input.userId, async (client) => {
      await client.query(
        `insert into public.app_users(id)
         values ($1)
         on conflict (id) do nothing`,
        [input.userId],
      );

      const inserted = await client.query<{ key: string }>(
        `insert into public.idempotency_records(user_id, key, request_hash)
         values ($1, $2, $3)
         on conflict (user_id, key) do nothing
         returning key`,
        [input.userId, input.idempotencyKey, requestHash],
      );

      if (inserted.rowCount === 0) {
        const existing = await client.query<IdempotencyRow>(
          `select request_hash, response_json, status_code
           from public.idempotency_records
           where user_id = $1 and key = $2`,
          [input.userId, input.idempotencyKey],
        );

        const row = existing.rows[0];

        if (!row) {
          throw new Error('Idempotency record disappeared during transaction');
        }

        if (row.request_hash !== requestHash) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'Idempotency-Key was already used for a different request.',
          });
        }

        if (row.response_json) {
          return {
            replayed: true,
            statusCode: row.status_code ?? 201,
            data: row.response_json,
          };
        }

        throw new ConflictException({
          code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
          message: 'A matching idempotent request is still in progress.',
        });
      }

      const policyContext = await client.query<{ user_id: string | null }>(
        `select private.current_user_id()::text as user_id`,
      );

      if (policyContext.rows[0]?.user_id !== input.userId) {
        throw new Error('RLS identity context changed before document persistence');
      }

      const document = await client.query<{ id: string }>(
        `insert into public.documents(
           household_id, owner_person_id, owner_user_id, document_type, title, status, sensitivity
         )
         values ($1, $2, $3, $4, $5, 'active', 'high')
         returning id`,
        [
          input.householdId,
          input.personId ?? null,
          input.userId,
          input.documentType,
          input.result.document.label,
        ],
      );
      const documentId = requiredId(document, 'document');

      await client.query(
        `insert into public.document_facts(
           document_id, field_key, value_json, normalized_value, confidence,
           origin, review_status, provenance
         )
         values ($1, 'expiry_date', $2::jsonb, $3, 1, 'user_confirmed', 'confirmed', $4::jsonb)`,
        [
          documentId,
          JSON.stringify(input.expiryDate),
          input.expiryDate,
          JSON.stringify({ source: 'request_body', field: 'expiryDate' }),
        ],
      );

      const obligation = await client.query<{ id: string }>(
        `insert into public.obligations(
           household_id, person_id, source_document_id, obligation_type, title,
           status, confidence, rule_code, created_by
         )
         values ($1, $2, $3, 'EXPIRY_PROTECTION', $4, $5, 1, $6, $7)
         returning id`,
        [
          input.householdId,
          input.personId ?? null,
          documentId,
          input.result.task.title,
          input.result.obligation.status,
          input.result.obligation.rule.code,
          input.userId,
        ],
      );
      const obligationId = requiredId(obligation, 'obligation');

      const deadline = await client.query<{ id: string }>(
        `insert into public.deadlines(
           household_id, obligation_id, due_at, recommended_action_at,
           severity, status, source
         )
         values ($1, $2, $3, $4, $5, $6, $7)
         returning id`,
        [
          input.householdId,
          obligationId,
          input.result.deadline.dueAt,
          input.result.deadline.recommendedActionAt,
          input.result.deadline.severity,
          input.result.deadline.status,
          input.result.deadline.source,
        ],
      );
      const deadlineId = requiredId(deadline, 'deadline');

      const task = await client.query<{ id: string }>(
        `insert into public.tasks(
           household_id, deadline_id, created_by, assigned_to_user_id,
           title, status, due_at
         )
         values ($1, $2, $3, $3, $4, $5, $6)
         returning id`,
        [
          input.householdId,
          deadlineId,
          input.userId,
          input.result.task.title,
          input.result.task.status,
          input.result.task.dueAt,
        ],
      );
      const taskId = requiredId(task, 'task');

      const persistedResponse = {
        ...input.result,
        persistence: {
          documentId,
          obligationId,
          deadlineId,
          taskId,
        },
      };

      await client.query(
        `update public.idempotency_records
         set response_json = $3::jsonb, status_code = 201
         where user_id = $1 and key = $2`,
        [input.userId, input.idempotencyKey, JSON.stringify(persistedResponse)],
      );

      await client.query(
        `insert into public.audit_logs(
           household_id, actor_user_id, action, entity_type, entity_id, request_id, metadata
         )
         values ($1, $2, 'expiry_protection.created', 'obligation', $3, $4, $5::jsonb)`,
        [
          input.householdId,
          input.userId,
          obligationId,
          input.requestId,
          JSON.stringify({
            documentType: input.documentType,
            ruleCode: input.result.obligation.rule.code,
            idempotencyKeyHash: createHash('sha256').update(input.idempotencyKey).digest('hex'),
          }),
        ],
      );

      return {
        replayed: false,
        statusCode: 201,
        data: persistedResponse,
      };
    });
  }
}

function requiredId(result: { rows: Array<{ id: string }> }, entity: string) {
  const id = result.rows[0]?.id;
  if (!id) {
    throw new Error(`Failed to persist ${entity}`);
  }
  return id;
}
