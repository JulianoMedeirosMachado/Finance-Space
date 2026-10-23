import type { QueryExecutor } from '../database/database.service';

export async function migrateIntegrations(database: QueryExecutor) {
  await database.query(`CREATE TABLE integration_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT CHECK(provider IN ('deepseek','openrouter')), model TEXT, encrypted_key TEXT,
    telegram_user_id TEXT UNIQUE, telegram_name TEXT,
    link_hash TEXT UNIQUE, link_expires_at TIMESTAMPTZ,
    candidate_id TEXT, candidate_name TEXT, ai_last_at TIMESTAMPTZ,
    ai_day DATE, ai_count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await database.query(`CREATE TABLE telegram_drafts (
    id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    update_id BIGINT NOT NULL UNIQUE, data JSONB NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','confirmed','cancelled')),
    record_id UUID, expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW()+INTERVAL '24 hours')`);
  await database.query(`CREATE TABLE telegram_updates (
    update_id BIGINT PRIMARY KEY, payload JSONB NOT NULL, reply JSONB,
    state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','processing','done','failed')),
    attempts INTEGER NOT NULL DEFAULT 0, available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  await database.query(
    'CREATE INDEX telegram_updates_pending ON telegram_updates(state,available_at)',
  );
  const owner = await database.query<{ identifier: string }>(
    'SELECT quote_ident(current_user) AS identifier',
  );
  for (const table of ['integration_settings', 'telegram_drafts', 'telegram_updates']) {
    await database.query(`REVOKE ALL ON public.${table} FROM PUBLIC`);
    for (const role of ['anon', 'authenticated']) {
      const existing = await database.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]);
      if (existing.length > 0) {
        await database.query(`REVOKE ALL ON public.${table} FROM ${role}`);
      }
    }
    await database.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
    await database.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
    await database.query(
      `CREATE POLICY finance_space_maintenance ON ${table} TO ${owner[0].identifier} USING(true) WITH CHECK(true)`,
    );
    if (table !== 'telegram_updates') {
      await database.query(`CREATE POLICY finance_space_owner ON ${table} TO finance_space_runtime
        USING(user_id=NULLIF(current_setting('finance_space.user_id',true),'')::uuid)
        WITH CHECK(user_id=NULLIF(current_setting('finance_space.user_id',true),'')::uuid)`);
      await database.query(
        `GRANT SELECT,INSERT,UPDATE,DELETE ON ${table} TO finance_space_runtime`,
      );
    }
  }
}
