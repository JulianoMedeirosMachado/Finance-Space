import type { ResourceKind } from '../types';
import { computed } from 'vue';
import { t } from '../i18n';
export interface Field {
  key: string;
  label: string;
  type?: 'text' | 'money' | 'number' | 'month' | 'date' | 'select' | 'checkbox' | 'textarea';
  required?: boolean;
  source?: ResourceKind;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  default?: string | number | boolean;
}
export interface ResourceDefinition {
  title: string;
  singular: string;
  description: string;
  fields: Field[];
  columns: string[];
  readOnly?: boolean;
}
const field = (
  key: string,
  label: string,
  type: Field['type'] = 'text',
  required = false,
): Field => ({ key, label, type, required });
const links: Field[] = [
  { ...field('personId', 'Responsável', 'select'), source: 'people' },
  { ...field('categoryId', 'Categoria', 'select'), source: 'categories' },
  { ...field('accountId', 'Conta bancária', 'select'), source: 'accounts' },
  { ...field('cardId', 'Cartão', 'select'), source: 'cards' },
];
const nature: Field = {
  ...field('nature', 'Natureza', 'select', true),
  default: 'expense',
  options: [
    { value: 'expense', label: 'Despesa' },
    { value: 'income', label: 'Receita' },
    { value: 'investment', label: 'Investimento' },
  ],
};
const status: Field = {
  ...field('status', 'Situação', 'select', true),
  default: 'planned',
  options: [
    { value: 'planned', label: 'Previsto' },
    { value: 'posted', label: 'Lançado' },
    { value: 'paid', label: 'Pago' },
    { value: 'cancelled', label: 'Cancelado' },
  ],
};
const note = field('note', 'Observação', 'textarea');
const entry: Field[] = [
  field('description', 'Descrição', 'text', true),
  field('amount', 'Valor (R$)', 'money', true),
  nature,
  ...links,
  note,
];
const schedule: Field[] = [
  field('startMonth', 'Primeira competência', 'month', true),
  field('endMonth', 'Última competência', 'month'),
  { ...field('day', 'Dia previsto', 'number', true), min: 1, max: 31, default: 1 },
  { ...field('active', 'Ativo', 'checkbox'), default: true },
];
const definitions: Record<ResourceKind, ResourceDefinition> = {
  accounts: {
    title: 'Contas bancárias',
    singular: 'conta',
    description: 'Seus saldos e movimentações em um só lugar.',
    fields: [
      field('name', 'Nome da conta', 'text', true),
      field('openingBalance', 'Saldo inicial (R$)', 'money', true),
      field('openingMonth', 'Competência do saldo inicial', 'month', true),
      {
        ...field('type', 'Tipo', 'select', true),
        default: 'bank',
        options: [
          { value: 'bank', label: 'Conta bancária' },
          { value: 'cash', label: 'Dinheiro' },
        ],
      },
    ],
    columns: ['name', 'openingBalance', 'openingMonth'],
  },
  cards: {
    title: 'Cartões',
    singular: 'cartão',
    description: 'Acompanhe seus limites, fechamentos e faturas.',
    fields: [
      field('name', 'Nome do cartão', 'text', true),
      { ...field('limit', 'Limite (R$)', 'money'), min: 0 },
      { ...field('closingDay', 'Dia de fechamento', 'number'), min: 1, max: 31 },
      { ...field('dueDay', 'Dia de vencimento', 'number'), min: 1, max: 31 },
      { ...field('accountId', 'Conta para pagamento', 'select'), source: 'accounts' },
    ],
    columns: ['name', 'limit', 'closingDay', 'dueDay', 'accountId'],
  },
  categories: {
    title: 'Categorias',
    singular: 'categoria',
    description: 'Organize seus gastos e receitas.',
    fields: [field('name', 'Nome', 'text', true)],
    columns: ['name'],
  },
  people: {
    title: 'Responsáveis',
    singular: 'responsável',
    description: 'Identifique seus gastos e os valores de outras pessoas.',
    fields: [
      field('name', 'Nome', 'text', true),
      field('isSelf', 'Esta pessoa sou eu', 'checkbox'),
    ],
    columns: ['name', 'isSelf'],
  },
  transactions: {
    title: 'Lançamentos',
    singular: 'lançamento',
    description: 'Registre compras, receitas extras, transferências e ajustes.',
    fields: [
      field('date', 'Data', 'date', true),
      field('month', 'Competência', 'month', true),
      ...entry.map((item) =>
        item.key === 'nature'
          ? {
              ...nature,
              options: [
                ...nature.options!,
                { value: 'transfer', label: 'Transferência' },
                { value: 'invoice_payment', label: 'Pagamento de fatura' },
              ],
            }
          : item,
      ),
      {
        ...field('destinationAccountId', 'Conta de destino (transferência)', 'select'),
        source: 'accounts',
      },
      status,
    ],
    columns: ['description', 'date', 'amount', 'nature', 'personId', 'cardId', 'status'],
  },
  recurring: {
    title: 'Recorrentes',
    singular: 'recorrência',
    description: 'Cadastre assinaturas e despesas fixas uma única vez.',
    fields: [...entry, ...schedule],
    columns: ['description', 'amount', 'personId', 'cardId', 'startMonth', 'endMonth', 'active'],
  },
  installments: {
    title: 'Parcelamentos',
    singular: 'parcelamento',
    description: 'Veja as parcelas do mês e os compromissos futuros.',
    fields: [
      ...entry,
      field('startMonth', 'Primeira competência', 'month', true),
      { ...field('count', 'Quantidade de parcelas', 'number', true), min: 2, max: 600 },
      { ...field('finalAmount', 'Última parcela (R$)', 'money'), min: 0.01 },
      { ...field('active', 'Ativo', 'checkbox'), default: true },
    ],
    columns: ['description', 'amount', 'count', 'startMonth', 'personId', 'cardId', 'active'],
  },
  invoices: {
    title: 'Faturas',
    singular: 'fatura',
    description:
      'Compare a previsão com o total informado pelo banco. Registre o pagamento em Lançamentos.',
    fields: [
      field('month', 'Competência', 'month', true),
      { ...field('cardId', 'Cartão', 'select', true), source: 'cards' },
      { ...field('reportedTotal', 'Total informado (R$)', 'money'), min: 0 },
      note,
    ],
    columns: ['month', 'cardId', 'reportedTotal', 'note'],
  },
  income: {
    title: 'Receitas',
    singular: 'receita recorrente',
    description: 'Salário e outras entradas periódicas para planejar seu mês.',
    fields: [
      field('description', 'Descrição', 'text', true),
      field('amount', 'Valor (R$)', 'money', true),
      {
        ...field('nature', 'Natureza', 'select', true),
        default: 'income',
        options: [{ value: 'income', label: 'Receita' }],
      },
      ...links.filter((item) => item.key !== 'cardId'),
      note,
      ...schedule,
    ],
    columns: ['description', 'amount', 'accountId', 'startMonth', 'endMonth', 'active'],
  },
  benefits: {
    title: 'Vale-alimentação',
    singular: 'movimentação',
    description: 'Créditos e consumo separados das contas e do salário.',
    fields: [
      field('description', 'Descrição', 'text', true),
      field('date', 'Data', 'date', true),
      field('month', 'Competência', 'month', true),
      {
        ...field('nature', 'Tipo', 'select', true),
        default: 'expense',
        options: [
          { value: 'income', label: 'Crédito' },
          { value: 'expense', label: 'Compra' },
        ],
      },
      { ...field('amount', 'Valor (R$)', 'money', true), min: 0 },
      note,
    ],
    columns: ['description', 'date', 'nature', 'amount', 'note'],
  },
  settlements: {
    title: 'Acertos',
    singular: 'acerto',
    description: 'Use valor positivo para recebimentos e negativo para pagamentos a terceiros.',
    fields: [
      field('description', 'Descrição', 'text', true),
      { ...field('personId', 'Pessoa', 'select', true), source: 'people' },
      field('amount', 'Valor (R$)', 'money', true),
      field('month', 'Competência', 'month', true),
      field('date', 'Data', 'date', true),
      { ...field('accountId', 'Conta', 'select'), source: 'accounts' },
      status,
      note,
    ],
    columns: ['description', 'personId', 'amount', 'date', 'status'],
  },
  history: {
    title: 'Histórico importado',
    singular: 'registro histórico',
    description:
      'Preservação dos registros originais. Meses com previsões ativas usam os cadastros atuais no painel.',
    fields: [
      ...entry,
      field('month', 'Competência', 'month'),
      field('originalSheet', 'Aba original'),
      field('originalType', 'Tipo original'),
      field('originalStatus', 'Situação original'),
      status,
    ],
    columns: ['month', 'description', 'amount', 'personId', 'cardId', 'originalStatus'],
    readOnly: true,
  },
  goals: {
    title: 'Metas',
    singular: 'meta',
    description: 'Defina um objetivo e acompanhe cada passo até chegar lá.',
    fields: [
      field('name', 'Nome da meta', 'text', true),
      { ...field('targetAmount', 'Valor do objetivo (R$)', 'money', true), min: 0.01 },
      { ...field('monthlyAmount', 'Aporte mensal planejado (R$)', 'money'), min: 0 },
      field('deadline', 'Data desejada', 'date'),
      note,
    ],
    columns: ['name', 'targetAmount', 'monthlyAmount', 'deadline'],
  },
  goalContributions: {
    title: 'Aportes nas metas',
    singular: 'aporte',
    description: 'Registre os valores que você já separou para sua meta.',
    fields: [
      { ...field('goalId', 'Meta', 'select', true), source: 'goals' },
      { ...field('amount', 'Valor do aporte (R$)', 'money', true), min: 0.01 },
      field('date', 'Data', 'date', true),
      note,
    ],
    columns: ['goalId', 'date', 'amount', 'note'],
  },
};

export const resources = computed(
  () =>
    Object.fromEntries(
      Object.entries(definitions).map(([kind, definition]) => [
        kind,
        {
          ...definition,
          title: t(definition.title),
          singular: t(definition.singular),
          description: t(definition.description),
          fields: definition.fields.map((field) => ({
            ...field,
            label: t(field.label),
            options: field.options?.map((option) => ({ ...option, label: t(option.label) })),
          })),
        },
      ]),
    ) as Record<ResourceKind, ResourceDefinition>,
);
