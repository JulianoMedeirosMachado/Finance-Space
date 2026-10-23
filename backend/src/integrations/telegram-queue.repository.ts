import { HttpException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { IntegrationRepository } from './integration.repository';
import { privateTelegramActor, TelegramContext } from './telegram-context';
import type { BotReply, TelegramUpdate } from './integration.schema';

export interface TelegramJob extends Record<string, unknown> {
  update_id: string;
  payload: TelegramUpdate;
  reply: BotReply | null;
  attempts: number;
  actor_id: string;
  owner_id: string | null;
  binding_version: number | null;
  link_hash: string | null;
  lease_token: string;
}

@Injectable()
export class TelegramQueueRepository {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IntegrationRepository)
    private readonly integration = new IntegrationRepository(database),
  ) {}

  async enqueue(update: TelegramUpdate) {
    const actor = privateTelegramActor(update);
    if (actor) {
      await this.database.transaction(async (database) => {
        await database.query(
          `INSERT INTO telegram_actors(actor_id) VALUES($1)
          ON CONFLICT(actor_id) DO UPDATE SET last_seen_at=NOW()`,
          [actor],
        );
        const duplicate = await database.query(
          'SELECT update_id FROM telegram_updates WHERE update_id=$1',
          [update.update_id],
        );
        if (!duplicate.length) {
          const permitted = await database.query(
            `UPDATE telegram_actors SET
            received_count=CASE WHEN window_started_at<=NOW()-INTERVAL '1 minute' THEN 1 ELSE received_count+1 END,
            window_started_at=CASE WHEN window_started_at<=NOW()-INTERVAL '1 minute' THEN NOW() ELSE window_started_at END,
            last_seen_at=NOW()
            WHERE actor_id=$1 AND (window_started_at<=NOW()-INTERVAL '1 minute' OR received_count<20)
            AND (SELECT COUNT(*) FROM telegram_updates WHERE actor_id=$1 AND state IN ('queued','processing'))<8
            RETURNING actor_id`,
            [actor],
          );
          if (permitted.length) {
            const context = (await this.integration.telegramContext(update, database))!;
            await database.query(
              `INSERT INTO telegram_updates(update_id,payload,actor_id,owner_id,binding_version,link_hash)
              VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(update_id) DO NOTHING`,
              [
                update.update_id,
                JSON.stringify(update),
                actor,
                context.ownerId,
                context.bindingVersion,
                context.linkHash,
              ],
            );
          } else {
            throw new HttpException(
              'Limite de mensagens do Telegram atingido. Aguarde antes de tentar novamente.',
              429,
            );
          }
        }
      });
    }
  }

  async claim() {
    return this.database.transaction(async (database) => {
      const rows = await database.query<{
        update_id: string;
        actor_id: string;
      }>(`SELECT q.update_id,q.actor_id
        FROM telegram_updates q JOIN telegram_actors a ON a.actor_id=q.actor_id
        WHERE q.state IN ('queued','processing') AND q.available_at<=NOW() AND q.attempts<6
        AND (a.leased_until IS NULL OR a.leased_until<=NOW())
        AND NOT EXISTS(SELECT 1 FROM telegram_updates older WHERE older.actor_id=q.actor_id
          AND older.state IN ('queued','processing') AND older.update_id<q.update_id)
        ORDER BY a.last_served_at NULLS FIRST,q.update_id LIMIT 1 FOR UPDATE OF a SKIP LOCKED`);
      let job: TelegramJob | undefined;
      if (rows[0]) {
        const token = randomUUID();
        await database.query(
          "UPDATE telegram_actors SET last_served_at=NOW(),leased_until=NOW()+INTERVAL '2 minutes',lease_token=$2 WHERE actor_id=$1",
          [rows[0].actor_id, token],
        );
        job = (
          await database.query<TelegramJob>(
            `UPDATE telegram_updates SET state='processing',attempts=attempts+1,
          available_at=NOW()+INTERVAL '2 minutes',lease_token=$2 WHERE update_id=$1
          RETURNING update_id,payload,reply,attempts,actor_id,owner_id,binding_version,link_hash,lease_token`,
            [rows[0].update_id, token],
          )
        )[0];
      }
      return job;
    });
  }

  context(job: TelegramJob): TelegramContext {
    return {
      actorId: job.actor_id,
      ownerId: job.owner_id,
      bindingVersion: job.binding_version,
      linkHash: job.link_hash,
    };
  }

  async saveReply(job: TelegramJob, reply: BotReply | null) {
    await this.database.query(
      'UPDATE telegram_updates SET reply=$2 WHERE update_id=$1 AND lease_token=$3',
      [job.update_id, reply ? JSON.stringify(reply) : null, job.lease_token],
    );
  }

  async finish(job: TelegramJob, failed = false) {
    await this.database.transaction(async (database) => {
      await database.query('SELECT actor_id FROM telegram_actors WHERE actor_id=$1 FOR UPDATE', [
        job.actor_id,
      ]);
      const retry = failed && job.attempts < 6;
      await database.query(
        `UPDATE telegram_updates SET state=$2,
        available_at=NOW()+($3 * INTERVAL '1 second'),
        payload=CASE WHEN $4 THEN payload ELSE '{}'::jsonb END,
        reply=CASE WHEN $4 THEN reply ELSE NULL END,
        owner_id=CASE WHEN $4 THEN owner_id ELSE NULL END,
        binding_version=CASE WHEN $4 THEN binding_version ELSE NULL END,
        link_hash=CASE WHEN $4 THEN link_hash ELSE NULL END,
        actor_id=CASE WHEN $4 THEN actor_id ELSE NULL END,lease_token=NULL
        WHERE update_id=$1 AND lease_token=$5`,
        [
          job.update_id,
          retry ? 'queued' : failed ? 'failed' : 'done',
          Math.min(300, 10 * 2 ** job.attempts),
          retry,
          job.lease_token,
        ],
      );
      await database.query(
        'UPDATE telegram_actors SET leased_until=NULL,lease_token=NULL WHERE actor_id=$1 AND lease_token=$2',
        [job.actor_id, job.lease_token],
      );
    });
  }

  async cleanup() {
    await this.database
      .query(`UPDATE telegram_updates SET state='failed',payload='{}'::jsonb,reply=NULL,
      owner_id=NULL,binding_version=NULL,link_hash=NULL,actor_id=NULL,lease_token=NULL
      WHERE (state='processing' AND available_at<=NOW() AND attempts>=6)
      OR (actor_id IS NULL AND state IN ('queued','processing'))`);
    await this.database.query(
      "DELETE FROM telegram_actors WHERE last_seen_at<NOW()-INTERVAL '30 days' AND NOT EXISTS(SELECT 1 FROM telegram_updates q WHERE q.actor_id=telegram_actors.actor_id)",
    );
    await this.database.query(
      "DELETE FROM telegram_drafts WHERE expires_at<NOW()-INTERVAL '30 days'",
    );
  }
}
