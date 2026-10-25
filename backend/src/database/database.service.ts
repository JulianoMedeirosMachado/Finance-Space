import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { applyRowSecurity } from './security-migration';
import { migrateIntegrations } from '../integrations/integration-migration';
import { migrateInsights } from '../integrations/insights-migration';
import { migrateTelegramEntryKinds } from '../integrations/telegram-entry-migration';
import { migrateTelegramQueueSecurity } from '../integrations/telegram-security-migration';
import { migrateTelegramSplits } from '../integrations/telegram-split-migration';
import { migrateTelegramBenefits } from '../integrations/telegram-benefit-migration';

export interface QueryExecutor {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters?: unknown[],
  ): Promise<T[]>;
}

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy, QueryExecutor {
  private pool?: Pool;
  private local?: PGlite;
  private transactionQueue: Promise<unknown> = Promise.resolve();

  async onModuleInit() {
    if (process.env.DATABASE_URL) {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined,
      });
    } else if (process.env.NODE_ENV === 'production') {
      throw new Error('DATABASE_URL is required in production.');
    } else {
      const directory = resolve(process.env.DATA_DIRECTORY || 'data/postgres');
      await mkdir(directory, { recursive: true });
      this.local = new PGlite(directory);
      await this.local.waitReady;
    }
    await this.migrate();
  }

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    parameters: unknown[] = [],
  ): Promise<T[]> {
    let rows: T[] = [];
    if (this.pool) {
      rows = (await this.pool.query(sql, parameters)).rows as T[];
    } else if (this.local) {
      rows = (await this.local.query<T>(sql, parameters)).rows;
    }
    return rows;
  }

  async transaction<T>(operation: (executor: QueryExecutor) => Promise<T>): Promise<T> {
    let result: T;
    if (this.pool) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        result = await operation({
          query: async <R extends Record<string, unknown>>(
            sql: string,
            parameters: unknown[] = [],
          ) => (await client.query(sql, parameters)).rows as R[],
        });
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    } else {
      const task = this.transactionQueue.then(() =>
        this.local!.transaction(async (transaction) =>
          operation({
            query: async <R extends Record<string, unknown>>(
              sql: string,
              parameters: unknown[] = [],
            ) => (await transaction.query<R>(sql, parameters)).rows,
          }),
        ),
      );
      this.transactionQueue = task.catch(() => undefined);
      result = await task;
    }
    return result;
  }

  async forUser<T>(userId: string, operation: (executor: QueryExecutor) => Promise<T>): Promise<T> {
    const ownerId = z.uuid().parse(userId);
    return this.transaction(async (database) => {
      await database.query("SELECT set_config('finance_space.user_id',$1,true)", [ownerId]);
      await database.query('SET LOCAL ROLE finance_space_runtime');
      return operation(database);
    });
  }

  private async migrate() {
    await this.query(
      `CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    );
    await this.query(
      `CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
    );
    await this.query(
      `CREATE TABLE IF NOT EXISTS password_resets (token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TIMESTAMPTZ NOT NULL)`,
    );
    await this.query(`CREATE TABLE IF NOT EXISTS records (
      id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('accounts','cards','categories','people','transactions','recurring','installments','invoices','income','benefits','settlements','history')),
      data JSONB NOT NULL, import_key TEXT, version INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id, import_key))`);
    await this.query('CREATE INDEX IF NOT EXISTS records_user_kind ON records(user_id, kind)');
    await this.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS records_invoice_month ON records(user_id,(data->>'cardId'),(data->>'month')) WHERE kind='invoices'",
    );
    await this.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS records_source_month ON records(user_id,(data->>'sourceId'),(data->>'month')) WHERE kind='transactions' AND data ? 'sourceId'",
    );
    await this.query(
      `CREATE TABLE IF NOT EXISTS imports (id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, filename TEXT NOT NULL, fingerprint TEXT NOT NULL, summary JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(user_id, fingerprint))`,
    );
    await this.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())',
    );
    await this.transaction(async (database) => {
      const applied = await database.query('SELECT version FROM schema_migrations WHERE version=1');
      if (applied.length === 0) {
        await database.query(
          "ALTER TABLE records DROP CONSTRAINT IF EXISTS records_kind_check, ADD CONSTRAINT records_kind_check CHECK (kind IN ('accounts','cards','categories','people','transactions','recurring','installments','invoices','income','benefits','settlements','history','goals','goalContributions'))",
        );
        await database.query('INSERT INTO schema_migrations(version) VALUES(1)');
      }
      const secured = await database.query('SELECT version FROM schema_migrations WHERE version=2');
      if (secured.length === 0) {
        await applyRowSecurity(database);
        await database.query('INSERT INTO schema_migrations(version) VALUES(2)');
      }
      const localized = await database.query(
        'SELECT version FROM schema_migrations WHERE version=3',
      );
      if (localized.length === 0) {
        await database.query(
          "ALTER TABLE users ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'pt-BR' CHECK (language IN ('pt-BR','en-US'))",
        );
        await database.query('INSERT INTO schema_migrations(version) VALUES(3)');
      }
      const integrations = await database.query(
        'SELECT version FROM schema_migrations WHERE version=4',
      );
      if (integrations.length === 0) {
        await migrateIntegrations(database);
        await database.query('INSERT INTO schema_migrations(version) VALUES(4)');
      }
      const insights = await database.query(
        'SELECT version FROM schema_migrations WHERE version=5',
      );
      if (insights.length === 0) {
        await migrateInsights(database);
        await database.query('INSERT INTO schema_migrations(version) VALUES(5)');
      }
      const telegramEntries = await database.query(
        'SELECT version FROM schema_migrations WHERE version=6',
      );
      if (telegramEntries.length === 0) {
        await migrateTelegramEntryKinds(database);
        await database.query('INSERT INTO schema_migrations(version) VALUES(6)');
      }
      const queueSecurity = await database.query(
        'SELECT version FROM schema_migrations WHERE version=7',
      );
      if (queueSecurity.length === 0) {
        await migrateTelegramQueueSecurity(database);
        await database.query('INSERT INTO schema_migrations(version) VALUES(7)');
      }
      const splits = await database.query('SELECT version FROM schema_migrations WHERE version=8');
      if (splits.length === 0) {
        await migrateTelegramSplits(database);
        await database.query('INSERT INTO schema_migrations(version) VALUES(8)');
      }
      const benefits = await database.query(
        'SELECT version FROM schema_migrations WHERE version=9',
      );
      if (benefits.length === 0) {
        await migrateTelegramBenefits(database);
        await database.query('INSERT INTO schema_migrations(version) VALUES(9)');
      }
    });
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
    if (this.local) {
      await this.local.close();
    }
  }
}
