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

      const household = await client.query<{
        id: string;
        name: string;
        home_jurisdiction: string | null;
        created_at: string;
      }>(
        `insert into public.households(name, home_jurisdiction, created_by)
         values ($1, $2, $3)
         returning id, name, home_jurisdiction, created_at::text`,
        [input.name.trim(), input.homeJurisdiction?.trim() || null, identity.userId],
      );

      const row = household.rows[0];
      if (!row) throw new Error('Failed to create household');

      await client.query(
        `insert into public.household_members(household_id, user_id, role, status)
         values ($1, $2, 'owner', 'active')`,
        [row.id, identity.userId],
      );

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
