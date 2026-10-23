import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../src/database/database.service';
import { AuthService } from '../src/auth/auth.service';
import { FinanceService } from '../src/finance/finance.service';

test('database RLS isolates tenants even when a query omits ownership filters and denies unscoped access', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'finance-space-rls-'));
  process.env.DATA_DIRECTORY = directory;
  const database = new DatabaseService();
  await database.onModuleInit();
  try {
    const auth = new AuthService(database);
    const finance = new FinanceService(database);
    const alice = (await auth.register('Alice', 'alice@example.test', 'test-password-123')).user;
    const bob = (await auth.register('Bob', 'bob@example.test', 'test-password-123')).user;
    const a = await finance.save(alice.id, 'accounts', {
      name: 'Alice account',
      openingMonth: '2026-10',
    });
    await finance.save(bob.id, 'accounts', { name: 'Bob account', openingMonth: '2026-10' });
    const rows = await database.forUser(alice.id, (executor) =>
      executor.query('SELECT id FROM records'),
    );
    assert.deepEqual(rows, [{ id: a.id }]);
    assert.deepEqual(
      await database.forUser(bob.id, (executor) =>
        executor.query('SELECT id FROM records WHERE id=$1', [a.id]),
      ),
      [],
    );
    assert.deepEqual(
      await database.forUser(bob.id, (executor) =>
        executor.query('UPDATE records SET version=version+1 WHERE id=$1 RETURNING id', [a.id]),
      ),
      [],
    );
    assert.deepEqual(
      await database.forUser(bob.id, (executor) =>
        executor.query('DELETE FROM records WHERE id=$1 RETURNING id', [a.id]),
      ),
      [],
    );
    await assert.rejects(
      database.forUser(bob.id, (executor) =>
        executor.query('INSERT INTO records(id,user_id,kind,data) VALUES($1,$2,$3,$4)', [
          randomUUID(),
          alice.id,
          'accounts',
          JSON.stringify({ name: 'Forged', openingMonth: '2026-10', openingBalance: 0 }),
        ]),
      ),
    );
    const visible = await database.transaction(async (executor) => {
      await executor.query('SET LOCAL ROLE finance_space_runtime');
      return executor.query('SELECT id FROM records');
    });
    assert.deepEqual(visible, []);
    await assert.rejects(
      database.forUser(alice.id, (executor) => executor.query('SELECT password_hash FROM users')),
    );
    await assert.rejects(
      database.forUser(alice.id, (executor) => executor.query('SELECT * FROM sessions')),
    );
    const policy = await database.query(
      "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='public.records'::regclass",
    );
    assert.equal(policy[0].relrowsecurity, true);
    assert.equal(policy[0].relforcerowsecurity, true);
  } finally {
    await database.onModuleDestroy();
    await rm(directory, { recursive: true });
  }
});
