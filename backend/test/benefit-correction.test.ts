import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseService } from '../src/database/database.service';
import { AuthService } from '../src/auth/auth.service';
import { FinanceService } from '../src/finance/finance.service';
import { benefitCorrectionSchema, parseRecordData } from '../src/finance/finance.schema';

test('benefit corrections preserve purchases and credits, carry forward, isolate owners and reject stale concurrent balances', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finance-benefit-correction-'));
  const previous = { directory: process.env.DATA_DIRECTORY, url: process.env.DATABASE_URL };
  process.env.DATA_DIRECTORY = directory;
  process.env.DATABASE_URL = '';
  let database = new DatabaseService();
  try {
    await database.onModuleInit();
    const auth = new AuthService(database);
    const alice = (await auth.register('Alice', 'alice@example.test', 'test-password-123')).user;
    const bob = (await auth.register('Bob', 'bob@example.test', 'test-password-123')).user;
    let finance = new FinanceService(database);
    for (const [nature, amount] of [
      ['income', 67200],
      ['expense', 20000],
    ] as const) {
      await finance.save(alice.id, 'benefits', {
        description: nature,
        nature,
        amount,
        month: '2026-09',
        date: '2026-09-01',
      });
    }
    const input = {
      month: '2026-09',
      balance: 10000,
      expectedBalance: 47200,
      note: 'Missing old purchases',
    };
    assert.deepEqual(await finance.correctBenefitBalance(alice.id, input), {
      balance: 10000,
      adjustment: -37200,
    });
    let summary = await finance.dashboard(alice.id, '2026-09');
    assert.equal(summary.benefits.credits, 67200);
    assert.equal(summary.benefits.spent, 20000);
    assert.equal(summary.benefits.adjustments, -37200);
    assert.equal(summary.benefits.balance, 10000);
    assert.equal(summary.expenses, 0);
    assert.equal(summary.income, 0);
    assert.equal((await finance.dashboard(alice.id, '2026-08')).benefits.balance, 0);
    assert.equal((await finance.dashboard(bob.id, '2026-09')).benefits.balance, 0);
    await assert.rejects(finance.correctBenefitBalance(alice.id, input), /saldo do vale mudou/);
    const count = (await finance.list(alice.id)).length;
    assert.equal(
      (await finance.correctBenefitBalance(alice.id, { ...input, expectedBalance: 10000 }))
        .adjustment,
      0,
    );
    assert.equal((await finance.list(alice.id)).length, count);
    await finance.save(alice.id, 'benefits', {
      description: 'October credit',
      nature: 'income',
      amount: 67200,
      month: '2026-10',
      date: '2026-10-01',
    });
    summary = await finance.dashboard(alice.id, '2026-10');
    assert.equal(summary.benefits.previousBalance, 10000);
    assert.equal(summary.benefits.balance, 77200);
    const attempts = await Promise.allSettled([
      finance.correctBenefitBalance(alice.id, {
        month: '2026-10',
        balance: 80000,
        expectedBalance: 77200,
      }),
      finance.correctBenefitBalance(alice.id, {
        month: '2026-10',
        balance: 90000,
        expectedBalance: 77200,
      }),
    ]);
    assert.equal(attempts.filter((attempt) => attempt.status === 'fulfilled').length, 1);
    assert.equal(attempts.filter((attempt) => attempt.status === 'rejected').length, 1);
    const corrected = (await finance.dashboard(alice.id, '2026-10')).benefits.balance;
    assert.ok(corrected === 80000 || corrected === 90000);
    await finance.correctBenefitBalance(alice.id, {
      month: '2026-10',
      balance: 0,
      expectedBalance: corrected,
    });
    assert.equal((await finance.dashboard(alice.id, '2026-11')).benefits.balance, 0);
    await finance.correctBenefitBalance(bob.id, {
      month: '2026-10',
      balance: 500,
      expectedBalance: 0,
    });
    const adjustment = (await finance.list(alice.id)).find(
      (record) => record.data.nature === 'adjustment',
    )!;
    await assert.rejects(
      finance.save(bob.id, 'benefits', adjustment.data, adjustment.id, adjustment.version),
    );
    await assert.rejects(finance.remove(bob.id, adjustment.id));
    await database.onModuleDestroy();
    database = new DatabaseService();
    await database.onModuleInit();
    finance = new FinanceService(database);
    assert.equal((await finance.dashboard(alice.id, '2026-11')).benefits.balance, 0);
    assert.equal((await finance.dashboard(bob.id, '2026-10')).benefits.balance, 500);
    const saved = (await finance.list(alice.id)).find((record) => record.id === adjustment.id)!;
    await finance.save(
      alice.id,
      'benefits',
      { ...saved.data, amount: -37000 },
      saved.id,
      saved.version,
    );
    assert.equal((await finance.dashboard(alice.id, '2026-11')).benefits.balance, 200);
    await finance.remove(alice.id, saved.id);
    assert.equal((await finance.dashboard(alice.id, '2026-11')).benefits.balance, 37200);
  } finally {
    await database.onModuleDestroy();
    if (previous.directory === undefined) {
      delete process.env.DATA_DIRECTORY;
    } else {
      process.env.DATA_DIRECTORY = previous.directory;
    }
    if (previous.url === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = previous.url;
    }
    await rm(directory, { recursive: true });
  }
});

test('benefit correction inputs reject invalid balances, owner injection and negative purchases', () => {
  for (const extra of [
    { balance: -1 },
    { balance: 1.5 },
    { balance: 100_000_000_001 },
    { month: 'bad' },
    { userId: 'other' },
    { note: 'x'.repeat(2001) },
  ]) {
    assert.equal(
      benefitCorrectionSchema.safeParse({
        month: '2026-10',
        balance: 100,
        expectedBalance: 0,
        ...extra,
      }).success,
      false,
    );
  }
  for (const nature of ['income', 'expense']) {
    assert.throws(() =>
      parseRecordData('benefits', {
        description: 'Invalid',
        nature,
        amount: -1,
        month: '2026-10',
        date: '2026-10-01',
      }),
    );
  }
});
