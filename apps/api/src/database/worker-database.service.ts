import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Pool, type PoolClient } from 'pg';

@Injectable()
export class WorkerDatabaseService implements OnModuleDestroy {
  private readonly pool: Pool | null;

  constructor() {
    const connectionString = process.env.WORKER_DATABASE_URL?.trim();

    this.pool = connectionString
      ? new Pool({
          connectionString,
          max: Number(process.env.WORKER_DATABASE_POOL_MAX ?? 4),
          idleTimeoutMillis: Number(process.env.DATABASE_IDLE_TIMEOUT_MS ?? 30_000),
          connectionTimeoutMillis: Number(process.env.DATABASE_CONNECT_TIMEOUT_MS ?? 5_000),
          maxLifetimeSeconds: Number(process.env.DATABASE_MAX_LIFETIME_SECONDS ?? 900),
          application_name: 'lifeos-worker',
          ssl: process.env.DATABASE_SSL === 'require'
            ? { rejectUnauthorized: true }
            : undefined,
        })
      : null;

    this.pool?.on('error', (error) => {
      console.error('lifeos worker database idle client error', {
        name: error.name,
        message: error.message,
      });
    });
  }

  get enabled() {
    return this.pool !== null;
  }

  async ping() {
    if (!this.pool) return { enabled: false, ok: false };

    return this.withTransaction(async (client) => {
      const result = await client.query<{ role_name: string }>('select current_user as role_name');
      return {
        enabled: true,
        ok: result.rows[0]?.role_name === 'lifeos_worker',
        role: result.rows[0]?.role_name ?? null,
      };
    });
  }

  async withTransaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new Error('WORKER_DATABASE_URL is not configured');

    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query('set local role lifeos_worker');
      await client.query(
        "select set_config('statement_timeout', $1, true)",
        [process.env.WORKER_DATABASE_STATEMENT_TIMEOUT_MS ?? '30000'],
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
