import { BadRequestException } from '@nestjs/common';
import { FinanceData, FinanceRecord, parseRecordData } from '../finance/finance.schema';
import { ExpenseProposal } from './integration.schema';
import { responsiblePersonId } from './telegram-people';

export interface TelegramDraft {
  id: string;
  kind: 'transactions' | 'installments';
  data: FinanceData;
}

export function buildTelegramExpense(
  proposal: ExpenseProposal,
  references: FinanceRecord[],
  text = '',
) {
  const paymentCount = Number(Boolean(proposal.accountId)) + Number(Boolean(proposal.cardId));
  const count = proposal.installments || 1;
  let result: { kind: TelegramDraft['kind']; data: FinanceData };
  if (paymentCount === 1 && (count === 1 || proposal.cardId)) {
    const personId = responsiblePersonId(proposal, references, text);
    const shared = {
      description: proposal.description,
      nature: 'expense',
      note: '',
      ...(proposal.accountId ? { accountId: proposal.accountId } : {}),
      ...(proposal.cardId ? { cardId: proposal.cardId } : {}),
      ...(proposal.categoryId ? { categoryId: proposal.categoryId } : {}),
      ...(personId ? { personId } : {}),
    };
    if (count > 1) {
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
