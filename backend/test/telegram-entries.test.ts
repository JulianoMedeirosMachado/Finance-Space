import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { entryProposalSchema } from '../src/integrations/integration.schema';
import { buildTelegramEntry } from '../src/integrations/telegram-entry';
import { monthlyEntries, summarize } from '../src/finance/calculations';
import { buildTelegramProposal, validatedDraftEntries } from '../src/integrations/telegram-split';
import type { FinanceRecord } from '../src/finance/finance.schema';

function proposal(overrides: Record<string, unknown> = {}) {
  return entryProposalSchema.parse({
    description: 'Streaming',
    amount: 3000,
    date: '2026-10-23',
    month: '2026-10',
    accountId: null,
    cardId: randomUUID(),
    categoryId: null,
    clarification: null,
    ...overrides,
  });
}

test('Telegram subscriptions create one monthly planned schedule, preserve responsibility and stop inclusively', () => {
  const person: FinanceRecord = {
    id: randomUUID(),
    kind: 'people',
    data: { name: 'Marta', isSelf: false },
    version: 1,
  };
  const draft = buildTelegramEntry(
    proposal({
      recurrence: 'monthly',
      day: 31,
      endMonth: '2027-02',
      personId: person.id,
      personMentioned: true,
    }),
    [person],
    'Marta streaming mensal',
  );
  assert.equal(draft.kind, 'recurring');
  assert.equal(draft.data.nature, 'expense');
  assert.equal(draft.data.personId, person.id);
  assert.equal(draft.data.status, 'planned');
  assert.equal(draft.data.amount, 3000);
  assert.equal(draft.data.date, undefined);
  assert.equal(draft.data.month, undefined);
  const records: FinanceRecord[] = [{ ...draft, id: randomUUID(), version: 1 }];
  assert.equal(monthlyEntries(records, '2026-09').length, 0);
  assert.equal(monthlyEntries(records, '2026-10').length, 1);
  assert.equal(monthlyEntries(records, '2027-02')[0].date, '2027-02-28');
  assert.equal(monthlyEntries(records, '2027-02')[0].amount, 3000);
  assert.equal(monthlyEntries(records, '2027-03').length, 0);
  const indefinite = buildTelegramEntry(proposal({ recurrence: 'monthly' }), []);
  assert.equal(indefinite.data.day, 23);
  assert.equal(indefinite.data.endMonth, undefined);
});

test('Telegram one-time income is received into an account while recurring income is only planned', () => {
  const input = proposal({ nature: 'income', accountId: randomUUID(), cardId: null, amount: 2000 });
  const received = buildTelegramEntry(input, []);
  assert.equal(received.kind, 'transactions');
  assert.equal(received.data.nature, 'income');
  assert.equal(received.data.status, 'paid');
  assert.equal(received.data.amount, 2000);
  assert.equal(received.data.accountId, input.accountId);
  const recurring = buildTelegramEntry({ ...input, recurrence: 'monthly', day: 5 }, []);
  assert.equal(recurring.kind, 'income');
  assert.equal(recurring.data.status, 'planned');
  assert.equal(recurring.data.day, 5);
  assert.equal(recurring.data.date, undefined);
  const records: FinanceRecord[] = [{ ...recurring, id: randomUUID(), version: 1 }];
  assert.equal(monthlyEntries(records, '2026-11')[0].nature, 'income');
  assert.equal(monthlyEntries(records, '2026-11')[0].status, 'planned');
});

test('Telegram entry validation rejects unsafe combinations and unsupported recurrence frequencies', () => {
  const input = proposal();
  for (const overrides of [
    { nature: 'income' },
    { nature: 'income', accountId: randomUUID() },
    { nature: 'income', accountId: randomUUID(), cardId: null, installments: 3 },
    { nature: 'income', accountId: randomUUID(), cardId: null, personMentioned: true },
    { nature: 'income', accountId: randomUUID(), cardId: null, personId: randomUUID() },
    { recurrence: 'monthly', installments: 3 },
    { recurrence: 'monthly', endMonth: '2026-09' },
    { day: 10 },
    { endMonth: '2026-12' },
    { accountId: randomUUID() },
  ]) {
    assert.throws(() => buildTelegramEntry(proposal({ ...input, ...overrides }), []));
  }
  assert.equal(entryProposalSchema.safeParse({ ...input, recurrence: 'yearly' }).success, false);
  assert.equal(entryProposalSchema.safeParse({ ...input, recurrence: 'weekly' }).success, false);
  assert.equal(entryProposalSchema.safeParse({ ...input, day: 32 }).success, false);
});

test('Telegram meal allowance purchases and credits use only the separate benefit ledger', () => {
  const records: FinanceRecord[] = [];
  for (const [nature, amount] of [
    ['income', 67200],
    ['expense', 2290],
  ] as const) {
    const draft = buildTelegramProposal(
      proposal({
        paymentType: 'meal_allowance',
        nature,
        amount,
        cardId: null,
      }),
      [],
      'Vale alimentação',
    );
    assert.equal(draft.kind, 'benefits');
    assert.equal(draft.split_entries, null);
    assert.deepEqual(validatedDraftEntries(draft), [
      {
        description: 'Streaming',
        nature,
        amount,
        date: '2026-10-23',
        month: '2026-10',
        note: '',
      },
    ]);
    records.push({ id: randomUUID(), version: 1, kind: draft.kind, data: draft.data });
  }
  const summary = summarize(records, '2026-10');
  assert.equal(summary.benefits.balance, 64910);
  assert.equal(summary.benefits.spent, 2290);
  assert.equal(summary.income, 0);
  assert.equal(summary.expenses, 0);
  assert.equal(monthlyEntries(records, '2026-10').length, 0);
  for (const overrides of [
    { cardId: randomUUID() },
    { accountId: randomUUID() },
    { categoryId: randomUUID() },
    { personId: randomUUID() },
    { personMentioned: true },
    { installments: 3 },
    { recurrence: 'monthly' },
    { day: 10 },
    { endMonth: '2027-01' },
    {
      participants: [
        { personId: null, isSelf: true, percentage: null },
        { personId: randomUUID(), isSelf: false, percentage: null },
      ],
    },
  ]) {
    assert.throws(() =>
      buildTelegramProposal(
        proposal({
          paymentType: 'meal_allowance',
          cardId: null,
          ...overrides,
        }),
        [],
        'Vale alimentação eu e Marta',
      ),
    );
  }
  assert.equal(proposal().paymentType, 'regular');
});
