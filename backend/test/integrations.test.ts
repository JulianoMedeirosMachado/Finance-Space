import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AuthService } from '../src/auth/auth.service';
import { DatabaseService } from '../src/database/database.service';
import { FinanceService } from '../src/finance/finance.service';
import { AiService, AiCredential } from '../src/integrations/ai.service';
import { SecretVault } from '../src/integrations/secret-vault';
import { IntegrationRepository } from '../src/integrations/integration.repository';
import { IntegrationService } from '../src/integrations/integration.service';
import { TelegramClient } from '../src/integrations/telegram.client';
import { TelegramWorker } from '../src/integrations/telegram.worker';
import {
  aiSettingsSchema,
  BotReply,
  EntryProposal,
  TelegramUpdate,
} from '../src/integrations/integration.schema';

test('AI secrets are authenticated, owner-bound and fail closed without a valid server key', () => {
  const previous = process.env.INTEGRATION_ENCRYPTION_KEY;
  try {
    process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    const vault = new SecretVault();
    const secret = randomBytes(30).toString('hex');
    const encrypted = vault.encrypt(secret, 'owner');
    assert.ok(!encrypted.includes(secret));
    assert.equal(vault.decrypt(encrypted, 'owner'), secret);
    assert.throws(() => vault.decrypt(encrypted, 'another-owner'));
    const parts = encrypted.split('.');
    parts[1] = randomBytes(16).toString('base64');
    assert.throws(() => vault.decrypt(parts.join('.'), 'owner'));
    delete process.env.INTEGRATION_ENCRYPTION_KEY;
    assert.equal(vault.available(), false);
    assert.throws(() => vault.encrypt(secret, 'owner'));
    assert.equal(
      aiSettingsSchema.safeParse({ provider: 'deepseek', model: 'model', consent: false }).success,
      false,
    );
  } finally {
    if (previous === undefined) {
      delete process.env.INTEGRATION_ENCRYPTION_KEY;
    } else {
      process.env.INTEGRATION_ENCRYPTION_KEY = previous;
    }
  }
});

test('AI adapter uses fixed HTTPS endpoints, minimal catalogs, JSON validation and redacted provider errors', async () => {
  const previous = globalThis.fetch;
  const credential: AiCredential = {
    provider: 'openrouter',
    model: 'vendor/model',
    apiKey: randomBytes(20).toString('hex'),
  };
  try {
    let output = '{"ok":true}';
    let called = '';
    let request: any;
    globalThis.fetch = async (url, options) => {
      called = String(url);
      request = JSON.parse(String(options?.body));
      assert.equal(
        new Headers(options?.headers).get('Authorization'),
        `Bearer ${credential.apiKey}`,
      );
      return new Response(JSON.stringify({ choices: [{ message: { content: output } }] }), {
        status: 200,
      });
    };
    const ai = new AiService();
    await ai.test(credential);
    assert.equal(called, 'https://openrouter.ai/api/v1/chat/completions');
    assert.equal(request.provider.data_collection, 'deny');
    assert.equal(request.provider.allow_fallbacks, false);
    assert.equal(request.response_format.type, 'json_object');
    assert.equal(request.max_tokens, 800);
    output = JSON.stringify({
      description: 'Paper',
      amount: 2290,
      date: '2026-10-23',
      month: '2026-10',
      accountId: null,
      cardId: randomUUID(),
      categoryId: null,
      clarification: null,
    });
    await ai.interpret(
      { ...credential, provider: 'deepseek' },
      'Paper 22,90',
      [
        {
          id: randomUUID(),
          kind: 'accounts',
          data: { name: 'Checking', openingBalance: 987654321 },
          version: 1,
        },
      ],
      'English',
    );
    assert.equal(called, 'https://api.deepseek.com/chat/completions');
    assert.ok(!JSON.stringify(request).includes('987654321'));
    assert.ok(!JSON.stringify(request.messages).includes(credential.apiKey));
    const instructions = request.messages[0].content;
    assert.match(instructions, /recognize abbreviations, initials, nicknames/);
    assert.match(instructions, /"ML", "MP" or "Mercado Livre"/);
    assert.match(instructions, /prefer an exact match/);
    assert.match(instructions, /Distinguish merchants from payment instruments/);
    assert.match(instructions, /Only use exact IDs from the catalog/);
    assert.match(instructions, /amountBasis="per_installment"/);
    assert.match(instructions, /nature="income"/);
    assert.match(instructions, /recurrence="monthly"/);
    assert.match(instructions, /Other frequencies \(weekly, yearly, etc.\) are unsupported/);
    const personId = randomUUID();
    output = JSON.stringify({ ...JSON.parse(output), personId, personMentioned: true });
    const assigned = await ai.interpret(
      credential,
      'Marta, shoes 300 on ML',
      [
        {
          id: personId,
          kind: 'people',
          data: { name: 'Marta PRIVATE_SURNAME', isSelf: false },
          version: 1,
        },
        {
          id: randomUUID(),
          kind: 'people',
          data: { name: 'PRIVATE_OTHER', isSelf: false },
          version: 1,
        },
        {
          id: randomUUID(),
          kind: 'people',
          data: { name: 'PRIVATE_SELF', isSelf: true },
          version: 1,
        },
      ],
      'English',
    );
    assert.equal(assigned.personId, personId);
    assert.equal(assigned.personMentioned, true);
    assert.ok(JSON.stringify(request.messages).includes(personId));
    assert.ok(!JSON.stringify(request.messages).includes('PRIVATE_'));
    output = JSON.stringify({
      ...JSON.parse(output),
      nature: 'income',
      recurrence: 'monthly',
      day: 5,
      endMonth: null,
      accountId: randomUUID(),
      cardId: null,
      personId: null,
      personMentioned: false,
    });
    const monthlyIncome = await ai.interpret(
      credential,
      'Salary monthly into Checking',
      [],
      'English',
    );
    assert.equal(monthlyIncome.nature, 'income');
    assert.equal(monthlyIncome.recurrence, 'monthly');
    assert.equal(monthlyIncome.day, 5);
    assert.equal(request.max_tokens, 800);
    output = JSON.stringify({
      title: 'Summary',
      summary: 'Only aggregate data is used.',
      findings: [
        {
          title: 'Budget',
          detail: 'Review recorded commitments.',
          suggestion: 'Check the next reporting month.',
        },
      ],
    });
    await ai.insights(credential, { currency: 'BRL', recordedCashBalance: 10000 }, 'English');
    assert.equal(request.max_tokens, 2200);
    assert.deepEqual(JSON.parse(request.messages[1].content), {
      currency: 'BRL',
      recordedCashBalance: 10000,
    });
    assert.ok(!JSON.stringify(request.messages).includes(credential.apiKey));
    output = JSON.stringify({ amount: -100 });
    await assert.rejects(ai.insights(credential, {}, 'English'));
    await assert.rejects(ai.interpret(credential, 'bad input', [], 'English'));
    globalThis.fetch = async () => new Response(credential.apiKey, { status: 401 });
    await assert.rejects(
      ai.test(credential),
      (error) => error instanceof Error && !error.message.includes(credential.apiKey),
    );
  } finally {
    globalThis.fetch = previous;
  }
});

class FakeAi extends AiService {
  calls: AiCredential[] = [];
  proposal!: EntryProposal;
  async interpret(credential: AiCredential) {
    this.calls.push(credential);
    return this.proposal;
  }
  async test() {
    return { success: true };
  }
}
class FakeTelegram extends TelegramClient {
  sent: BotReply[] = [];
  fail = false;
  async acknowledge() {}
  async send(reply: BotReply) {
    if (this.fail) {
      throw new Error('Simulated network failure');
    } else {
      this.sent.push(reply);
    }
  }
}
class PausedWorker extends TelegramWorker {
  async drain() {}
}
const message = (
  updateId: number,
  actorId: number,
  text: string,
  type = 'private',
): TelegramUpdate => ({
  update_id: updateId,
  message: {
    message_id: updateId,
    from: { id: actorId, first_name: `Person ${actorId}` },
    chat: { id: actorId, type },
    text,
  },
});
const callback = (updateId: number, actorId: number, action: string): TelegramUpdate => ({
  update_id: updateId,
  callback_query: {
    id: String(updateId),
    from: { id: actorId },
    data: action,
    message: { message_id: 1, chat: { id: actorId, type: 'private' } },
  },
});

test(
  'Telegram linking, tenant isolation, durable retries and confirmations survive restarts without duplicate expenses',
  { timeout: 45000 },
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
    const directory = await mkdtemp(join(tmpdir(), 'finance-integrations-'));
    process.env.DATA_DIRECTORY = directory;
    process.env.DATABASE_URL = '';
    process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    process.env.TELEGRAM_BOT_TOKEN = `123:${randomBytes(24).toString('base64url')}`;
    process.env.TELEGRAM_BOT_USERNAME = 'finance_test_bot';
    process.env.TELEGRAM_WEBHOOK_SECRET = randomBytes(32).toString('hex');
    let database = new DatabaseService();
    const ai = new FakeAi();
    const telegram = new FakeTelegram();
    const service = () =>
      new IntegrationService(
        new IntegrationRepository(database),
        ai,
        new FinanceService(database),
        telegram,
      );
    try {
      await database.onModuleInit();
      const auth = new AuthService(database);
      const alice = (
        await auth.register('Alice', 'alice@example.test', 'correct-password', 'en-US')
      ).user;
      const bob = (await auth.register('Bob', 'bob@example.test', 'correct-password')).user;
      const aliceKey = randomBytes(25).toString('hex');
      const bobKey = randomBytes(25).toString('hex');
      await service().saveAi(alice.id, {
        provider: 'deepseek',
        model: 'model-a',
        apiKey: aliceKey,
        consent: true,
      });
      await service().saveAi(bob.id, {
        provider: 'openrouter',
        model: 'vendor/model-b',
        apiKey: bobKey,
        consent: true,
      });
      await service().saveAi(alice.id, { provider: 'deepseek', model: 'model-a2', consent: true });
      await assert.rejects(
        service().saveAi(alice.id, {
          provider: 'openrouter',
          model: 'vendor/model',
          consent: true,
        }),
      );
      assert.ok(!JSON.stringify(await service().status(alice.id)).includes(aliceKey));
      const ciphertext = (
        await database.query('SELECT encrypted_key FROM integration_settings WHERE user_id=$1', [
          alice.id,
        ])
      )[0].encrypted_key;
      assert.notEqual(ciphertext, aliceKey);

      async function link(userId: string, telegramId: number, updateId: number) {
        const otherUserId = userId === alice.id ? bob.id : alice.id;
        const otherStatus = await service().status(otherUserId);
        const url = await service().startLink(userId);
        const token = new URL(url.url).searchParams.get('start')!;
        await service().handle(message(updateId + 1000, 404, '/start'));
        assert.equal((await service().status(userId)).candidate, null);
        await service().handle(message(updateId, telegramId, `/start ${token}`));
        assert.equal((await service().status(userId)).telegram, null);
        assert.equal((await service().status(userId)).candidate?.id, String(telegramId));
        assert.deepEqual(await service().status(otherUserId), otherStatus);
        await assert.rejects(service().confirmLink(otherUserId, String(telegramId)));
        await service().handle(message(updateId + 2000, 404, `/start ${token}`));
        assert.equal((await service().status(userId)).candidate?.id, String(telegramId));
        await assert.rejects(service().confirmLink(userId, '999'));
        await service().confirmLink(userId, String(telegramId));
        assert.equal((await service().status(userId)).candidate, null);
        await assert.rejects(service().confirmLink(userId, String(telegramId)));
      }
      await link(alice.id, 101, 1);
      await link(bob.id, 202, 2);
      await assert.rejects(service().startLink(alice.id));
      assert.equal(await service().handle(message(3, 101, 'ignore', 'group')), null);
      assert.match(
        (await service().handle(message(4, 303, 'unknown')))?.text || '',
        /Connect your account/,
      );

      const finance = new FinanceService(database);
      const card = await finance.save(alice.id, 'cards', { name: 'Mercado Pago' });
      const category = await finance.save(alice.id, 'categories', { name: 'Hygiene' });
      const bobAccount = await finance.save(bob.id, 'accounts', {
        name: 'Checking',
        openingMonth: '2026-10',
      });
      ai.proposal = {
        description: 'Paper',
        amount: 2290,
        date: '2026-10-23',
        month: '2026-11',
        accountId: null,
        cardId: String(card.id),
        categoryId: String(category.id),
        clarification: null,
        installments: 1,
        amountBasis: 'total',
        nature: 'expense',
        recurrence: 'none',
        day: null,
        endMonth: null,
        personId: null,
        personMentioned: false,
      };
      const proposal = await service().handle(
        message(10, 101, 'Paper 22,90 on ML card for November'),
      );
      assert.equal(ai.calls[0].apiKey, aliceKey);
      assert.match(proposal?.text || '', /2026-11/);
      assert.match(proposal?.text || '', /Suggested card: Mercado Pago/);
      assert.match(proposal?.text || '', /Names and abbreviations may have been interpreted/);
      assert.equal(
        (await finance.list(alice.id)).filter((record) => record.kind === 'transactions').length,
        0,
      );
      await service().handle(message(10, 101, 'duplicate update'));
      assert.equal(ai.calls.length, 1);
      const action = proposal!.buttons![0][0].callback_data;
      await service().handle(callback(11, 202, action));
      assert.equal(
        (await finance.list(bob.id)).filter((record) => record.kind === 'transactions').length,
        0,
      );
      assert.equal(
        (
          await database.forUser(bob.id, (executor) =>
            executor.query('SELECT * FROM telegram_drafts'),
          )
        ).length,
        0,
      );
      assert.equal(
        (
          await database.forUser(bob.id, (executor) =>
            executor.query('SELECT * FROM integration_settings'),
          )
        ).length,
        1,
      );
      await assert.rejects(
        database.forUser(alice.id, (executor) => executor.query('SELECT * FROM telegram_updates')),
      );
      const security = await database.query(
        "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname IN ('integration_settings','telegram_drafts','telegram_updates')",
      );
      assert.equal(security.length, 3);
      assert.ok(security.every((row) => row.relrowsecurity && row.relforcerowsecurity));

      const paused = new PausedWorker(database, service(), telegram);
      await assert.rejects(paused.receive('invalid', message(20, 101, 'not authorized')));
      await paused.receive(process.env.TELEGRAM_WEBHOOK_SECRET, callback(21, 101, action));
      await paused.receive(process.env.TELEGRAM_WEBHOOK_SECRET, callback(21, 101, action));
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal((await database.query('SELECT update_id FROM telegram_updates')).length, 1);
      await database.query(
        "UPDATE telegram_updates SET state='processing',attempts=1,available_at=NOW()-INTERVAL '1 second'",
      );
      paused.onModuleDestroy();
      await database.onModuleDestroy();
      database = new DatabaseService();
      await database.onModuleInit();
      const worker = new TelegramWorker(database, service(), telegram);
      telegram.fail = true;
      await worker.drain();
      assert.equal(
        (await new FinanceService(database).list(alice.id)).filter(
          (record) => record.kind === 'transactions',
        ).length,
        1,
      );
      assert.equal((await database.query('SELECT state FROM telegram_updates'))[0].state, 'queued');
      await database.query('UPDATE telegram_updates SET available_at=NOW()');
      telegram.fail = false;
      await worker.drain();
      const transactions = (await new FinanceService(database).list(alice.id)).filter(
        (record) => record.kind === 'transactions',
      );
      assert.equal(transactions.length, 1);
      assert.equal(transactions[0].data.amount, 2290);
      assert.equal(transactions[0].data.month, '2026-11');
      assert.equal(transactions[0].data.status, 'posted');
      assert.equal((await database.query('SELECT state FROM telegram_updates'))[0].state, 'done');
      assert.deepEqual(
        (await database.query('SELECT payload FROM telegram_updates'))[0].payload,
        {},
      );
      await Promise.all([
        service().handle(callback(22, 101, action)),
        service().handle(callback(23, 101, action)),
      ]);
      assert.equal(
        (await new FinanceService(database).list(alice.id)).filter(
          (record) => record.kind === 'transactions',
        ).length,
        1,
      );

      await database.query('UPDATE integration_settings SET ai_last_at=NULL WHERE user_id=$1', [
        alice.id,
      ]);
      ai.proposal = {
        ...ai.proposal,
        description: 'Shoes',
        amount: 10000,
        installments: 3,
        amountBasis: 'total',
      };
      const installmentPreview = await service().handle(
        message(24, 101, 'Shoes 100 reais on ML in 3 installments for November'),
      );
      assert.match(installmentPreview!.text, /Installment plan/);
      assert.match(installmentPreview!.text, /Last installment: R\$33\.34/);
      const planAction = installmentPreview!.buttons![0][0].callback_data;
      await Promise.all([
        service().handle(callback(25, 101, planAction)),
        service().handle(callback(26, 101, planAction)),
      ]);
      const plans = (await new FinanceService(database).list(alice.id)).filter(
        (record) => record.kind === 'installments',
      );
      assert.equal(plans.length, 1);
      assert.equal(plans[0].data.amount, 3333);
      assert.equal(plans[0].data.finalAmount, 3334);
      assert.equal(plans[0].data.startMonth, '2026-11');
      ai.proposal = {
        ...ai.proposal,
        installments: 1,
        accountId: String(bobAccount.id),
        cardId: null,
        categoryId: null,
      };
      await service().handle(message(30, 202, 'Coffee 22,90 in checking'));
      assert.equal(ai.calls.at(-1)!.apiKey, bobKey);
      assert.equal(ai.calls.at(-1)!.provider, 'openrouter');
      const bobDraft = (
        await database.query('SELECT id FROM telegram_drafts WHERE user_id=$1', [bob.id])
      )[0];
      await service().repository.deleteAi(bob.id);
      await service().handle(callback(31, 202, `confirm:${bobDraft.id}`));
      assert.equal(
        (await new FinanceService(database).list(bob.id)).filter(
          (record) => record.kind === 'transactions',
        ).length,
        0,
      );
      await database.query('UPDATE integration_settings SET ai_last_at=NULL WHERE user_id=$1', [
        alice.id,
      ]);
      const draftCount = Number(
        (await database.query('SELECT COUNT(*) AS count FROM telegram_drafts'))[0].count,
      );
      ai.proposal = { ...ai.proposal, accountId: String(bobAccount.id), cardId: null };
      await service().handle(message(40, 101, 'Invalid foreign account'));
      assert.equal(
        Number((await database.query('SELECT COUNT(*) AS count FROM telegram_drafts'))[0].count),
        draftCount,
      );
      await database.query(
        'UPDATE integration_settings SET ai_day=CURRENT_DATE,ai_count=100,ai_last_at=NULL WHERE user_id=$1',
        [alice.id],
      );
      await assert.rejects(service().testAi(alice.id));
      const confirmedData = transactions[0].data;
      const expiredId = randomUUID();
      const cancelledId = randomUUID();
      await database.query(
        "INSERT INTO telegram_drafts(id,user_id,update_id,data,expires_at) VALUES($1,$2,41,$3,NOW()-INTERVAL '1 second')",
        [expiredId, alice.id, JSON.stringify(confirmedData)],
      );
      await database.query(
        'INSERT INTO telegram_drafts(id,user_id,update_id,data) VALUES($1,$2,42,$3)',
        [cancelledId, alice.id, JSON.stringify(confirmedData)],
      );
      assert.match(
        (await service().handle(callback(43, 101, `confirm:${expiredId}`)))!.text,
        /expired/,
      );
      assert.match(
        (await service().handle(callback(44, 101, `cancel:${cancelledId}`)))!.text,
        /Cancelled/,
      );
      await service().handle(callback(45, 101, `confirm:${cancelledId}`));
      assert.equal(
        (await new FinanceService(database).list(alice.id)).filter(
          (record) => record.kind === 'transactions',
        ).length,
        1,
      );
      await service().repository.disconnect(bob.id);
      const expiredLink = await service().startLink(bob.id);
      await database.query(
        "UPDATE integration_settings SET link_expires_at=NOW()-INTERVAL '1 second' WHERE user_id=$1",
        [bob.id],
      );
      await service().handle(
        message(46, 202, `/start ${new URL(expiredLink.url).searchParams.get('start')}`),
      );
      assert.equal((await service().status(bob.id)).candidate, null);
      await assert.rejects(service().confirmLink(bob.id, '202'));
      await service().repository.disconnect(alice.id);
      assert.equal((await service().status(alice.id)).telegram, null);
      const sentBeforeDisconnect = telegram.sent.length;
      await database.query(
        "INSERT INTO telegram_updates(update_id,payload,reply) VALUES(99,'{}'::jsonb,$1)",
        [JSON.stringify({ ownerId: alice.id, chatId: '101', text: 'Stale private preview' })],
      );
      await worker.drain();
      assert.equal(telegram.sent.length, sentBeforeDisconnect);
      assert.equal(
        (await database.query('SELECT state FROM telegram_updates WHERE update_id=99'))[0].state,
        'failed',
      );
      await service().handle(callback(32, 101, action));
      assert.equal(
        (await new FinanceService(database).list(alice.id)).filter(
          (record) => record.kind === 'transactions',
        ).length,
        1,
      );
      const finalPayment = await new FinanceService(database).realize(
        alice.id,
        '2027-01',
        plans[0].id,
      );
      assert.equal((finalPayment.data as Record<string, unknown>).amount, 3334);
      assert.equal((finalPayment.data as Record<string, unknown>).finalAmount, undefined);
      await link(alice.id, 101, 200);
      const restartedFinance = new FinanceService(database);
      const responsible = await restartedFinance.save(alice.id, 'people', {
        name: 'Marta Silva',
        isSelf: false,
      });
      for (const count of [1, 3]) {
        await database.query(
          'UPDATE integration_settings SET ai_last_at=NULL,ai_count=0 WHERE user_id=$1',
          [alice.id],
        );
        ai.proposal = {
          ...ai.proposal,
          description: `Responsible purchase ${count}`,
          accountId: null,
          cardId: String(card.id),
          amount: 30000,
          month: '2026-10',
          personId: String(responsible.id),
          personMentioned: true,
          installments: count,
        };
        const preview = await service().handle(
          message(201 + count, 101, `Marta, shoes 300 on ML in ${count} installments`),
        );
        assert.match(preview!.text, /Responsible person: Marta Silva/);
        const confirm = preview!.buttons![0][0].callback_data;
        await service().handle(callback(210 + count, 101, confirm));
        await service().handle(callback(220 + count, 101, confirm));
      }
      const assignedRecords = (await restartedFinance.list(alice.id)).filter(
        (record) => record.data.personId === responsible.id,
      );
      assert.equal(assignedRecords.filter((record) => record.kind === 'transactions').length, 1);
      assert.equal(assignedRecords.filter((record) => record.kind === 'installments').length, 1);
      assert.equal(assignedRecords.filter((record) => record.kind === 'settlements').length, 0);
      assert.equal(
        (await restartedFinance.list(bob.id)).some(
          (record) => record.data.personId === responsible.id,
        ),
        false,
      );
      const aliceAccount = await restartedFinance.save(alice.id, 'accounts', {
        name: 'Checking',
        openingMonth: '2026-10',
      });
      const entryCases = [
        {
          description: 'Streaming subscription',
          nature: 'expense' as const,
          recurrence: 'monthly' as const,
          day: 10,
          endMonth: '2026-12',
          accountId: null,
          cardId: String(card.id),
          expectedKind: 'recurring',
          preview: /Subscription \/ recurring expense/,
          confirmation: /Monthly schedule registered/,
        },
        {
          description: 'Sale received',
          nature: 'income' as const,
          recurrence: 'none' as const,
          day: null,
          endMonth: null,
          accountId: String(aliceAccount.id),
          cardId: null,
          expectedKind: 'transactions',
          preview: /Income received/,
          confirmation: /Income registered/,
        },
        {
          description: 'Monthly salary',
          nature: 'income' as const,
          recurrence: 'monthly' as const,
          day: 5,
          endMonth: null,
          accountId: String(aliceAccount.id),
          cardId: null,
          expectedKind: 'income',
          preview: /Recurring income \(planned\)/,
          confirmation: /Monthly schedule registered/,
        },
      ];
      for (const [index, entry] of entryCases.entries()) {
        await database.query(
          'UPDATE integration_settings SET ai_last_at=NULL,ai_count=0 WHERE user_id=$1',
          [alice.id],
        );
        ai.proposal = {
          ...ai.proposal,
          description: entry.description,
          nature: entry.nature,
          recurrence: entry.recurrence,
          day: entry.day,
          endMonth: entry.endMonth,
          accountId: entry.accountId,
          cardId: entry.cardId,
          personId: null,
          personMentioned: false,
          installments: 1,
          amount: 2000,
        };
        const preview = await service().handle(
          message(300 + index, 101, 'Complete financial entry'),
        );
        assert.match(preview!.text, entry.preview);
        if (entry.recurrence === 'monthly') {
          assert.match(preview!.text, /Planned monthly schedule only/);
          assert.match(preview!.text, /First reporting month: 2026-10/);
          assert.match(preview!.text, new RegExp(`Day: ${entry.day}`));
        }
        assert.equal(
          (await restartedFinance.list(alice.id)).filter(
            (record) => record.data.description === entry.description,
          ).length,
          0,
        );
        const confirm = preview!.buttons![0][0].callback_data;
        await service().handle(callback(310 + index, 202, confirm));
        assert.equal(
          (await restartedFinance.list(bob.id)).filter(
            (record) => record.data.description === entry.description,
          ).length,
          0,
        );
        const confirmed = await service().handle(callback(320 + index, 101, confirm));
        assert.match(confirmed!.text, entry.confirmation);
        await service().handle(callback(330 + index, 101, confirm));
        const saved = (await restartedFinance.list(alice.id)).filter(
          (record) => record.data.description === entry.description,
        );
        assert.equal(saved.length, 1);
        assert.equal(saved[0].kind, entry.expectedKind);
        assert.equal(saved[0].data.nature, entry.nature);
        assert.equal(saved[0].data.status, entry.recurrence === 'monthly' ? 'planned' : 'paid');
        if (entry.recurrence === 'monthly') {
          await restartedFinance.realize(alice.id, '2026-11', saved[0].id);
          const monthly = await restartedFinance.dashboard(alice.id, '2026-11');
          assert.equal(monthly.entries.filter((value) => value.sourceId === saved[0].id).length, 1);
        }
      }
      worker.onModuleDestroy();
    } finally {
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
