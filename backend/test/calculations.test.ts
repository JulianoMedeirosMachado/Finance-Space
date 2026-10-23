import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, dateInMonth, monthlyEntries, summarize } from '../src/finance/calculations';
import {
  FinanceData,
  FinanceRecord,
  parseRecordData,
  ResourceKind,
} from '../src/finance/finance.schema';

const record = (id: string, kind: ResourceKind, data: FinanceData): FinanceRecord => ({
  id,
  kind,
  data,
  version: 1,
});
test('calendar handles year changes, leap years and final installments', () => {
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(dateInMonth('2028-02', 31), '2028-02-29');
  const records = [
    record('purchase', 'installments', {
      description: 'Purchase',
      startMonth: '2026-12',
      count: 3,
      amount: 1001,
      nature: 'expense',
      active: true,
    }),
  ];
  assert.equal(monthlyEntries(records, '2026-11').length, 0);
  assert.equal(monthlyEntries(records, '2027-02')[0].installment, '3/3');
  assert.equal(monthlyEntries(records, '2027-02')[0].endMonth, '2027-02');
  assert.equal(monthlyEntries(records, '2027-02')[0].remainingAmount, 0);
  assert.equal(monthlyEntries(records, '2027-03').length, 0);
});
test('realizations replace a forecast and preserve historical amount after editing a schedule', () => {
  const schedule = record('salary', 'income', {
    description: 'Salary',
    startMonth: '2026-01',
    amount: 600000,
    active: true,
  });
  const realization = record('actual', 'transactions', {
    description: 'Salary',
    sourceId: 'salary',
    month: '2026-10',
    amount: 500000,
    nature: 'income',
    status: 'paid',
  });
  const result = summarize([schedule, realization], '2026-10');
  assert.equal(result.income, 500000);
  assert.equal(result.entries.length, 1);
  assert.equal(summarize([schedule, realization], '2026-11').income, 600000);
});
test('invoice payments and transfers affect balances without duplicating expenses', () => {
  const records = [
    record('a', 'accounts', { name: 'A', openingMonth: '2026-01', openingBalance: 100000 }),
    record('b', 'accounts', { name: 'B', openingMonth: '2026-01', openingBalance: 0 }),
    record('card', 'cards', { name: 'Card', limit: 50000 }),
    record('purchase', 'transactions', {
      month: '2026-10',
      description: 'Purchase',
      amount: 10000,
      nature: 'expense',
      status: 'paid',
      cardId: 'card',
      accountId: 'a',
    }),
    record('invoice', 'transactions', {
      month: '2026-10',
      description: 'Invoice',
      amount: 10000,
      nature: 'invoice_payment',
      status: 'paid',
      cardId: 'card',
      accountId: 'a',
    }),
    record('transfer', 'transactions', {
      month: '2026-10',
      description: 'Transfer',
      amount: 20000,
      nature: 'transfer',
      status: 'paid',
      accountId: 'a',
      destinationAccountId: 'b',
    }),
  ];
  const summary = summarize(records, '2026-10');
  assert.equal(summary.expenses, 10000);
  assert.equal(summary.balances.find((account) => account.id === 'a')?.balance, 70000);
  assert.equal(summary.balances.find((account) => account.id === 'b')?.balance, 20000);
  assert.equal(summary.cards[0].remaining, 0);
});
test('negative contributions and settlements preserve third-party accounting', () => {
  const records = [
    record('me', 'people', { name: 'Eu', isSelf: true }),
    record('other', 'people', { name: 'Other', isSelf: false }),
    record('expense', 'transactions', {
      month: '2026-10',
      description: 'Purchase',
      amount: 3000,
      nature: 'expense',
      status: 'planned',
      personId: 'other',
    }),
    record('credit', 'transactions', {
      month: '2026-10',
      description: 'Contribution',
      amount: -1000,
      nature: 'expense',
      status: 'planned',
      personId: 'other',
    }),
    record('settlement', 'settlements', {
      month: '2026-10',
      amount: 500,
      personId: 'other',
      status: 'paid',
    }),
  ];
  const summary = summarize(records, '2026-10');
  assert.equal(summary.expenses, 2000);
  assert.equal(summary.reimbursements, 2000);
  assert.equal(summary.thirdParty[0].remaining, 1500);
});
test('benefits carry forward without entering salary and card expenses', () => {
  const summary = summarize(
    [
      record('credit', 'benefits', { month: '2026-09', nature: 'income', amount: 10000 }),
      record('debit', 'benefits', { month: '2026-10', nature: 'expense', amount: 2500 }),
    ],
    '2026-10',
  );
  assert.equal(summary.benefits.balance, 7500);
  assert.equal(summary.benefits.previousBalance, 10000);
  assert.equal(summary.benefits.monthBalance, -2500);
  assert.equal(summary.benefits.spent, 2500);
  assert.equal(summary.income, 0);
  assert.equal(summary.expenses, 0);
});
test('validation rejects non-integer money and transfers to the same account', () => {
  assert.throws(() =>
    parseRecordData('accounts', { name: 'A', openingBalance: 1.3, openingMonth: '2026-10' }),
  );
  assert.throws(() =>
    parseRecordData('transactions', {
      description: 'Transfer',
      month: '2026-10',
      date: '2026-10-22',
      amount: 100,
      nature: 'transfer',
      accountId: '00000000-0000-4000-8000-000000000001',
      destinationAccountId: '00000000-0000-4000-8000-000000000001',
    }),
  );
});

test('cash balances follow payment dates instead of invoice competence', () => {
  const records = [
    record('account', 'accounts', {
      name: 'Account',
      openingBalance: 10000,
      openingMonth: '2026-10',
    }),
    record('future', 'accounts', {
      name: 'Future',
      openingBalance: 90000,
      openingMonth: '2027-01',
    }),
    record('payment', 'transactions', {
      accountId: 'account',
      month: '2026-10',
      date: '2026-11-02',
      amount: 2500,
      nature: 'invoice_payment',
      status: 'paid',
    }),
  ];
  assert.equal(summarize(records, '2026-10').balances[0].balance, 10000);
  assert.equal(summarize(records, '2026-11').balances[0].balance, 7500);
  assert.equal(summarize(records, '2026-10').balances.length, 1);
});
