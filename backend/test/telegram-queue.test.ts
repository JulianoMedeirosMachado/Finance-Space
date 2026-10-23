import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AuthService } from '../src/auth/auth.service';
import { DatabaseService } from '../src/database/database.service';
import { FinanceService } from '../src/finance/finance.service';
import { AiService, AiCredential } from '../src/integrations/ai.service';
import { IntegrationService } from '../src/integrations/integration.service';
import { IntegrationRepository } from '../src/integrations/integration.repository';
import { TelegramClient } from '../src/integrations/telegram.client';
import { TelegramWorker } from '../src/integrations/telegram.worker';
import { TelegramQueueRepository } from '../src/integrations/telegram-queue.repository';
import {
  BotReply,
  entryProposalSchema,
  TelegramUpdate,
} from '../src/integrations/integration.schema';

class QueueAi extends AiService {
  calls: { model: string; text: string }[] = [];
  wait?: Promise<void>;
  cardId = '';
  async interpret(credential: AiCredential, text: string) {
    this.calls.push({ model: credential.model, text });
    await this.wait;
    return entryProposalSchema.parse({
      description: text,
      amount: 2000,
      date: '2026-10-23',
      month: '2026-10',
      accountId: null,
      cardId: this.cardId,
      categoryId: null,
      clarification: null,
    });
  }
}
class QueueTelegram extends TelegramClient {
  sent: BotReply[] = [];
  fail = false;
  async acknowledge() {}
  async send(reply: BotReply) {
    if (this.fail) {
      throw new Error('Synthetic delivery failure');
    } else {
      this.sent.push(reply);
    }
  }
}
class PausedQueueWorker extends TelegramWorker {
  async drain() {}
}

const message = (id: number, actor: number, text: string): TelegramUpdate => ({
  update_id: id,
  message: {
    message_id: id,
    from: { id: actor, first_name: 'Synthetic' },
    chat: { id: actor, type: 'private' },
    text,
  },
});

test(
  'Telegram queues pin identities, reject stale bindings and bound/fairly schedule independent actors',
  { timeout: 60000 },
  async () => {
    const names = [
      'DATA_DIRECTORY',
      'DATABASE_URL',
      'INTEGRATION_ENCRYPTION_KEY',
      'TELEGRAM_BOT_TOKEN',
      'TELEGRAM_BOT_USERNAME',
      'TELEGRAM_WEBHOOK_SECRET',
    ] as const;
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    const directory = await mkdtemp(join(tmpdir(), 'finance-queue-'));
    process.env.DATA_DIRECTORY = directory;
    process.env.DATABASE_URL = '';
    process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    process.env.TELEGRAM_BOT_TOKEN = '123:' + randomBytes(24).toString('hex');
    process.env.TELEGRAM_BOT_USERNAME = 'queue_test_bot';
    process.env.TELEGRAM_WEBHOOK_SECRET = randomBytes(32).toString('hex');
    const database = new DatabaseService();
    const ai = new QueueAi();
    const telegram = new QueueTelegram();
    const repository = new IntegrationRepository(database);
    const service = new IntegrationService(repository, ai, new FinanceService(database), telegram);
    const paused = new PausedQueueWorker(database, service, telegram);
    const worker = new TelegramWorker(database, service, telegram);
    const queue = new TelegramQueueRepository(database);
    let startId = 10000;
    const enqueue = (id: number, actor: number, text: string) =>
      paused.receive(process.env.TELEGRAM_WEBHOOK_SECRET, message(id, actor, text));
    async function link(userId: string, actor: number) {
      const token = new URL((await service.startLink(userId)).url).searchParams.get('start');
      await service.handle(message(startId++, actor, `/start ${token}`));
      await service.confirmLink(userId, String(actor));
    }
    async function waitFor(condition: () => boolean) {
      for (let attempt = 0; attempt < 300 && !condition(); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.ok(condition(), 'Timed out waiting for a synthetic operation');
    }
    try {
      await database.onModuleInit();
      const auth = new AuthService(database);
      const alice = (await auth.register('Alice', 'alice@example.test', 'synthetic-password')).user;
      const bob = (await auth.register('Bob', 'bob@example.test', 'synthetic-password')).user;
      for (const [user, model] of [
        [alice, 'alice-model'],
        [bob, 'bob-model'],
      ] as const) {
        await service.saveAi(user.id, {
          provider: 'deepseek',
          model,
          apiKey: randomBytes(24).toString('hex'),
          consent: true,
        });
      }
      ai.cardId = String(
        (await new FinanceService(database).save(alice.id, 'cards', { name: 'Synthetic card' })).id,
      );
      await link(alice.id, 101);
      await link(bob.id, 202);
      await enqueue(10, 101, 'PRIVATE_OLD_ACCOUNT_MESSAGE');
      const bound = (
        await database.query(
          'SELECT owner_id,binding_version FROM telegram_updates WHERE update_id=10',
        )
      )[0];
      assert.equal(bound.owner_id, alice.id);
      await repository.disconnect(alice.id);
      await repository.disconnect(bob.id);
      await link(bob.id, 101);
      await worker.drain();
      assert.equal(ai.calls.length, 0);
      assert.equal(telegram.sent.length, 0);
      assert.deepEqual(
        (await database.query('SELECT payload FROM telegram_updates WHERE update_id=10'))[0]
          .payload,
        {},
      );

      await enqueue(11, 101, 'PRIVATE_OLD_BINDING_MESSAGE');
      await repository.disconnect(bob.id);
      await link(bob.id, 101);
      await worker.drain();
      assert.equal(ai.calls.length, 0);
      assert.equal(telegram.sent.length, 0);

      await enqueue(12, 303, 'PRIVATE_UNLINKED_MESSAGE');
      await repository.disconnect(bob.id);
      await link(bob.id, 303);
      await worker.drain();
      assert.equal(ai.calls.length, 0);
      assert.ok(telegram.sent.every((reply) => !reply.text.includes('PRIVATE_')));
      telegram.sent = [];

      const oldToken = new URL((await service.startLink(alice.id)).url).searchParams.get('start');
      await enqueue(13, 404, `/start ${oldToken}`);
      await service.startLink(alice.id);
      await worker.drain();
      assert.equal((await service.status(alice.id)).candidate, null);

      await link(alice.id, 101);
      let release!: () => void;
      ai.wait = new Promise<void>((resolve) => {
        release = resolve;
      });
      await enqueue(20, 101, 'PRIVATE_IN_FLIGHT_MESSAGE');
      const inFlight = worker.drain();
      await waitFor(() => ai.calls.length === 1);
      await repository.disconnect(alice.id);
      await link(alice.id, 101);
      const sentBefore = telegram.sent.length;
      release();
      await inFlight;
      ai.wait = undefined;
      assert.equal(telegram.sent.length, sentBefore);
      assert.equal(
        (await new FinanceService(database).list(alice.id)).filter(
          (record) => record.kind === 'transactions',
        ).length,
        0,
      );
      assert.equal(
        (await database.query('SELECT id FROM telegram_drafts WHERE update_id=20')).length,
        0,
      );

      await database.query('UPDATE integration_settings SET ai_last_at=NULL WHERE user_id=$1', [
        alice.id,
      ]);
      telegram.fail = true;
      await enqueue(21, 101, 'PRIVATE_OUTBOX_MESSAGE');
      await worker.drain();
      assert.equal(
        (await database.query('SELECT state FROM telegram_updates WHERE update_id=21'))[0].state,
        'queued',
      );
      await repository.disconnect(alice.id);
      await repository.disconnect(bob.id);
      await link(bob.id, 101);
      await database.query('UPDATE telegram_updates SET available_at=NOW() WHERE update_id=21');
      telegram.fail = false;
      await worker.drain();
      assert.equal(telegram.sent.length, sentBefore);
      assert.equal(ai.calls.length, 2);

      for (let index = 0; index < 8; index++) {
        await enqueue(100 + index, 101, '/help');
      }
      await assert.rejects(
        enqueue(108, 101, '/help'),
        (error) => (error as { getStatus: () => number }).getStatus() === 429,
      );
      await enqueue(100, 101, '/help');
      assert.equal(
        Number(
          (
            await database.query(
              "SELECT COUNT(*) AS count FROM telegram_updates WHERE actor_id='101' AND state='queued'",
            )
          )[0].count,
        ),
        8,
      );
      await link(alice.id, 505);
      await enqueue(109, 505, '/help');
      await worker.drain();
      await worker.drain();
      assert.ok(telegram.sent.some((reply) => reply.chatId === '505'));
      await database.query(
        "UPDATE telegram_actors SET received_count=20,window_started_at=NOW() WHERE actor_id='101'",
      );
      await assert.rejects(enqueue(110, 101, '/help'));
      await database.query(
        "UPDATE telegram_actors SET window_started_at=NOW()-INTERVAL '2 minutes' WHERE actor_id='101'",
      );
      await enqueue(111, 101, '/help');
      await worker.drain();
      assert.equal(
        Number(
          (
            await database.query("SELECT received_count FROM telegram_actors WHERE actor_id='101'")
          )[0].received_count,
        ),
        1,
      );

      const beforeIgnored = Number(
        (await database.query('SELECT COUNT(*) AS count FROM telegram_updates'))[0].count,
      );
      const group = message(120, 999, '/help');
      group.message!.chat.type = 'group';
      await paused.receive(process.env.TELEGRAM_WEBHOOK_SECRET, group);
      const forged = message(121, 999, '/help');
      forged.message!.chat.id = 101;
      await paused.receive(process.env.TELEGRAM_WEBHOOK_SECRET, forged);
      assert.equal(
        Number((await database.query('SELECT COUNT(*) AS count FROM telegram_updates'))[0].count),
        beforeIgnored,
      );

      await enqueue(200, 505, '/help');
      await enqueue(201, 505, '/help');
      await enqueue(202, 505, '/help');
      await enqueue(203, 101, '/help');
      await enqueue(204, 606, '/help');
      await database.query('UPDATE telegram_actors SET last_served_at=NULL');
      const started: number[] = [];
      const active = new Set<string>();
      let concurrent = 0;
      let maximum = 0;
      const waiting = new Promise<void>((resolve) => {
        release = resolve;
      });
      const scheduling = {
        handle: async (update: TelegramUpdate, context: { actorId: string }) => {
          assert.equal(active.has(context.actorId), false);
          active.add(context.actorId);
          concurrent++;
          maximum = Math.max(maximum, concurrent);
          started.push(update.update_id);
          if (update.update_id === 200) {
            await waiting;
          }
          concurrent--;
          active.delete(context.actorId);
          return null;
        },
        canDeliver: async () => true,
      } as unknown as IntegrationService;
      const fairWorker = new TelegramWorker(database, scheduling, telegram);
      const processing = fairWorker.drain();
      await waitFor(() => started.includes(203) && started.includes(204));
      assert.ok(started.includes(200));
      assert.equal(started.includes(201), false);
      release();
      await processing;
      assert.equal(maximum, 2);
      assert.ok(started.indexOf(201) < started.indexOf(202));
      fairWorker.onModuleDestroy();

      await enqueue(300, 505, '/help');
      const first = await queue.claim();
      assert.ok(first);
      assert.equal(await queue.claim(), undefined);
      await database.query(
        "UPDATE telegram_actors SET leased_until=NOW()-INTERVAL '1 second' WHERE actor_id='505'",
      );
      await database.query(
        "UPDATE telegram_updates SET available_at=NOW()-INTERVAL '1 second' WHERE update_id=300",
      );
      const reclaimed = await queue.claim();
      assert.ok(reclaimed);
      assert.notEqual(reclaimed.lease_token, first.lease_token);
      await queue.finish(first);
      assert.equal(
        (await database.query('SELECT lease_token FROM telegram_updates WHERE update_id=300'))[0]
          .lease_token,
        reclaimed.lease_token,
      );
      await queue.finish(reclaimed);
      const oldSettings = await repository.settings(alice.id);
      assert.ok(oldSettings);
      await repository.disconnect(alice.id);
      await link(alice.id, 505);
      assert.equal(await repository.disconnect(alice.id, oldSettings.telegram_link_version), false);
      assert.equal((await service.status(alice.id)).telegram?.id, '505');
      const oldReply = await service.handle(message(400, 505, '/help'));
      assert.ok(oldReply);
      await enqueue(401, 505, '/help');
      const beforeCredentialChange = telegram.sent.length;
      await service.saveAi(alice.id, { provider: 'deepseek', model: 'alice-model', consent: true });
      await worker.drain();
      assert.equal(telegram.sent.length, beforeCredentialChange);
      assert.equal(await service.canDeliver(oldReply), false);
      await enqueue(402, 505, '/help');
      await repository.deleteAi(alice.id);
      await worker.drain();
      assert.equal(telegram.sent.length, beforeCredentialChange);
      await assert.rejects(
        database.forUser(alice.id, (executor) => executor.query('SELECT * FROM telegram_actors')),
      );
      const security = await database.query(
        "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname='telegram_actors'",
      );
      assert.ok(security[0].relrowsecurity && security[0].relforcerowsecurity);
      assert.ok(ai.calls.every((call) => call.model === 'alice-model'));
    } finally {
      paused.onModuleDestroy();
      worker.onModuleDestroy();
      await database.onModuleDestroy();
      for (const name of names) {
        if (previous[name] === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = previous[name];
        }
      }
      await rm(directory, { recursive: true });
    }
  },
);
