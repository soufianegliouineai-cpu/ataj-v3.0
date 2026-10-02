import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { LifeOSIdentity } from '../auth/auth.types.js';
import { DatabaseService } from '../database/database.service.js';
import type { CreateHouseholdDto } from './household.dto.js';

@Injectable()
export class HouseholdService {
  constructor(private readonly database: DatabaseService) {}

  get enabled() {
    return this.database.enabled;
  }

  async create(identity: LifeOSIdentity, input: CreateHouseholdDto) {
    return this.database.withUserTransaction(identity.userId, async (client) => {
      const email = typeof identity.claims.email === 'string'
        ? identity.claims.email
        : typeof identity.claims.preferred_username === 'string'
          ? identity.claims.preferred_username
          : null;
      const displayName = typeof identity.claims.name === 'string'
        ? identity.claims.name
        : null;

      await client.query(
        `insert into public.app_users(id, email, display_name)
         values ($1, $2, $3)
         on conflict (id) do update
         set email = coalesce(excluded.email, public.app_users.email),
             display_name = coalesce(excluded.display_name, public.app_users.display_name)`,
        [identity.userId, email, displayName],
      );

      const householdId = crypto.randomUUID();

      await client.query(
        `insert into public.households(id, name, home_jurisdiction, created_by)
         values ($1, $2, $3, $4)`,
        [householdId, input.name.trim(), input.homeJurisdiction?.trim() || null, identity.userId],
      );

      await client.query(
        `insert into public.household_members(household_id, user_id, role, status)
         values ($1, $2, 'owner', 'active')`,
        [householdId, identity.userId],
      );

      const household = await client.query<{
        id: string;
        name: string;
        home_jurisdiction: string | null;
        created_at: string;
      }>(
        `select id, name, home_jurisdiction, created_at::text
         from public.households
         where id = $1`,
        [householdId],
      );

      const row = household.rows[0];
      if (!row) throw new Error('Failed to read created household');

      return {
        id: row.id,
        name: row.name,
        homeJurisdiction: row.home_jurisdiction,
        createdAt: row.created_at,
        role: 'owner',
      };
    });
  }
}
