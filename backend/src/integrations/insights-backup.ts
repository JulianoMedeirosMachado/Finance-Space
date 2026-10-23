import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { QueryExecutor } from '../database/database.service';
import { insightKindSchema } from './insights.schema';

export async function backupInsights(database: QueryExecutor) {
  return database.query(
    "SELECT id,user_id,kind,period_start::text,period_end::text,report,generated_at,started_at,language,model FROM ai_insights WHERE state='ready' ORDER BY id",
  );
}

export async function restoreInsights(database: QueryExecutor, reports: Record<string, unknown>[]) {
  for (const report of reports) {
    await database.query(
      `INSERT INTO ai_insights(id,user_id,kind,period_start,period_end,state,report,generation_token,started_at,generated_at,language,model)
      VALUES($1,$2,$3,$4,$5,'ready',$6,$7,$8,$9,$10,$11)`,
      [
        report.id,
        report.user_id,
        insightKindSchema.parse(report.kind),
        report.period_start,
        report.period_end,
        JSON.stringify(report.report),
        randomUUID(),
        report.started_at,
        report.generated_at,
        z.enum(['pt-BR', 'en-US']).parse(report.language),
        report.model,
      ],
    );
  }
}
