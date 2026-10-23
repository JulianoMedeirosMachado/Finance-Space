import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { FinanceRecord } from '../src/finance/finance.schema';
import { summarize } from '../src/finance/calculations';
import { expenseProposalSchema } from '../src/integrations/integration.schema';
import { buildTelegramExpense } from '../src/integrations/telegram-expense';
import { mentionedPeople, responsiblePersonId } from '../src/integrations/telegram-people';

function person(name: string, isSelf = false): FinanceRecord {
  return { id: randomUUID(), kind: 'people', data: { name, isSelf }, version: 1 };
}

function proposal(personId: string | null = null, personMentioned = false) {
  return expenseProposalSchema.parse({
    description: 'Shoes',
    amount: 30000,
    date: '2026-10-23',
    month: '2026-10',
    cardId: randomUUID(),
    accountId: null,
    categoryId: null,
    clarification: null,
    personId,
    personMentioned,
  });
}

test('responsible-person matching shares only mentioned references and rejects ambiguous or foreign IDs', () => {
  const self = person('Private owner', true);
  const marta = person('Márta Silva');
  const ana = person('Ana Maria');
  const otherAna = person('Ana Clara');
  const unrelated = person('Private unrelated');
  const records = [self, marta, ana, otherAna, unrelated];
  assert.deepEqual(mentionedPeople(records, 'MARTA, shoes 300'), [
    { id: marta.id, kind: 'people', name: 'marta' },
  ]);
  assert.deepEqual(mentionedPeople(records, 'banana 3 reais'), []);
  assert.equal(responsiblePersonId(proposal(), records, 'Shoes 300'), self.id);
  assert.equal(responsiblePersonId(proposal(marta.id, true), records, 'Marta shoes'), marta.id);
  assert.equal(responsiblePersonId(proposal(ana.id, true), records, 'Ana Maria shoes'), ana.id);
  assert.throws(() => responsiblePersonId(proposal(ana.id, true), records, 'Ana shoes'));
  assert.throws(() => responsiblePersonId(proposal(null, true), records, 'Unknown shoes'));
  assert.throws(() => responsiblePersonId(proposal(randomUUID(), true), records, 'Marta shoes'));
  assert.throws(() => responsiblePersonId(proposal(unrelated.id, true), records, 'Marta shoes'));
});

test('third-party expenses and installments accrue monthly charges without recording reimbursement', () => {
  const marta = person('Marta');
  const input = proposal(marta.id, true);
  const ordinary = buildTelegramExpense(input, [marta], 'Marta shoes');
  const installment = buildTelegramExpense(
    { ...input, installments: 3 },
    [marta],
    'Marta shoes in 3 installments',
  );
  const records: FinanceRecord[] = [
    marta,
    ...[ordinary, installment].map((value) => ({ ...value, id: randomUUID(), version: 1 })),
  ];
  assert.equal(ordinary.data.personId, marta.id);
  assert.equal(installment.data.personId, marta.id);
  const current = summarize(records, '2026-10').thirdParty[0];
  assert.equal(current.charged, 40000);
  assert.equal(current.settled, 0);
  assert.equal(current.remaining, 40000);
  assert.equal(summarize(records, '2026-11').thirdParty[0].charged, 10000);
  assert.equal(summarize(records, '2027-01').thirdParty[0].charged, 0);
});
