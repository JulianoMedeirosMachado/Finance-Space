import { BadRequestException } from '@nestjs/common';
import { FinanceData, FinanceRecord, parseRecordData } from '../finance/finance.schema';
import { EntryProposal } from './integration.schema';
import { responsiblePersonId } from './telegram-people';

export interface TelegramDraft {
  id: string;
  kind: 'transactions' | 'installments' | 'recurring' | 'income';
  data: FinanceData;
}

export function buildTelegramEntry(
  proposal: EntryProposal,
  references: FinanceRecord[],
  text = '',
) {
  const paymentCount = Number(Boolean(proposal.accountId)) + Number(Boolean(proposal.cardId));
  const count = proposal.installments || 1;
  let result: { kind: TelegramDraft['kind']; data: FinanceData };
  if (
    proposal.nature === 'income' &&
    (proposal.cardId ||
      !proposal.accountId ||
      count > 1 ||
      proposal.personId ||
      proposal.personMentioned)
  ) {
    throw new BadRequestException(
      'Receitas precisam de uma conta de destino, sem cartão, parcelamento ou responsável externo.',
    );
  } else if (proposal.recurrence === 'monthly' && count > 1) {
    throw new BadRequestException(
      'Escolha recorrência mensal ou parcelamento, não ambos no mesmo lançamento.',
    );
  } else if (proposal.recurrence === 'none' && (proposal.endMonth || proposal.day)) {
    throw new BadRequestException('Dia recorrente e término só se aplicam a recorrências mensais.');
  } else if (paymentCount === 1 && (count === 1 || proposal.cardId)) {
    const personId = responsiblePersonId(proposal, references, text);
    const shared = {
      description: proposal.description,
      nature: proposal.nature,
      note: '',
      ...(proposal.accountId ? { accountId: proposal.accountId } : {}),
      ...(proposal.cardId ? { cardId: proposal.cardId } : {}),
      ...(proposal.categoryId ? { categoryId: proposal.categoryId } : {}),
      ...(personId ? { personId } : {}),
    };
    if (proposal.recurrence === 'monthly') {
      const kind = proposal.nature === 'income' ? 'income' : 'recurring';
      result = {
        kind,
        data: parseRecordData(kind, {
          ...shared,
          amount: proposal.amount,
          startMonth: proposal.month,
          day: proposal.day ?? Number(proposal.date.slice(-2)),
          ...(proposal.endMonth ? { endMonth: proposal.endMonth } : {}),
          active: true,
          status: 'planned',
        }),
      };
    } else if (count > 1) {
      const total =
        proposal.amountBasis === 'per_installment' ? proposal.amount * count : proposal.amount;
      const amount = Math.floor(total / count);
      if (amount > 0 && total <= 100_000_000_000) {
        const finalAmount = total - amount * (count - 1);
        result = {
          kind: 'installments',
          data: parseRecordData('installments', {
            ...shared,
            amount,
            count,
            startMonth: proposal.month,
            active: true,
            status: 'planned',
            ...(finalAmount !== amount ? { finalAmount } : {}),
          }),
        };
      } else {
        throw new BadRequestException('O total não pode ser dividido nesse número de parcelas.');
      }
    } else {
      result = {
        kind: 'transactions',
        data: parseRecordData('transactions', {
          ...shared,
          amount: proposal.amount,
          date: proposal.date,
          month: proposal.month,
          status: proposal.cardId ? 'posted' : 'paid',
        }),
      };
    }
  } else {
    throw new BadRequestException(
      'Informe uma conta ou cartão sem ambiguidade. Parcelamentos precisam de cartão.',
    );
  }
  return result;
}
