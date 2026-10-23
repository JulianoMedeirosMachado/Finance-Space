import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildTelegramExpense } from '../src/integrations/telegram-expense';
import { expenseProposalSchema } from '../src/integrations/integration.schema';
import { monthlyEntries } from '../src/finance/calculations';
import type { FinanceRecord } from '../src/finance/finance.schema';

test('Telegram installment totals and per-installment amounts use integer cents without losing remainders', () => {
  const cardId = randomUUID();
  const input = {
    description: 'Shoes',
    amount: 30000,
    date: '2026-10-23',
    month: '2026-11',
    cardId,
    accountId: null,
    categoryId: null,
    clarification: null,
    installments: 3,
    amountBasis: 'total',
  };
  const total = buildTelegramExpense(expenseProposalSchema.parse(input), []);
  assert.equal(total.kind, 'installments');
  assert.equal(total.data.amount, 10000);
  assert.equal(total.data.count, 3);
  assert.equal(total.data.startMonth, '2026-11');
  assert.equal(total.data.finalAmount, undefined);
  assert.equal(total.data.date, undefined);
  const perInstallment = buildTelegramExpense(
    expenseProposalSchema.parse({ ...input, amountBasis: 'per_installment' }),
    [],
  );
  assert.equal(perInstallment.data.amount, 30000);
  const rounded = buildTelegramExpense(
    expenseProposalSchema.parse({ ...input, amount: 10000 }),
    [],
  );
  const record: FinanceRecord = {
    id: randomUUID(),
    kind: rounded.kind,
    data: rounded.data,
    version: 1,
  };
  const months = ['2026-11', '2026-12', '2027-01'];
  const entries = months.map((month) => monthlyEntries([record], month)[0]);
  assert.deepEqual(
    entries.map((entry) => entry.amount),
    [3333, 3333, 3334],
  );
  assert.deepEqual(
    entries.map((entry) => entry.remainingAmount),
    [6667, 3334, 0],
  );
  assert.equal(
    entries.reduce((sum, entry) => sum + entry.amount, 0),
    10000,
  );
  assert.equal(monthlyEntries([record], '2027-02').length, 0);
  assert.throws(() =>
    buildTelegramExpense(expenseProposalSchema.parse({ ...input, amount: 1 }), []),
  );
  assert.throws(() =>
    buildTelegramExpense(
      expenseProposalSchema.parse({ ...input, cardId: null, accountId: randomUUID() }),
      [],
    ),
  );
});

test('old ordinary-expense proposals still default to a single transaction', () => {
  const value = expenseProposalSchema.parse({
    description: 'Paper',
    amount: 2290,
    date: '2026-10-23',
    month: '2026-10',
    cardId: randomUUID(),
    accountId: null,
    categoryId: null,
    clarification: null,
  });
  assert.equal(value.installments, 1);
  const expense = buildTelegramExpense(value, []);
  assert.equal(expense.kind, 'transactions');
  assert.equal(expense.data.amount, 2290);
  assert.equal(expense.data.count, undefined);
});
