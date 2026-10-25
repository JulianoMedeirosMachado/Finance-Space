import type { FinanceRecord } from './finance.schema';

export function summarizeBenefits(records: FinanceRecord[], month: string) {
  const entries = records.filter(
    (record) => record.kind === 'benefits' && String(record.data.month) <= month,
  );
  const total = (nature: string, currentOnly: boolean) =>
    entries
      .filter(
        (record) => record.data.nature === nature && (!currentOnly || record.data.month === month),
      )
      .reduce((sum, record) => sum + Number(record.data.amount), 0);
  const credits = total('income', true);
  const spent = total('expense', true);
  const adjustments = total('adjustment', true);
  const balance = total('income', false) - total('expense', false) + total('adjustment', false);
  const monthBalance = credits - spent + adjustments;
  return {
    credits,
    spent,
    adjustments,
    balance,
    monthBalance,
    previousBalance: balance - monthBalance,
  };
}
