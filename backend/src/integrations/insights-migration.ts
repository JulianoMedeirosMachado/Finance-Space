import type { QueryExecutor } from '../database/database.service';

export async function migrateInsights(database: QueryExecutor) {
  await database.query(`ALTER TABLE integration_settings
    ADD COLUMN insights_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN insights_version INTEGER NOT NULL DEFAULT 0`);
  await database.query(`ALTER TABLE telegram_drafts ADD COLUMN kind TEXT NOT NULL DEFAULT 'transactions'
    CHECK(kind IN ('transactions','installments'))`);
  await database.query(`CREATE TABLE ai_insights (
    id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK(kind IN ('weekly','monthly')), period_start DATE NOT NULL, period_end DATE NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('generating','ready','failed')), report JSONB,
    generation_token UUID NOT NULL, started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), generated_at TIMESTAMPTZ,
    language TEXT NOT NULL CHECK(language IN ('pt-BR','en-US')), model TEXT NOT NULL,
    UNIQUE(user_id,kind,period_start))`);
  const owner = await database.query<{ identifier: string }>(
    'SELECT quote_ident(current_user) AS identifier',
  );
  await database.query('REVOKE ALL ON ai_insights FROM PUBLIC');
  for (const role of ['anon', 'authenticated']) {
    const exists = await database.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]);
    if (exists.length > 0) {
      await database.query(`REVOKE ALL ON ai_insights FROM ${role}`);
    }
  }
  await database.query('ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY');
  await database.query('ALTER TABLE ai_insights FORCE ROW LEVEL SECURITY');
  await database.query(
    `CREATE POLICY finance_space_maintenance ON ai_insights TO ${owner[0].identifier} USING(true) WITH CHECK(true)`,
  );
  await database.query(`CREATE POLICY finance_space_owner ON ai_insights TO finance_space_runtime
    USING(user_id=NULLIF(current_setting('finance_space.user_id',true),'')::uuid)
    WITH CHECK(user_id=NULLIF(current_setting('finance_space.user_id',true),'')::uuid)`);
  await database.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ai_insights TO finance_space_runtime');
}
