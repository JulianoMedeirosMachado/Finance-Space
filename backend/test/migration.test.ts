import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseService } from '../src/database/database.service';
import { AuthService } from '../src/auth/auth.service';
import { FinanceService } from '../src/finance/finance.service';

test('legacy schema upgrades preserve data and goals and contributions survive subsequent restarts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finance-space-migration-'));
  process.env.DATA_DIRECTORY = directory;
  const original = new DatabaseService();
  await original.onModuleInit();
  const user = (
    await new AuthService(original).register('User', 'migration@example.test', 'test-password-123')
  ).user;
  const finance = new FinanceService(original);
  await finance.save(user.id, 'benefits', {
    description: 'Credit',
    amount: 67200,
    month: '2026-10',
    date: '2026-10-01',
    nature: 'income',
  });
  await original.query(
    "ALTER TABLE records DROP CONSTRAINT records_kind_check, ADD CONSTRAINT records_kind_check CHECK(kind IN ('accounts','cards','categories','people','transactions','recurring','installments','invoices','income','benefits','settlements','history'))",
  );
  await original.query('DELETE FROM schema_migrations WHERE version=1');
  await original.query('ALTER TABLE users DROP COLUMN language');
  await original.query('DELETE FROM schema_migrations WHERE version=3');
  const before = await finance.list(user.id);
  await original.onModuleDestroy();
  const upgraded = new DatabaseService();
  await upgraded.onModuleInit();
  const upgradedFinance = new FinanceService(upgraded);
  const upgradedAuth = new AuthService(upgraded);
  assert.equal(
    (
      await upgradedAuth.findUser(
        (await upgradedAuth.login('migration@example.test', 'test-password-123')).token,
      )
    ).language,
    'pt-BR',
  );
  const session = await upgradedAuth.login('migration@example.test', 'test-password-123');
  await upgradedAuth.updateLanguage(session.token, 'en-US');
  assert.deepEqual(await upgradedFinance.list(user.id), before);
  const goal = await upgradedFinance.save(user.id, 'goals', {
    name: 'GPU',
    targetAmount: 500000,
    monthlyAmount: 10000,
  });
  await upgradedFinance.save(user.id, 'goalContributions', {
    goalId: goal.id,
    amount: 10000,
    date: '2026-10-22',
  });
  await assert.rejects(upgradedFinance.remove(user.id, String(goal.id)));
  await upgraded.onModuleDestroy();
  const restarted = new DatabaseService();
  await restarted.onModuleInit();
  const summary = await new FinanceService(restarted).dashboard(user.id, '2026-10');
  assert.equal(summary.goals[0].savedAmount, 10000);
  assert.equal(summary.goals[0].progress, 2);
  assert.equal(summary.benefits.balance, 67200);
  assert.deepEqual(
    (await restarted.query('SELECT version FROM schema_migrations ORDER BY version')).map(
      (row) => row.version,
    ),
    [1, 2, 3, 4],
  );
  assert.equal((await new AuthService(restarted).findUser(session.token)).language, 'en-US');
  await restarted.onModuleDestroy();
  await rm(directory, { recursive: true });
});
