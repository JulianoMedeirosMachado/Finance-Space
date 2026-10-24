import type { FinanceData } from '../finance/finance.schema';
import type { TelegramDraft } from './telegram-entry';

export function telegramSplitPreview(
  draft: TelegramDraft,
  references: { id: string; data: FinanceData }[],
  english: boolean,
) {
  let preview = '';
  if (draft.split_entries) {
    const locale = english ? 'en-US' : 'pt-BR';
    const money = (amount: number) =>
      new Intl.NumberFormat(locale, { style: 'currency', currency: 'BRL' }).format(amount / 100);
    const percent = (weight: number, total: number) =>
      new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 4 }).format(
        weight / total,
      );
    const lines = draft.split_entries.map((entry) => {
      const savedName = entry.data.personId
        ? references.find((record) => record.id === entry.data.personId)?.data.name
        : undefined;
      const name = savedName ? String(savedName) : english ? 'You' : 'Você';
      const shortName = name.length > 120 ? `${name.slice(0, 117)}…` : name;
      const schedule =
        draft.kind === 'installments'
          ? `; ${Number(draft.data.count) - 1} × ${money(Number(entry.data.amount))} + ${english ? 'last' : 'última'} ${money(Number(entry.data.finalAmount ?? entry.data.amount))}`
          : '';
      return `• ${shortName}: ${percent(entry.weight, entry.weightTotal)} — ${money(entry.total)}${schedule}`;
    });
    preview = `\n\n${english ? 'Purchase split (rounded to cents)' : 'Divisão da compra (ajustada em centavos)'}\n${lines.join('\n')}\n${english ? 'One entry per participant; no extra full-price entry or reimbursement receipt.' : 'Um lançamento por participante, sem outra cobrança do total nem recebimento de reembolso.'}`;
  }
  return preview;
}
