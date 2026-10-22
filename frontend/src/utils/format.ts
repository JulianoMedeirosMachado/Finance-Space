export const money = (value: unknown) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(value || 0) / 100,
  );
export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T12:00:00Z`),
  );
export const dateLabel = (date: unknown) =>
  date ? String(date).slice(0, 10).split('-').reverse().join('/') : '—';
export const natureLabels: Record<string, string> = {
  expense: 'Despesa',
  income: 'Receita',
  investment: 'Investimento',
  transfer: 'Transferência',
  invoice_payment: 'Pagamento de fatura',
  settlement: 'Acerto',
};
export const statusLabels: Record<string, string> = {
  planned: 'Previsto',
  posted: 'Lançado',
  paid: 'Pago',
  cancelled: 'Cancelado',
};
