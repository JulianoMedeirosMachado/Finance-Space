import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import { IntegrationService } from './integration.service';
import { BotReply, TelegramUpdate, telegramUpdateSchema } from './integration.schema';
import { TelegramClient } from './telegram.client';

@Injectable()
export class TelegramWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private stopped = false;
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IntegrationService) private readonly integration: IntegrationService,
    @Inject(TelegramClient) private readonly telegram: TelegramClient,
  ) {}

  onModuleInit() {
    if (this.telegram.available()) {
      this.timer = setInterval(() => this.kick(), 10000);
      this.timer.unref();
      this.kick();
    }
  }

  onModuleDestroy() {
    this.stopped = true;
    clearInterval(this.timer);
  }

  async receive(secret: string | undefined, body: unknown) {
    const expected = Buffer.from(process.env.TELEGRAM_WEBHOOK_SECRET || '');
    const actual = Buffer.from(secret || '');
    if (
      this.telegram.available() &&
      expected.length === actual.length &&
      timingSafeEqual(expected, actual)
    ) {
      const update = telegramUpdateSchema.parse(body);
      await this.database.query(
        'INSERT INTO telegram_updates(update_id,payload) VALUES($1,$2) ON CONFLICT(update_id) DO NOTHING',
        [update.update_id, JSON.stringify(update)],
      );
      setImmediate(() => this.kick());
    } else {
      throw new UnauthorizedException();
    }
    return { ok: true };
  }

  private kick() {
    if (!this.running && !this.stopped) {
      this.running = true;
      void this.drain()
        .catch(() => {
          console.warn('Telegram queue processing failed; pending updates will be retried.');
        })
        .finally(() => {
          this.running = false;
        });
    }
  }

  async drain() {
    await this.database.query(
      "UPDATE telegram_updates SET state='failed' WHERE state='processing' AND available_at<=NOW() AND attempts>=6",
    );
    let remaining = true;
    for (let index = 0; index < 5 && !this.stopped && remaining; index++) {
      const jobs = await this.database.query<{
        update_id: string;
        payload: TelegramUpdate;
        reply: BotReply | null;
        attempts: number;
      }>(`UPDATE telegram_updates SET state='processing',attempts=attempts+1,available_at=NOW()+INTERVAL '2 minutes'
        WHERE update_id=(SELECT update_id FROM telegram_updates WHERE state IN ('queued','processing') AND available_at<=NOW() AND attempts<6 ORDER BY update_id LIMIT 1 FOR UPDATE SKIP LOCKED)
        RETURNING update_id,payload,reply,attempts`);
      const job = jobs[0];
      if (job) {
        try {
          if (job.payload.callback_query) {
            await this.telegram.acknowledge(job.payload.callback_query.id);
          }
          const reply = job.reply || (await this.integration.handle(job.payload));
          await this.database.query('UPDATE telegram_updates SET reply=$2 WHERE update_id=$1', [
            job.update_id,
            reply ? JSON.stringify(reply) : null,
          ]);
          if (reply && (await this.integration.canDeliver(reply))) {
            await this.telegram.send(reply);
          }
          await this.database.query(
            "UPDATE telegram_updates SET state='done',payload='{}'::jsonb,reply=NULL WHERE update_id=$1",
            [job.update_id],
          );
        } catch {
          await this.database.query(
            "UPDATE telegram_updates SET state=$2,available_at=NOW()+($3 * INTERVAL '1 second') WHERE update_id=$1",
            [
              job.update_id,
              job.attempts >= 6 ? 'failed' : 'queued',
              Math.min(300, 10 * 2 ** job.attempts),
            ],
          );
          console.warn('Telegram update deferred; no credentials or message content are logged.');
        }
      } else {
        remaining = false;
      }
    }
    await this.database.query(
      "UPDATE telegram_updates SET payload='{}'::jsonb,reply=NULL WHERE state='failed' AND created_at<NOW()-INTERVAL '24 hours'",
    );
    await this.database.query(
      "DELETE FROM telegram_drafts WHERE expires_at<NOW()-INTERVAL '30 days'",
    );
  }
}
