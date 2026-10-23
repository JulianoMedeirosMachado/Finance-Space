import { z } from 'zod';

export const insightKindSchema = z.enum(['weekly', 'monthly']);
export type InsightKind = z.infer<typeof insightKindSchema>;
export const insightGenerationSchema = z.object({ retry: z.boolean().default(false) }).strict();
export const insightReportSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    summary: z.string().trim().min(1).max(2000),
    findings: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(160),
            detail: z.string().trim().min(1).max(1200),
            suggestion: z.string().trim().max(700),
          })
          .strict(),
      )
      .min(1)
      .max(6),
  })
  .strict();
export type InsightReport = z.infer<typeof insightReportSchema>;
export interface InsightPeriod {
  start: string;
  end: string;
}
export interface InsightRow extends Record<string, unknown> {
  id: string;
  kind: InsightKind;
  period_start: string;
  period_end: string;
  state: 'generating' | 'ready' | 'failed';
  report: InsightReport | null;
  generated_at: string | null;
  language: 'pt-BR' | 'en-US';
  model: string;
}
