import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService, QueryExecutor } from '../database/database.service';
import { AiSettings } from './integration.schema';

export interface IntegrationSettings extends Record<string, unknown> {
  user_id: string;
  provider: 'deepseek' | 'openrouter' | null;
  model: string | null;
  encrypted_key: string | null;
  telegram_user_id: string | null;
  telegram_name: string | null;
  link_hash: string | null;
  link_expires_at: string | Date | null;
  candidate_id: string | null;
  candidate_name: string | null;
}

@Injectable()
export class IntegrationRepository {
  constructor(@Inject(DatabaseService) readonly database: DatabaseService) {}

  async settings(userId: string, executor?: QueryExecutor) {
    const query = async (database: QueryExecutor) =>
      (
        await database.query<IntegrationSettings>(
          'SELECT * FROM integration_settings WHERE user_id=$1',
          [userId],
        )
      )[0];
    return executor ? query(executor) : this.database.forUser(userId, query);
  }

  async saveAi(userId: string, input: AiSettings, encrypted: string) {
    await this.database.forUser(userId, (database) =>
      database.query(
        `INSERT INTO integration_settings(user_id,provider,model,encrypted_key) VALUES($1,$2,$3,$4)
      ON CONFLICT(user_id) DO UPDATE SET provider=$2,model=$3,encrypted_key=$4,updated_at=NOW()`,
        [userId, input.provider, input.model, encrypted],
      ),
    );
  }

  async deleteAi(userId: string) {
    await this.database.forUser(userId, async (database) => {
      await database.query(
        'UPDATE integration_settings SET provider=NULL,model=NULL,encrypted_key=NULL,updated_at=NOW() WHERE user_id=$1',
        [userId],
      );
      await database.query(
        "UPDATE telegram_drafts SET state='cancelled' WHERE user_id=$1 AND state='pending'",
        [userId],
      );
    });
  }

  async disconnect(userId: string) {
    await this.database.forUser(userId, async (database) => {
      await database.query(
        'UPDATE integration_settings SET telegram_user_id=NULL,telegram_name=NULL,link_hash=NULL,link_expires_at=NULL,candidate_id=NULL,candidate_name=NULL WHERE user_id=$1',
        [userId],
      );
      await database.query(
        "UPDATE telegram_drafts SET state='cancelled' WHERE user_id=$1 AND state='pending'",
        [userId],
      );
    });
  }
}
