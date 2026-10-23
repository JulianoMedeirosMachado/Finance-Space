import type { QueryExecutor } from '../database/database.service';

export async function migrateTelegramEntryKinds(database: QueryExecutor) {
  await database.query(`ALTER TABLE telegram_drafts DROP CONSTRAINT telegram_drafts_kind_check,
    ADD CONSTRAINT telegram_drafts_kind_check CHECK(kind IN ('transactions','installments','recurring','income'))`);
}
