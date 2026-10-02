import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool | null;

  constructor() {
    const connectionString = process.env.DATABASE_URL?.trim();

    this.pool = connectionString
      ? new Pool({
          connectionString,
          max: Number(process.env.DATABASE_POOL_MAX ?? 10),
          idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS ?? 30_000),
          connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 5_000),
          maxLifetimeSeconds: Number(process.env.DATABASE_MAX_LIFETIME_SECONDS ?? 900),
          application_name: 'lifeos-api',
          ssl: process.env.DATABASE_SSL === 'require'
            ? { rejectUnauthorized: true }
            : undefined,
        })
      : null;

    this.pool?.on('error', (error) => {
      console.error('lifeos database idle client error', {
        name: error.name,
        message: error.message,
      });
    });
  }

  get enabled() {
    return this.pool !== null;
  }

  async ping() {
    if (!this.pool) {
      return { enabled: false, ok: false };
    }

    const result = await this.pool.query<{ now: string }>('select now()::text as now');
    return { enabled: true, ok: true, now: result.rows[0]?.now ?? null };
  }

  async withUserTransaction<T>(
    userId: string,
    operation: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (!this.pool) {
      throw new Error('DATABASE_URL is not configured');
    }

    const client = await this.pool.connect();

    try {
      await client.query('begin');
      await client.query(
        "select set_config('lifeos.user_id', $1, true), set_config('statement_timeout', $2, true)",
        [userId, process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? '5000'],
      );

      const result = await operation(client);
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool?.end();
  }
}
