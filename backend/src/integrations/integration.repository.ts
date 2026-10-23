import { Inject, Injectable } from '@nestjs/common';
import { DatabaseService, QueryExecutor } from '../database/database.service';
import { AiSettings } from './integration.schema';
import type { TelegramUpdate } from './integration.schema';
import type { TelegramContext } from './telegram-context';
import { privateTelegramActor } from './telegram-context';
import { hashToken } from '../auth/auth.service';

export interface IntegrationSettings extends Record<string, unknown> {
  user_id: string;
  provider: 'deepseek' | 'openrouter' | null;
  model: string | null;
  encrypted_key: string | null;
  telegram_user_id: string | null;
  telegram_name: string | null;
  telegram_link_version: number;
  link_hash: string | null;
  link_expires_at: string | Date | null;
  candidate_id: string | null;
  candidate_name: string | null;
  insights_enabled: boolean;
  insights_version: number;
}

@Injectable()
export class IntegrationRepository {
  constructor(@Inject(DatabaseService) readonly database: DatabaseService) {}

  async telegramContext(
    update: TelegramUpdate,
    executor: QueryExecutor = this.database,
  ): Promise<TelegramContext | null> {
    const actorId = privateTelegramActor(update);
    let context: TelegramContext | null = null;
    if (actorId) {
      const start = /^\/start ([A-Za-z0-9_-]{32})$/.exec(update.message?.text || '');
      const linkHash = start ? hashToken(start[1]) : null;
      const rows = await executor.query<IntegrationSettings>(
        linkHash
          ? 'SELECT user_id,telegram_link_version FROM integration_settings WHERE link_hash=$1 AND link_expires_at>NOW() AND telegram_user_id IS NULL'
          : 'SELECT user_id,telegram_link_version FROM integration_settings WHERE telegram_user_id=$1',
        [linkHash || actorId],
      );
      const settings = rows[0];
      context = {
        actorId,
        ownerId: settings?.user_id || null,
        bindingVersion: settings?.telegram_link_version ?? null,
        linkHash,
      };
    }
    return context;
  }

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
    await this.database.forUser(userId, async (database) => {
      await database.query(
        `INSERT INTO integration_settings(user_id,provider,model,encrypted_key) VALUES($1,$2,$3,$4)
      ON CONFLICT(user_id) DO UPDATE SET provider=$2,model=$3,encrypted_key=$4,updated_at=NOW(),
      insights_enabled=CASE WHEN integration_settings.provider IS DISTINCT FROM $2 THEN false ELSE integration_settings.insights_enabled END,
      insights_version=integration_settings.insights_version+1,telegram_link_version=integration_settings.telegram_link_version+1`,
        [userId, input.provider, input.model, encrypted],
      );
      await database.query(
        "UPDATE telegram_drafts SET state='cancelled' WHERE user_id=$1 AND state='pending'",
        [userId],
      );
    });
  }

  async deleteAi(userId: string) {
    await this.database.forUser(userId, async (database) => {
      await database.query(
        'UPDATE integration_settings SET provider=NULL,model=NULL,encrypted_key=NULL,insights_enabled=false,insights_version=insights_version+1,telegram_link_version=telegram_link_version+1,updated_at=NOW() WHERE user_id=$1',
        [userId],
      );
      await database.query(
        "UPDATE telegram_drafts SET state='cancelled' WHERE user_id=$1 AND state='pending'",
        [userId],
      );
    });
  }

  async disconnect(userId: string, expectedVersion?: number) {
    return this.database.forUser(userId, async (database) => {
      const changed = await database.query(
        'UPDATE integration_settings SET telegram_user_id=NULL,telegram_name=NULL,link_hash=NULL,link_expires_at=NULL,candidate_id=NULL,candidate_name=NULL,telegram_link_version=telegram_link_version+1 WHERE user_id=$1 AND ($2::integer IS NULL OR telegram_link_version=$2) RETURNING user_id',
        [userId, expectedVersion ?? null],
      );
      if (changed.length) {
        await database.query(
          "UPDATE telegram_drafts SET state='cancelled' WHERE user_id=$1 AND state='pending'",
          [userId],
        );
      }
      return changed.length > 0;
    });
  }
}
