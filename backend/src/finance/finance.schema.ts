import { z } from 'zod';

export const resourceKinds = [
  'accounts',
  'cards',
  'categories',
  'people',
  'transactions',
  'recurring',
  'installments',
  'invoices',
  'income',
  'benefits',
  'settlements',
  'history',
  'goals',
  'goalContributions',
] as const;
export type ResourceKind = (typeof resourceKinds)[number];
export const kindSchema = z.enum(resourceKinds);
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use AAAA-MM.');
const dateSchema = z.iso.date();
const text = z.string().trim().min(1).max(250);
const reference = z.string().uuid().optional();
const money = z.number().int().min(-100_000_000_000).max(100_000_000_000);
const nature = z.enum([
  'expense',
  'income',
  'investment',
  'transfer',
  'invoice_payment',
  'settlement',
]);
const status = z.enum(['planned', 'posted', 'paid', 'cancelled']);
const links = {
  accountId: reference,
  cardId: reference,
  personId: reference,
  categoryId: reference,
};
const entry = {
  description: text,
  amount: money,
  nature: nature.default('expense'),
  ...links,
  note: z.string().max(2000).default(''),
  status: status.default('planned'),
};
const schedule = z
  .object({
    ...entry,
    startMonth: monthSchema,
    endMonth: monthSchema.optional(),
    active: z.boolean().default(true),
    day: z.number().int().min(1).max(31).default(1),
  })
  .strict()
  .refine((value) => !value.endMonth || value.endMonth >= value.startMonth, {
    message: 'O término deve ser posterior ao início.',
  });
const transaction = z
  .object({
    ...entry,
    month: monthSchema,
    date: dateSchema,
    destinationAccountId: reference,
    sourceId: reference,
  })
  .strict()
  .refine(
    (value) =>
      value.nature !== 'transfer' ||
      (Boolean(value.accountId && value.destinationAccountId) &&
        value.accountId !== value.destinationAccountId),
    { message: 'Selecione contas distintas para a transferência.' },
  )
  .refine(
    (value) => value.nature !== 'invoice_payment' || Boolean(value.accountId && value.cardId),
    { message: 'Informe a conta e o cartão do pagamento.' },
  )
  .refine((value) => !['transfer', 'invoice_payment'].includes(value.nature) || value.amount > 0, {
    message: 'Transferências e pagamentos de fatura devem ter valor positivo.',
  })
  .refine(
    (value) => !value.cardId || !['transfer', 'income', 'settlement'].includes(value.nature),
    { message: 'Esta natureza não aceita cartão de crédito.' },
  )
  .refine(
    (value) =>
      !['paid', 'posted'].includes(value.status) || Boolean(value.cardId || value.accountId),
    { message: 'Informe uma conta ou cartão para registrar a realização.' },
  );

export const resourceSchemas = {
  accounts: z
    .object({
      name: text,
      openingBalance: money.default(0),
      openingMonth: monthSchema,
      type: z.enum(['bank', 'cash']).default('bank'),
    })
    .strict(),
  cards: z
    .object({
      name: text,
      limit: money.nonnegative().optional(),
      closingDay: z.number().int().min(1).max(31).optional(),
      dueDay: z.number().int().min(1).max(31).optional(),
      accountId: reference,
    })
    .strict(),
  categories: z.object({ name: text }).strict(),
  people: z.object({ name: text, isSelf: z.boolean().default(false) }).strict(),
  transactions: transaction,
  recurring: schedule,
  income: schedule.refine((value) => value.nature === 'income', {
    message: 'Receitas recorrentes devem ter natureza de receita.',
  }),
  installments: z
    .object({
      ...entry,
      startMonth: monthSchema,
      count: z.number().int().min(2).max(600),
      finalAmount: money.positive().optional(),
      active: z.boolean().default(true),
    })
    .strict(),
  invoices: z
    .object({
      month: monthSchema,
      cardId: z.string().uuid(),
      reportedTotal: money.nonnegative().optional(),
      note: z.string().max(2000).default(''),
    })
    .strict(),
  benefits: z
    .object({
      description: text,
      month: monthSchema,
      date: dateSchema,
      nature: z.enum(['income', 'expense']),
      amount: money.nonnegative(),
      note: z.string().max(2000).default(''),
    })
    .strict(),
  goals: z
    .object({
      name: text,
      targetAmount: money.positive(),
      monthlyAmount: money.nonnegative().default(0),
      deadline: dateSchema.optional(),
      note: z.string().max(2000).default(''),
    })
    .strict(),
  goalContributions: z
    .object({
      goalId: z.string().uuid(),
      amount: money.positive(),
      date: dateSchema,
      note: z.string().max(2000).default(''),
    })
    .strict(),
  settlements: z
    .object({
      personId: z.string().uuid(),
      description: text,
      amount: money,
      month: monthSchema,
      date: dateSchema,
      status: status.default('planned'),
      accountId: reference,
      note: z.string().max(2000).default(''),
    })
    .strict()
    .refine((value) => !['paid', 'posted'].includes(value.status) || Boolean(value.accountId), {
      message: 'Informe a conta do acerto realizado.',
    }),
  history: z
    .object({
      ...entry,
      month: monthSchema,
      originalSheet: z.string().max(100),
      originalType: z.string().max(100),
      originalStatus: z.string().max(100),
    })
    .strict(),
};

export type FinanceData = Record<string, string | number | boolean | undefined>;
export interface FinanceRecord {
  id: string;
  kind: ResourceKind;
  data: FinanceData;
  version: number;
  created_at?: string;
  updated_at?: string;
}
export const parseRecordData = (kind: ResourceKind, input: unknown) =>
  resourceSchemas[kind].parse(input) as FinanceData;
