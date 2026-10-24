import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import type { FinanceData, FinanceRecord } from '../finance/finance.schema';
import { parseRecordData } from '../finance/finance.schema';
import type { EntryProposal } from './integration.schema';
import { buildTelegramEntry, TelegramDraft, TelegramSplitEntry } from './telegram-entry';
import { responsiblePersonId } from './telegram-people';

const invalidDivision =
  'Confira os participantes e percentuais da divisão. Informe todos sem ambiguidade e reenvie a mensagem completa.';
const insufficientAmount =
  'O valor é pequeno demais para dividir entre esses participantes e parcelas. Ajuste a divisão ou a quantidade de parcelas.';

export function allocateCents(total: number, weights: number[]) {
  const denominator = weights.reduce((sum, weight) => sum + weight, 0);
  const parts = weights.map((weight, index) => ({
    index,
    value: Number((BigInt(total) * BigInt(weight)) / BigInt(denominator)),
    remainder: (BigInt(total) * BigInt(weight)) % BigInt(denominator),
  }));
  const remaining = total - parts.reduce((sum, part) => sum + part.value, 0);
  const sorted = [...parts].sort((a, b) =>
    a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1,
  );
  for (let index = 0; index < remaining; index++) {
    sorted[index].value++;
  }
  return parts.map((part) => part.value);
}

function participantWeights(proposal: EntryProposal) {
  const participants = proposal.participants;
  const unspecified = participants.filter((participant) => participant.percentage === null).length;
  const specified = participants.reduce(
    (sum, participant) => sum + Math.round((participant.percentage ?? 0) * 100),
    0,
  );
  let weights: number[];
  if ((unspecified === 0 && specified === 10000) || (unspecified > 0 && specified < 10000)) {
    weights = participants.map((participant) =>
      participant.percentage === null
        ? 10000 - specified
        : Math.round(participant.percentage * 100) * (unspecified || 1),
    );
  } else {
    throw new BadRequestException(invalidDivision);
  }
  return weights;
}

function regularInstallments(total: number, totals: number[], count: number, weights: number[]) {
  const amount = Math.floor(total / count);
  const capacities = totals.map((value) => Math.floor((value - 1) / (count - 1)));
  let regular: number[];
  if (
    amount >= totals.length &&
    capacities.every((value) => value >= 1) &&
    capacities.reduce((sum, value) => sum + value, 0) >= amount
  ) {
    regular = allocateCents(amount, weights).map((value, index) =>
      Math.max(1, Math.min(value, capacities[index])),
    );
    let difference = amount - regular.reduce((sum, value) => sum + value, 0);
    for (let index = 0; index < regular.length && difference !== 0; index++) {
      const adjustment =
        difference > 0
          ? Math.min(difference, capacities[index] - regular[index])
          : -Math.min(-difference, regular[index] - 1);
      regular[index] += adjustment;
      difference -= adjustment;
    }
    if (difference !== 0) {
      throw new BadRequestException(insufficientAmount);
    }
  } else {
    throw new BadRequestException(insufficientAmount);
  }
  return regular;
}

export function buildTelegramProposal(
  proposal: EntryProposal,
  references: FinanceRecord[],
  text: string,
) {
  const base = buildTelegramEntry(
    {
      ...proposal,
      personId: proposal.participants.length ? null : proposal.personId,
      personMentioned: proposal.participants.length ? false : proposal.personMentioned,
    },
    references,
    text,
  );
  let entries: TelegramSplitEntry[] | null = null;
  if (proposal.participants.length) {
    if (
      proposal.participants.length < 2 ||
      proposal.personId ||
      proposal.nature !== 'expense' ||
      proposal.recurrence !== 'none'
    ) {
      throw new BadRequestException(invalidDivision);
    }
    const participants = proposal.participants.map((participant) => {
      let personId: string | undefined;
      if (participant.isSelf && !participant.personId) {
        if (
          !/(?:^|[^\p{L}\p{N}])(?:eu|mim|meu|minha|comigo|i|me|my|myself)(?:$|[^\p{L}\p{N}])/iu.test(
            text,
          )
        ) {
          throw new BadRequestException(invalidDivision);
        }
        personId = references.find((record) => record.kind === 'people' && record.data.isSelf)?.id;
      } else if (!participant.isSelf && participant.personId) {
        personId = responsiblePersonId(
          { ...proposal, personId: participant.personId, personMentioned: true },
          references,
          text,
        );
      } else {
        throw new BadRequestException(invalidDivision);
      }
      return personId;
    });
    if (new Set(participants.map((id) => id ?? 'self')).size !== participants.length) {
      throw new BadRequestException(invalidDivision);
    }
    const total =
      proposal.amountBasis === 'per_installment'
        ? proposal.amount * proposal.installments
        : proposal.amount;
    const weights = participantWeights(proposal);
    const weightTotal = weights.reduce((sum, value) => sum + value, 0);
    const totals = allocateCents(total, weights);
    if (totals.some((value) => value <= 0)) {
      throw new BadRequestException(insufficientAmount);
    }
    const regular =
      proposal.installments > 1
        ? regularInstallments(total, totals, proposal.installments, weights)
        : totals;
    entries = participants.map((personId, index) => {
      const { personId: basePerson, finalAmount: baseFinal, ...data } = base.data;
      const finalAmount = totals[index] - regular[index] * (proposal.installments - 1);
      return {
        data: parseRecordData(base.kind, {
          ...data,
          amount: regular[index],
          ...(personId ? { personId } : {}),
          ...(proposal.installments > 1 && finalAmount !== regular[index] ? { finalAmount } : {}),
        }),
        total: totals[index],
        weight: weights[index],
        weightTotal,
      };
    });
  }
  return { ...base, split_entries: entries };
}

const splitEntrySchema = z
  .object({
    data: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    total: z.number().int().positive().max(100_000_000_000),
    weight: z.number().int().positive().max(80000),
    weightTotal: z.number().int().positive().max(80000),
  })
  .strict();

export function validatedDraftEntries(
  draft: Pick<TelegramDraft, 'kind' | 'data' | 'split_entries'>,
): FinanceData[] {
  const base = parseRecordData(draft.kind, draft.data);
  let entries: FinanceData[];
  if (draft.split_entries) {
    const split = z.array(splitEntrySchema).min(2).max(8).parse(draft.split_entries);
    entries = split.map((entry) => parseRecordData(draft.kind, entry.data));
    const fields = [
      'description',
      'nature',
      'cardId',
      'accountId',
      'categoryId',
      'date',
      'month',
      'startMonth',
      'count',
      'status',
    ];
    const baseCount = Number(base.count ?? 1);
    const same = entries.every(
      (entry, index) =>
        entry.nature === 'expense' &&
        Number(entry.amount) > 0 &&
        Number(entry.finalAmount ?? entry.amount) > 0 &&
        fields.every((field) => entry[field] === base[field]) &&
        split[index].total ===
          Number(entry.amount) * (baseCount - 1) + Number(entry.finalAmount ?? entry.amount) &&
        split[index].weightTotal === split[0].weightTotal,
    );
    const sum = (field: string) =>
      entries.reduce((value, entry) => value + Number(entry[field] ?? entry.amount), 0);
    if (
      !['transactions', 'installments'].includes(draft.kind) ||
      !same ||
      sum('amount') !== Number(base.amount) ||
      sum('finalAmount') !== Number(base.finalAmount ?? base.amount) ||
      new Set(entries.map((entry) => entry.personId ?? 'self')).size !== entries.length ||
      split.reduce((sum, entry) => sum + entry.weight, 0) !== split[0].weightTotal
    ) {
      throw new BadRequestException(invalidDivision);
    }
  } else {
    entries = [base];
  }
  return entries;
}
