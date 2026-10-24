import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildTelegramProposal, validatedDraftEntries } from '../src/integrations/telegram-split';
import { entryProposalSchema } from '../src/integrations/integration.schema';
import { monthlyEntries, summarize, addMonths } from '../src/finance/calculations';
import type { FinanceRecord } from '../src/finance/finance.schema';
import { telegramSplitPreview } from '../src/integrations/telegram-split-preview';

const self: FinanceRecord = {
  id: randomUUID(),
  kind: 'people',
  data: { name: 'PRIVATE_OWNER', isSelf: true },
  version: 1,
};
const marta: FinanceRecord = {
  id: randomUUID(),
  kind: 'people',
  data: { name: 'Marta Silva', isSelf: false },
  version: 1,
};
const cacau: FinanceRecord = {
  id: randomUUID(),
  kind: 'people',
  data: { name: 'Cacau', isSelf: false },
  version: 1,
};
const references = [self, marta, cacau];
const text = 'Gas, eu, Marta e Cacau no cartao em 3x';
function proposal(percentages: (number | null)[] = [null, null, null], amount = 15000, count = 3) {
  return entryProposalSchema.parse({
    description: 'Gas',
    amount,
    date: '2026-10-24',
    month: '2026-10',
    cardId: randomUUID(),
    accountId: null,
    categoryId: null,
    personId: null,
    personMentioned: false,
    clarification: null,
    installments: count,
    participants: [
      { personId: null, isSelf: true, percentage: percentages[0] },
      { personId: marta.id, isSelf: false, percentage: percentages[1] },
      { personId: cacau.id, isSelf: false, percentage: percentages[2] },
    ],
  });
}

test('shared installments preserve purchase total, each participant total and every invoice month in integer cents', () => {
  for (const total of [15000, 15001, 1000000, 100000000000]) {
    for (const count of [1, 2, 3, 12, ...(total >= 1000000 ? [600] : [])]) {
      const input = proposal([null, null, null], total, count);
      const draft = buildTelegramProposal(input, references, text);
      const entries = validatedDraftEntries(draft);
      assert.equal(entries.length, 3);
      assert.equal(
        draft.split_entries!.reduce((sum, part) => sum + part.total, 0),
        total,
      );
      const records: FinanceRecord[] = entries.map((data) => ({
        id: randomUUID(),
        kind: draft.kind,
        data,
        version: 1,
      }));
      let sum = 0;
      for (let index = 0; index < count; index++) {
        const month = addMonths(input.month, index);
        const current = monthlyEntries(records, month);
        const expected =
          index === count - 1
            ? total - Math.floor(total / count) * (count - 1)
            : Math.floor(total / count);
        assert.equal(
          current.reduce((value, entry) => value + entry.amount, 0),
          expected,
        );
        sum += expected;
      }
      assert.equal(sum, total);
      for (const [index, record] of records.entries()) {
        const participantTotal = Array.from(
          { length: count },
          (_, offset) => monthlyEntries([record], addMonths(input.month, offset))[0].amount,
        ).reduce((sum, value) => sum + value, 0);
        assert.equal(participantTotal, draft.split_entries![index].total);
      }
    }
  }
});

test('explicit and partial percentages preserve native third-party accounting and never invent reimbursement receipts', () => {
  const fixed = buildTelegramProposal(proposal([50, 30, 20]), references, text);
  assert.deepEqual(
    fixed.split_entries!.map((part) => part.total),
    [7500, 4500, 3000],
  );
  const records: FinanceRecord[] = [
    ...references,
    ...validatedDraftEntries(fixed).map((data) => ({
      id: randomUUID(),
      kind: fixed.kind,
      data,
      version: 1,
    })),
  ];
  const summary = summarize(records, '2026-10');
  assert.equal(summary.expenses, 5000);
  assert.equal(summary.cards.length, 0);
  assert.equal(summary.thirdParty.find((person) => person.id === marta.id)!.charged, 1500);
  assert.equal(summary.thirdParty.find((person) => person.id === cacau.id)!.charged, 1000);
  assert.equal(summary.freeBalance, -2500);
  assert.ok(summary.thirdParty.every((person) => person.settled === 0));
  const partial = buildTelegramProposal(proposal([null, 50, null]), references, text);
  assert.deepEqual(
    partial.split_entries!.map((part) => part.total),
    [3750, 7500, 3750],
  );
  const decimals = buildTelegramProposal(proposal([33.33, 33.33, 33.34], 15001), references, text);
  assert.equal(
    decimals.split_entries!.reduce((sum, entry) => sum + entry.total, 0),
    15001,
  );
  const perInstallment = buildTelegramProposal(
    { ...proposal([50, null, null], 5000), amountBasis: 'per_installment' },
    references,
    text,
  );
  assert.deepEqual(
    perInstallment.split_entries!.map((part) => part.total),
    [7500, 3750, 3750],
  );
  const immediate = buildTelegramProposal(proposal([null, null, null], 15001, 1), references, text);
  assert.equal(immediate.kind, 'transactions');
  const cash = buildTelegramProposal(
    { ...proposal([null, null, null], 15001, 1), cardId: null, accountId: randomUUID() },
    references,
    text,
  );
  assert.ok(
    cash.split_entries!.every((entry) => entry.data.status === 'paid' && !entry.data.cardId),
  );
  assert.equal(
    immediate.split_entries!.reduce((sum, part) => sum + Number(part.data.amount), 0),
    15001,
  );
  const noSelf = { ...proposal(), participants: proposal().participants.slice(1) };
  const external = buildTelegramProposal(noSelf, references, 'Marta e Cacau gas');
  assert.deepEqual(
    external.split_entries!.map((part) => part.data.personId),
    [marta.id, cacau.id],
  );
  assert.deepEqual(
    external.split_entries!.map((part) => part.total),
    [7500, 7500],
  );
  const preview = telegramSplitPreview({ id: randomUUID(), ...partial }, references, false);
  assert.match(preview, /Marta Silva: 50%/);
  assert.match(preview, /Cacau: 25%/);
  assert.match(preview, /PRIVATE_OWNER: 25%/);
  assert.match(preview, /sem outra cobrança do total/);
});

test('split validation rejects unknown, ambiguous or duplicated people, inconsistent percentages and mutated draft totals', () => {
  const base = proposal();
  for (const input of [
    proposal([50, 30, 30]),
    proposal([50, 20, 20]),
    proposal([50, 50, null]),
    { ...base, participants: base.participants.slice(0, 1) },
    { ...base, participants: [base.participants[0], base.participants[0]] },
    { ...base, participants: [base.participants[1], base.participants[1]] },
    { ...base, personId: marta.id },
    { ...base, nature: 'income' as const, cardId: null, accountId: randomUUID() },
    { ...base, recurrence: 'monthly' as const, installments: 1 },
    {
      ...base,
      participants: [base.participants[0], { ...base.participants[1], personId: randomUUID() }],
    },
    { ...base, participants: [base.participants[0], { ...base.participants[1], isSelf: true }] },
  ]) {
    assert.throws(() => buildTelegramProposal(input, references, text));
  }
  assert.throws(() => buildTelegramProposal(base, references, 'Marta gas'));
  assert.throws(() => buildTelegramProposal(proposal([null, null, null], 3, 3), references, text));
  const secondMarta: FinanceRecord = {
    id: randomUUID(),
    kind: 'people',
    data: { name: 'Marta Clara', isSelf: false },
    version: 1,
  };
  assert.throws(() => buildTelegramProposal(base, [...references, secondMarta], text));
  assert.equal(
    entryProposalSchema.safeParse({
      ...base,
      participants: [{ personId: null, isSelf: true, percentage: 0 }],
    }).success,
    false,
  );
  assert.equal(
    entryProposalSchema.safeParse({
      ...base,
      participants: [{ personId: null, isSelf: true, percentage: 33.333 }],
    }).success,
    false,
  );
  const built = buildTelegramProposal(base, references, text);
  const altered = structuredClone(built);
  altered.split_entries![0].data.amount = 99999;
  assert.throws(() => validatedDraftEntries(altered));
  assert.equal(validatedDraftEntries({ ...built, split_entries: null }).length, 1);
});
