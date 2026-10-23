export type InsightKind = 'weekly' | 'monthly';
export interface InsightPeriod {
  start: string;
  end: string;
}
export interface InsightReport {
  title: string;
  summary: string;
  findings: { title: string; detail: string; suggestion: string }[];
}
export interface InsightRecord {
  id: string;
  kind: InsightKind;
  period_start: string;
  period_end: string;
  state: 'generating' | 'ready' | 'failed';
  report: InsightReport | null;
  started_at: string;
  generated_at: string | null;
  language: 'pt-BR' | 'en-US';
  model: string;
}
export interface InsightsOverview {
  enabled: boolean;
  ready: boolean;
  periods: Record<InsightKind, InsightPeriod>;
  reports: InsightRecord[];
}
