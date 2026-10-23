import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeGoals } from '../src/finance/goals';
import { summarize } from '../src/finance/calculations';
import { FinanceRecord, parseRecordData } from '../src/finance/finance.schema';

test('goals track contributions independently, cap progress and calculate the remaining planned contributions', () => {
  const records: FinanceRecord[] = [
    {
      id: 'gpu',
      kind: 'goals',
      version: 1,
      data: { name: 'GPU', targetAmount: 500000, monthlyAmount: 10000 },
    },
    {
      id: 'trip',
      kind: 'goals',
      version: 1,
      data: { name: 'Trip', targetAmount: 100000, monthlyAmount: 0 },
    },
    {
      id: 'a',
      kind: 'goalContributions',
      version: 1,
      data: { goalId: 'gpu', amount: 10000, date: '2026-09-01' },
    },
    {
      id: 'b',
      kind: 'goalContributions',
      version: 1,
      data: { goalId: 'gpu', amount: 10000, date: '2026-10-01' },
    },
    {
      id: 'c',
      kind: 'goalContributions',
      version: 1,
      data: { goalId: 'trip', amount: 120000, date: '2026-10-01' },
    },
  ];
  const goals = summarizeGoals(records);
  assert.equal(goals[0].savedAmount, 20000);
  assert.equal(goals[0].progress, 4);
  assert.equal(goals[0].remainingAmount, 480000);
  assert.equal(goals[0].estimatedContributions, 48);
  assert.equal(goals[1].progress, 100);
  assert.equal(goals[1].completed, true);
  assert.equal(goals[1].remainingAmount, 0);
  assert.equal(goals[1].estimatedContributions, null);
  const projection = summarize(records, '2026-10');
  assert.equal(projection.investments, 0);
  assert.equal(projection.expenses, 0);
  assert.equal(projection.income, 0);
  assert.deepEqual(projection.goals, goals);
});

test('goal validation rejects zero targets, negative monthly plans and non-positive contributions', () => {
  assert.throws(() => parseRecordData('goals', { name: 'GPU', targetAmount: 0 }));
  assert.throws(() =>
    parseRecordData('goals', { name: 'GPU', targetAmount: 10000, monthlyAmount: -1 }),
  );
  assert.throws(() =>
    parseRecordData('goalContributions', {
      goalId: '00000000-0000-4000-8000-000000000001',
      amount: 0,
      date: '2026-10-22',
    }),
  );
  assert.throws(() =>
    parseRecordData('goalContributions', {
      goalId: '00000000-0000-4000-8000-000000000001',
      amount: -100,
      date: '2026-10-22',
    }),
  );
});
