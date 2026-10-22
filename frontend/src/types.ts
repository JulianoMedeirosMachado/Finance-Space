export type ResourceKind =
  | 'accounts'
  | 'cards'
  | 'categories'
  | 'people'
  | 'transactions'
  | 'recurring'
  | 'installments'
  | 'invoices'
  | 'income'
  | 'benefits'
  | 'settlements'
  | 'history';
export type RecordData = Record<string, string | number | boolean | undefined>;
export interface FinanceRecord {
  id: string;
  kind: ResourceKind;
  data: RecordData;
  version: number;
}
export interface MonthlyEntry extends RecordData {
  id: string;
  sourceId: string;
  sourceKind: string;
  description: string;
  amount: number;
  nature: string;
  month: string;
  status: string;
}
export interface CardSummary {
  id: string;
  name: string;
  predicted: number;
  reported?: number;
  difference: number | null;
  paid: number;
  remaining: number;
  limit?: number;
  utilization: number | null;
  closingDay?: number;
  dueDay?: number;
}
export interface Dashboard {
  month: string;
  income: number;
  expenses: number;
  investments: number;
  reimbursements: number;
  freeBalance: number;
  entries: MonthlyEntry[];
  pending: MonthlyEntry[];
  realizedIncome: number;
  cards: CardSummary[];
  benefits: { credits: number; spent: number; balance: number };
  thirdParty: { id: string; name: string; charged: number; settled: number; remaining: number }[];
  categories: { name: string; amount: number }[];
  balances: { id: string; name: string; balance: number }[];
  trend: {
    month: string;
    income: number;
    expenses: number;
    investments: number;
    freeBalance: number;
  }[];
}
