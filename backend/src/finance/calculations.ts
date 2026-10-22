import { FinanceData, FinanceRecord } from './finance.schema';

export function monthIndex(month: string) {
  const [year, value] = month.split('-').map(Number);
  return year * 12 + value - 1;
}

export function addMonths(month: string, count: number) {
  const index = monthIndex(month) + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

export function dateInMonth(month: string, day: number) {
  const [year, value] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, value, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export interface MonthlyEntry extends FinanceData {
  id: string;
  sourceId: string;
  sourceKind: string;
  amount: number;
  month: string;
  description: string;
  nature: string;
  status: string;
}

export function monthlyEntries(records: FinanceRecord[], month: string): MonthlyEntry[] {
  const entries: MonthlyEntry[] = [];
  const transactions = records.filter(
    (record) => record.kind === 'transactions' && record.data.month === month,
  );
  const overrides = new Set(transactions.map((record) => record.data.sourceId).filter(Boolean));
  const activeKinds = new Set(['recurring', 'income', 'installments']);
  for (const record of records) {
    const data = record.data;
    if (
      activeKinds.has(record.kind) &&
      data.active &&
      String(data.startMonth) <= month &&
      !overrides.has(record.id)
    ) {
      const current = monthIndex(month) - monthIndex(String(data.startMonth)) + 1;
      const inPeriod =
        (!data.endMonth || String(data.endMonth) >= month) &&
        (record.kind !== 'installments' || current <= Number(data.count));
      if (inPeriod) {
        entries.push({
          ...data,
          id: `${record.id}:${month}`,
          sourceId: record.id,
          sourceKind: record.kind,
          description: String(data.description),
          amount: Number(data.amount),
          nature: record.kind === 'income' ? 'income' : String(data.nature),
          month,
          date: dateInMonth(month, Number(data.day || 1)),
          status: 'planned',
          installment: record.kind === 'installments' ? `${current}/${data.count}` : '',
          endMonth:
            record.kind === 'installments'
              ? addMonths(String(data.startMonth), Number(data.count) - 1)
              : data.endMonth,
          remainingAmount:
            record.kind === 'installments'
              ? (Number(data.count) - current) * Number(data.amount)
              : undefined,
        });
      }
    } else if (record.kind === 'transactions' && data.month === month) {
      entries.push({
        ...data,
        id: record.id,
        sourceId: String(data.sourceId || record.id),
        sourceKind: record.kind,
        amount: Number(data.amount),
        description: String(data.description),
        nature: String(data.nature),
        month,
        status: String(data.status),
      });
    }
  }
  const history = records.filter(
    (record) => record.kind === 'history' && record.data.month === month,
  );
  if (entries.length === 0) {
    entries.push(
      ...history.map((record) => ({
        ...record.data,
        id: record.id,
        sourceId: record.id,
        sourceKind: 'history',
        description: String(record.data.description),
        amount: Number(record.data.amount),
        nature: String(record.data.nature),
        month,
        status: String(record.data.status),
      })),
    );
  }
  return entries.filter((entry) => entry.status !== 'cancelled');
}

export function summarize(records: FinanceRecord[], month: string) {
  const entries = monthlyEntries(records, month);
  const sumNature = (nature: string) =>
    entries
      .filter((entry) => entry.nature === nature)
      .reduce((total, entry) => total + entry.amount, 0);
  const income = sumNature('income');
  const expenses = sumNature('expense');
  const investments = sumNature('investment');
  const people = records.filter((record) => record.kind === 'people');
  const settlements = records.filter(
    (record) =>
      record.kind === 'settlements' &&
      record.data.month === month &&
      record.data.status !== 'cancelled',
  );
  const thirdParty = people
    .filter((person) => !person.data.isSelf)
    .map((person) => {
      const charged = entries
        .filter((entry) => entry.personId === person.id && entry.nature === 'expense')
        .reduce((sum, entry) => sum + entry.amount, 0);
      const settled = settlements
        .filter((record) => record.data.personId === person.id && record.data.status === 'paid')
        .reduce((sum, record) => sum + Number(record.data.amount), 0);
      return {
        id: person.id,
        name: String(person.data.name),
        charged,
        settled,
        remaining: charged - settled,
      };
    });
  const reimbursements = thirdParty.reduce((sum, person) => sum + person.charged, 0);
  const cards = records
    .filter((record) => record.kind === 'cards')
    .map((card) => {
      const predicted = entries
        .filter(
          (entry) => entry.cardId === card.id && ['expense', 'investment'].includes(entry.nature),
        )
        .reduce((sum, entry) => sum + entry.amount, 0);
      const invoice = records.find(
        (record) =>
          record.kind === 'invoices' &&
          record.data.cardId === card.id &&
          record.data.month === month,
      );
      const reported = invoice?.data.reportedTotal;
      const paid = entries
        .filter(
          (entry) =>
            entry.nature === 'invoice_payment' &&
            entry.cardId === card.id &&
            ['posted', 'paid'].includes(entry.status),
        )
        .reduce((sum, entry) => sum + entry.amount, 0);
      const total = reported === undefined ? predicted : Number(reported);
      return {
        id: card.id,
        name: String(card.data.name),
        predicted,
        reported,
        difference: reported === undefined ? null : Number(reported) - predicted,
        paid,
        remaining: total - paid,
        limit: card.data.limit,
        utilization: card.data.limit ? predicted / Number(card.data.limit) : null,
        closingDay: card.data.closingDay,
        dueDay: card.data.dueDay,
      };
    });
  const benefitEntries = records.filter(
    (record) => record.kind === 'benefits' && String(record.data.month) <= month,
  );
  const benefitTotal = (nature: string, currentOnly: boolean) =>
    benefitEntries
      .filter(
        (record) => record.data.nature === nature && (!currentOnly || record.data.month === month),
      )
      .reduce((sum, record) => sum + Number(record.data.amount), 0);
  const benefits = {
    credits: benefitTotal('income', true),
    spent: benefitTotal('expense', true),
    balance: benefitTotal('income', false) - benefitTotal('expense', false),
  };
  const categories = records
    .filter((record) => record.kind === 'categories')
    .map((category) => ({
      name: String(category.data.name),
      amount: entries
        .filter((entry) => entry.categoryId === category.id && entry.nature === 'expense')
        .reduce((sum, entry) => sum + entry.amount, 0),
    }))
    .filter((category) => category.amount !== 0)
    .sort((a, b) => b.amount - a.amount);
  const uncategorized = entries
    .filter((entry) => !entry.categoryId && entry.nature === 'expense')
    .reduce((sum, entry) => sum + entry.amount, 0);
  if (uncategorized) {
    categories.push({ name: 'Sem categoria', amount: uncategorized });
  }
  const balances = records
    .filter((record) => record.kind === 'accounts' && String(record.data.openingMonth) <= month)
    .map((account) => {
      let balance = Number(account.data.openingBalance);
      for (const record of records) {
        const data = record.data;
        const realized = ['paid', 'posted'].includes(String(data.status));
        const cashMonth = String(data.date || data.month).slice(0, 7);
        const inPeriod = cashMonth >= String(account.data.openingMonth) && cashMonth <= month;
        if (realized && inPeriod && ['transactions', 'settlements'].includes(record.kind)) {
          const amount = Number(data.amount);
          if (data.destinationAccountId === account.id && data.nature === 'transfer') {
            balance += amount;
          }
          if (data.accountId === account.id) {
            if (record.kind === 'settlements' || data.nature === 'income') {
              balance += amount;
            } else if (!data.cardId || data.nature === 'invoice_payment') {
              balance -= amount;
            }
          }
        }
      }
      return { id: account.id, name: String(account.data.name), balance };
    });
  return {
    month,
    income,
    expenses,
    investments,
    reimbursements,
    freeBalance: income + reimbursements - expenses - investments,
    entries,
    cards,
    benefits,
    thirdParty,
    categories,
    balances,
    pending: entries.filter((entry) => entry.status === 'planned'),
    realizedIncome: entries
      .filter((entry) => entry.nature === 'income' && ['posted', 'paid'].includes(entry.status))
      .reduce((sum, entry) => sum + entry.amount, 0),
  };
}
