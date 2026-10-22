import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseService } from '../src/database/database.service';
import { AuthService, hashToken } from '../src/auth/auth.service';
import { FinanceService } from '../src/finance/finance.service';

test('accounts persist after a restart and reject cross-user references, edits and deletions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finance-space-test-'));
  process.env.DATA_DIRECTORY = directory;
  const database = new DatabaseService();
  await database.onModuleInit();
  const auth = new AuthService(database);
  const finance = new FinanceService(database);
  const alice = await auth.register('Alice', 'alice@example.test', 'correct-password');
  const bob = await auth.register('Bob', 'bob@example.test', 'correct-password');
  const account = await finance.save(alice.user.id, 'accounts', {
    name: 'Savings',
    openingBalance: 12345,
    openingMonth: '2026-10',
  });
  assert.equal((await finance.list(bob.user.id)).length, 0);
  await assert.rejects(finance.save(bob.user.id, 'cards', { name: 'Card', accountId: account.id }));
  await assert.rejects(
    finance.save(
      bob.user.id,
      'accounts',
      { name: 'Stolen', openingMonth: '2026-10' },
      String(account.id),
      1,
    ),
  );
  await assert.rejects(finance.remove(bob.user.id, String(account.id)));
  await assert.rejects(auth.login('alice@example.test', 'wrong-password'));
  await database.onModuleDestroy();
  const reopened = new DatabaseService();
  await reopened.onModuleInit();
  assert.equal(
    (await new FinanceService(reopened).list(alice.user.id))[0].data.openingBalance,
    12345,
  );
  assert.equal((await new AuthService(reopened).findUser(alice.token)).id, alice.user.id);
  const resetToken = 'a'.repeat(64);
  await reopened.query(
    "INSERT INTO password_resets(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '5 minutes')",
    [hashToken(resetToken), alice.user.id],
  );
  await new AuthService(reopened).resetPassword(resetToken, 'new-test-password');
  await assert.rejects(new AuthService(reopened).findUser(alice.token));
  await assert.rejects(
    new AuthService(reopened).resetPassword(resetToken, 'another-test-password'),
  );
  await assert.rejects(new AuthService(reopened).login('alice@example.test', 'correct-password'));
  const newSession = await new AuthService(reopened).login(
    'alice@example.test',
    'new-test-password',
  );
  assert.equal(newSession.user.id, alice.user.id);
  await new AuthService(reopened).logout(alice.token);
  await assert.rejects(new AuthService(reopened).findUser(alice.token));
  await reopened.onModuleDestroy();
  await rm(directory, { recursive: true });
});
