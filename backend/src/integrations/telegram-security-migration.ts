import type { QueryExecutor } from '../database/database.service';

export async function migrateTelegramQueueSecurity(database: QueryExecutor) {
  await database.query(
    'ALTER TABLE integration_settings ADD COLUMN telegram_link_version INTEGER NOT NULL DEFAULT 0',
  );
  await database.query(`CREATE TABLE telegram_actors (
    actor_id TEXT PRIMARY KEY, window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    received_count INTEGER NOT NULL DEFAULT 0, last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_served_at TIMESTAMPTZ, leased_until TIMESTAMPTZ, lease_token UUID)`);
  await database.query(`ALTER TABLE telegram_updates
    ADD COLUMN actor_id TEXT REFERENCES telegram_actors(actor_id),
    ADD COLUMN owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
    ADD COLUMN binding_version INTEGER, ADD COLUMN link_hash TEXT, ADD COLUMN lease_token UUID`);
  await database.query(`UPDATE telegram_updates SET state=CASE WHEN state='failed' THEN 'failed' ELSE 'done' END,payload='{}'::jsonb,reply=NULL
    WHERE state IN ('queued','processing','failed')`);
  await database.query(
    'CREATE INDEX telegram_updates_actor_pending ON telegram_updates(actor_id,state,update_id)',
  );
  const owner = await database.query<{ identifier: string }>(
    'SELECT quote_ident(current_user) AS identifier',
  );
  await database.query('REVOKE ALL ON telegram_actors FROM PUBLIC');
  for (const role of ['anon', 'authenticated', 'finance_space_runtime']) {
    const exists = await database.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [role]);
    if (exists.length) {
      await database.query(`REVOKE ALL ON telegram_actors FROM ${role}`);
    }
  }
  await database.query('ALTER TABLE telegram_actors ENABLE ROW LEVEL SECURITY');
  await database.query('ALTER TABLE telegram_actors FORCE ROW LEVEL SECURITY');
  await database.query(
    `CREATE POLICY finance_space_maintenance ON telegram_actors TO ${owner[0].identifier} USING(true) WITH CHECK(true)`,
  );
}
