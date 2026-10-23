import { z } from 'zod';
import { insightReportSchema } from './insights.schema';

const findingInputSchema = insightReportSchema.shape.findings.element
  .strip()
  .extend({ suggestion: insightReportSchema.shape.findings.element.shape.suggestion.nullish() });
const reportInputSchema = insightReportSchema.strip().extend({
  findings: z.array(findingInputSchema).min(1).max(6),
});

export const insightOutputContract = JSON.stringify(z.toJSONSchema(insightReportSchema));

export function parseInsightResponse(content: string) {
  const trimmed = content
    .trim()
    .replace(/^\uFEFF/, '')
    .trim();
  const fenced = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(trimmed);
  const input = reportInputSchema.parse(JSON.parse(fenced ? fenced[1] : trimmed));
  return insightReportSchema.parse({
    ...input,
    findings: input.findings.map((finding) => ({
      ...finding,
      suggestion: finding.suggestion ?? '',
    })),
  });
}
