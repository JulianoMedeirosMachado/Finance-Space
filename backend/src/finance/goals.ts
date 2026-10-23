import { FinanceRecord } from './finance.schema';

export function summarizeGoals(records: FinanceRecord[]) {
  return records
    .filter((record) => record.kind === 'goals')
    .map((goal) => {
      const contributions = records.filter(
        (record) => record.kind === 'goalContributions' && record.data.goalId === goal.id,
      );
      const savedAmount = contributions.reduce(
        (total, contribution) => total + Number(contribution.data.amount),
        0,
      );
      const targetAmount = Number(goal.data.targetAmount);
      const monthlyAmount = Number(goal.data.monthlyAmount || 0);
      const remainingAmount = Math.max(0, targetAmount - savedAmount);
      return {
        id: goal.id,
        name: String(goal.data.name),
        targetAmount,
        monthlyAmount,
        savedAmount,
        remainingAmount,
        progress: Math.min(100, (savedAmount / targetAmount) * 100),
        completed: remainingAmount === 0,
        estimatedContributions:
          monthlyAmount > 0 ? Math.ceil(remainingAmount / monthlyAmount) : null,
        deadline: goal.data.deadline,
        contributionCount: contributions.length,
      };
    });
}
