import { Injectable, NotFoundException } from '@nestjs/common';
import type { LifeOSIdentity } from '../auth/auth.types.js';
import { DatabaseService } from '../database/database.service.js';
import type { CreatePersonDto } from './person.dto.js';

export interface PersonView {
  id: string;
  householdId: string;
  displayName: string;
  relationship: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  jurisdiction: string | null;
  createdAt: string;
}

@Injectable()
export class PersonService {
  constructor(private readonly database: DatabaseService) {}

  get enabled() {
    return this.database.enabled;
  }

  async create(identity: LifeOSIdentity, householdId: string, input: CreatePersonDto) {
    return this.database.withUserTransaction(identity.userId, async (client) => {
      await requireHousehold(client, householdId);
      const result = await client.query<{
        id: string;
        household_id: string;
        display_name: string;
        relationship: string | null;
        date_of_birth: string | null;
        nationality: string | null;
        jurisdiction: string | null;
        created_at: string;
      }>(
        `insert into public.people(
           household_id, display_name, relationship, date_of_birth,
           nationality, jurisdiction, created_by
         )
         values ($1, $2, $3, $4, $5, $6, $7)
         returning
           id,
           household_id,
           display_name,
           relationship,
           date_of_birth::text,
           nationality,
           jurisdiction,
           created_at::text`,
        [
          householdId,
          input.displayName.trim(),
          input.relationship?.trim() || null,
          input.dateOfBirth ?? null,
          input.nationality?.trim() || null,
          input.jurisdiction?.trim() || null,
          identity.userId,
        ],
      );

      const row = result.rows[0];
      if (!row) throw new Error('Failed to create person');
      return mapPerson(row);
    });
  }

  async list(identity: LifeOSIdentity, householdId: string) {
    return this.database.withUserTransaction(identity.userId, async (client) => {
      await requireHousehold(client, householdId);
      const result = await client.query<{
        id: string;
        household_id: string;
        display_name: string;
        relationship: string | null;
        date_of_birth: string | null;
        nationality: string | null;
        jurisdiction: string | null;
        created_at: string;
      }>(
        `select
           id,
           household_id,
           display_name,
           relationship,
           date_of_birth::text,
           nationality,
           jurisdiction,
           created_at::text
         from public.people
         where household_id = $1
         order by created_at asc, id asc`,
        [householdId],
      );

      return result.rows.map(mapPerson);
    });
  }
}

function mapPerson(row: {
  id: string;
  household_id: string;
  display_name: string;
  relationship: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  jurisdiction: string | null;
  created_at: string;
}): PersonView {
  return {
    id: row.id,
    householdId: row.household_id,
    displayName: row.display_name,
    relationship: row.relationship,
    dateOfBirth: row.date_of_birth,
    nationality: row.nationality,
    jurisdiction: row.jurisdiction,
    createdAt: row.created_at,
  };
}

async function requireHousehold(
  client: import('pg').PoolClient,
  householdId: string,
) {
  const result = await client.query<{ id: string }>(
    'select id from public.households where id = $1',
    [householdId],
  );

  if (result.rowCount !== 1) {
    throw new NotFoundException({
      code: 'HOUSEHOLD_NOT_FOUND',
      message: 'Household was not found.',
    });
  }
}
