import type { QueryExecutor } from '../database/database.service';

export async function migrateTelegramSplits(database: QueryExecutor) {
  await database.query(`ALTER TABLE telegram_drafts ADD COLUMN split_entries JSONB
    CHECK(split_entries IS NULL OR jsonb_typeof(split_entries)='array')`);
}
