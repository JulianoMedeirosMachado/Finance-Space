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
import { telegramUpdateSchema } from './integration.schema';
import { TelegramClient } from './telegram.client';
import { TelegramJob, TelegramQueueRepository } from './telegram-queue.repository';

@Injectable()
export class TelegramWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private stopped = false;
  constructor(
    @Inject(DatabaseService) database: DatabaseService,
    @Inject(IntegrationService) private readonly integration: IntegrationService,
    @Inject(TelegramClient) private readonly telegram: TelegramClient,
    @Inject(TelegramQueueRepository) private readonly queue = new TelegramQueueRepository(database),
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
      await this.queue.enqueue(update);
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
    await this.queue.cleanup();
    await Promise.all([this.processLane(), this.processLane()]);
  }

  private async processLane() {
    let remaining = true;
    for (let index = 0; index < 5 && !this.stopped && remaining; index++) {
      const job = await this.queue.claim();
      if (job) {
        await this.processJob(job);
      } else {
        remaining = false;
      }
    }
  }

  private async processJob(job: TelegramJob) {
    try {
      const context = this.queue.context(job);
      if (job.payload.callback_query) {
        await this.telegram.acknowledge(job.payload.callback_query.id);
      }
      const reply = job.reply || (await this.integration.handle(job.payload, context));
      await this.queue.saveReply(job, reply);
      if (reply && (await this.integration.canDeliver(reply, context))) {
        await this.telegram.send(reply);
      }
      await this.queue.finish(job);
    } catch {
      await this.queue.finish(job, true);
      console.warn('Telegram update deferred; no credentials or message content are logged.');
    }
  }
}
