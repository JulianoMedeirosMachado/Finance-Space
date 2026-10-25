import { addMonths, monthlyEntries, summarize } from '../finance/calculations';
import { FinanceRecord } from '../finance/finance.schema';
import { summarizeGoals } from '../finance/goals';
import { InsightKind, InsightPeriod, InsightReport } from './insights.schema';

export function localToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function closedPeriod(kind: InsightKind, today = localToday()): InsightPeriod {
  let period: InsightPeriod;
  if (kind === 'weekly') {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
    const monday = shiftDate(today, -((weekday + 6) % 7));
    period = { start: shiftDate(monday, -7), end: shiftDate(monday, -1) };
  } else {
    const month = addMonths(today.slice(0, 7), -1);
    period = { start: `${month}-01`, end: shiftDate(`${today.slice(0, 7)}-01`, -1) };
  }
  return period;
}

export function previousPeriod(kind: InsightKind, period: InsightPeriod) {
  return closedPeriod(kind, period.start);
}

export function buildInsightSummary(
  records: FinanceRecord[],
  kind: InsightKind,
  today = localToday(),
) {
  const period = closedPeriod(kind, today);
  const previous = previousPeriod(kind, period);
  const labels: Record<string, string> = {};
  const categories = records.filter((record) => record.kind === 'categories');
  const self = new Set(
    records
      .filter((record) => record.kind === 'people' && record.data.isSelf)
      .map((record) => record.id),
  );
  categories.forEach((record, index) => {
    labels[`category_${index + 1}`] = String(record.data.name);
  });
  const actual = records.filter(
    (record) =>
      record.kind === 'transactions' && ['paid', 'posted'].includes(String(record.data.status)),
  );
  const totals = (range: InsightPeriod) => {
    const entries = actual.filter(
      (record) =>
        typeof record.data.date === 'string' &&
        record.data.date >= range.start &&
        record.data.date <= range.end,
    );
    const sum = (nature: string) =>
      entries
        .filter((record) => record.data.nature === nature)
        .reduce((value, record) => value + Number(record.data.amount), 0);
    const expenses = entries.filter((record) => record.data.nature === 'expense');
    const grouped = categories
      .map((record, index) => ({
        category: `category_${index + 1}`,
        amount: expenses
          .filter((entry) => entry.data.categoryId === record.id)
          .reduce((value, entry) => value + Number(entry.data.amount), 0),
      }))
      .filter((group) => group.amount !== 0)
      .sort((a, b) => b.amount - a.amount);
    const benefit = records.filter(
      (record) =>
        record.kind === 'benefits' &&
        typeof record.data.date === 'string' &&
        record.data.date >= range.start &&
        record.data.date <= range.end,
    );
    return {
      income: sum('income'),
      expenses: sum('expense'),
      investments: sum('investment'),
      expenseCount: expenses.length,
      recordedEntryCount: entries.length,
      thirdPartyExpenseParticipation: expenses
        .filter((record) => record.data.personId && !self.has(String(record.data.personId)))
        .reduce((value, record) => value + Number(record.data.amount), 0),
      categories: grouped.slice(0, 12),
      otherCategorizedExpenses: grouped.slice(12).reduce((value, group) => value + group.amount, 0),
      uncategorizedExpenses: expenses
        .filter((record) => !record.data.categoryId)
        .reduce((value, record) => value + Number(record.data.amount), 0),
      mealAllowance: {
        adjustments: benefit
          .filter((record) => record.data.nature === 'adjustment')
          .reduce((value, record) => value + Number(record.data.amount), 0),
        credits: benefit
          .filter((record) => record.data.nature === 'income')
          .reduce((value, record) => value + Number(record.data.amount), 0),
        purchases: benefit
          .filter((record) => record.data.nature === 'expense')
          .reduce((value, record) => value + Number(record.data.amount), 0),
      },
    };
  };
  const outlook = Array.from({ length: 3 }, (_, index) => {
    const month = addMonths(today.slice(0, 7), index);
    const entries = monthlyEntries(records, month);
    const planned = entries.filter(
      (entry) => entry.status === 'planned' && entry.sourceKind !== 'history',
    );
    return {
      month,
      plannedExpenses: planned
        .filter((entry) => entry.nature === 'expense')
        .reduce((value, entry) => value + entry.amount, 0),
      plannedIncome: planned
        .filter((entry) => entry.nature === 'income')
        .reduce((value, entry) => value + entry.amount, 0),
      scheduledInstallments: planned
        .filter((entry) => entry.sourceKind === 'installments')
        .reduce((value, entry) => value + entry.amount, 0),
      outstandingCardStatements: summarize(records, month).cards.reduce(
        (value, card) => value + card.remaining,
        0,
      ),
    };
  });
  let recordedCashBalance = 0;
  for (const account of records.filter(
    (record) => record.kind === 'accounts' && String(record.data.openingMonth) <= today.slice(0, 7),
  )) {
    recordedCashBalance += Number(account.data.openingBalance || 0);
    for (const record of records) {
      const data = record.data;
      if (
        ['transactions', 'settlements'].includes(record.kind) &&
        ['paid', 'posted'].includes(String(data.status)) &&
        typeof data.date === 'string' &&
        data.date <= today &&
        data.date.slice(0, 7) >= String(account.data.openingMonth)
      ) {
        const amount = Number(data.amount);
        if (data.destinationAccountId === account.id && data.nature === 'transfer') {
          recordedCashBalance += amount;
        }
        if (data.accountId === account.id) {
          if (record.kind === 'settlements' || data.nature === 'income') {
            recordedCashBalance += amount;
          } else if (!data.cardId || data.nature === 'invoice_payment') {
            recordedCashBalance -= amount;
          }
        }
      }
    }
  }
  const goals = summarizeGoals(
    records.filter(
      (record) => record.kind !== 'goalContributions' || String(record.data.date) <= today,
    ),
  )
    .slice(0, 10)
    .map((goal, index) => {
      const code = `goal_${index + 1}`;
      labels[code] = goal.name;
      return {
        goal: code,
        targetAmount: goal.targetAmount,
        savedAmount: goal.savedAmount,
        remainingAmount: goal.remainingAmount,
        progress: goal.progress,
      };
    });
  const currentTotals = totals(period);
  const previousTotals = totals(previous);
  const changes = (['income', 'expenses', 'investments'] as const).map((metric) => {
    const delta = currentTotals[metric] - previousTotals[metric];
    const comparable =
      currentTotals.recordedEntryCount > 0 && previousTotals.recordedEntryCount > 0;
    return {
      metric,
      delta,
      percentageChange:
        comparable && previousTotals[metric] > 0
          ? Math.round((delta / previousTotals[metric]) * 10000) / 100
          : null,
      comparisonHasObservations: comparable,
    };
  });
  return {
    labels,
    payload: {
      currency: 'BRL',
      monetaryUnit: 'integer cents',
      kind,
      period,
      previousPeriod: previous,
      recordedPurchasesByDate: currentTotals,
      previousRecordedPurchasesByDate: previousTotals,
      changes,
      currentPosition: {
        asOf: today,
        recordedCashBalance,
        goals,
        outlookByReportingMonth: outlook,
      },
      coverage: {
        earliestRecordedDate: actual.map((record) => String(record.data.date)).sort()[0] || null,
        historicalArchiveExcluded: records.some((record) => record.kind === 'history'),
        forecastsExcludedFromRecordedPurchases: true,
        incompleteRecordsPossible: true,
        balanceIsNotVerifiedBankAvailability: true,
      },
    },
  };
}

export function restoreInsightLabels(
  report: InsightReport,
  labels: Record<string, string>,
): InsightReport {
  const replace = (text: string) =>
    text.replace(
      /\[\[((?:category|goal)_\d+)\]\]/g,
      (match, code: string) => labels[code] || match,
    );
  return {
    title: replace(report.title),
    summary: replace(report.summary),
    findings: report.findings.map((finding) => ({
      title: replace(finding.title),
      detail: replace(finding.detail),
      suggestion: replace(finding.suggestion),
    })),
  };
}
