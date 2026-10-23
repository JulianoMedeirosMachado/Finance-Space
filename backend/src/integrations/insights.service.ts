import { ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService, QueryExecutor } from '../database/database.service';
import { FinanceService } from '../finance/finance.service';
import { IntegrationService } from './integration.service';
import { IntegrationRepository } from './integration.repository';
import { AiService } from './ai.service';
import { InsightKind, InsightRow } from './insights.schema';
import {
  buildInsightSummary,
  closedPeriod,
  localToday,
  restoreInsightLabels,
} from './insights-summary';

const reportColumns =
  'id,kind,period_start::text AS period_start,period_end::text AS period_end,state,report,generated_at,started_at,language,model';

@Injectable()
export class InsightsService {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(IntegrationRepository) private readonly repository: IntegrationRepository,
    @Inject(IntegrationService) private readonly integration: IntegrationService,
    @Inject(FinanceService) private readonly finance: FinanceService,
    @Inject(AiService) private readonly ai: AiService,
  ) {}

  async list(userId: string) {
    const settings = await this.repository.settings(userId);
    const reports = await this.database.forUser(userId, (database) =>
      database.query<InsightRow>(
        `SELECT ${reportColumns} FROM ai_insights WHERE user_id=$1 ORDER BY period_start DESC,kind LIMIT 52`,
        [userId],
      ),
    );
    return {
      enabled: Boolean(settings?.insights_enabled),
      ready: Boolean(settings?.encrypted_key && this.integration.vault.available()),
      periods: { weekly: closedPeriod('weekly'), monthly: closedPeriod('monthly') },
      reports,
    };
  }

  private async current(database: QueryExecutor, userId: string, kind: InsightKind, start: string) {
    return (
      await database.query<InsightRow>(
        `SELECT ${reportColumns} FROM ai_insights WHERE user_id=$1 AND kind=$2 AND period_start=$3`,
        [userId, kind, start],
      )
    )[0];
  }

  async generate(userId: string, kind: InsightKind, language: 'pt-BR' | 'en-US') {
    const today = localToday();
    const period = closedPeriod(kind, today);
    const token = randomUUID();
    const claim = await this.database.forUser(userId, async (database) => {
      await database.query('SELECT user_id FROM integration_settings WHERE user_id=$1 FOR UPDATE', [
        userId,
      ]);
      const settings = await this.repository.settings(userId, database);
      let result: { claimed: boolean; version: number; cached?: InsightRow };
      if (settings?.insights_enabled && settings.encrypted_key) {
        const rows = await database.query(
          `INSERT INTO ai_insights(id,user_id,kind,period_start,period_end,state,generation_token,language,model)
          VALUES($1,$2,$3,$4,$5,'generating',$6,$7,$8)
          ON CONFLICT(user_id,kind,period_start) DO UPDATE SET state='generating',generation_token=$6,started_at=NOW(),report=NULL,generated_at=NULL,language=$7,model=$8
          WHERE ai_insights.state='failed' OR (ai_insights.state='generating' AND ai_insights.started_at<NOW()-INTERVAL '2 minutes') RETURNING id`,
          [randomUUID(), userId, kind, period.start, period.end, token, language, settings.model],
        );
        result = {
          claimed: rows.length > 0,
          version: settings.insights_version,
          cached: rows.length
            ? undefined
            : await this.current(database, userId, kind, period.start),
        };
      } else {
        throw new ForbiddenException(
          'Os insights estão desabilitados. Ative a análise na Integração IA.',
        );
      }
      return result;
    });
    let result: InsightRow;
    if (claim.claimed) {
      try {
        const snapshot = buildInsightSummary(await this.finance.list(userId), kind, today);
        const credential = await this.integration.prepareAiCall(userId, claim.version);
        const raw = await this.ai.insights(
          credential,
          snapshot.payload,
          language === 'en-US' ? 'English' : 'Brazilian Portuguese',
        );
        const report = restoreInsightLabels(raw, snapshot.labels);
        result = await this.database.forUser(userId, async (database) => {
          await database.query(
            'SELECT user_id FROM integration_settings WHERE user_id=$1 FOR UPDATE',
            [userId],
          );
          const settings = await this.repository.settings(userId, database);
          let saved: InsightRow;
          if (settings?.insights_enabled && settings.insights_version === claim.version) {
            const rows = await database.query<InsightRow>(
              `UPDATE ai_insights SET state='ready',report=$1,generated_at=NOW()
              WHERE user_id=$2 AND kind=$3 AND period_start=$4 AND generation_token=$5 AND state='generating' RETURNING ${reportColumns}`,
              [JSON.stringify(report), userId, kind, period.start, token],
            );
            if (rows[0]) {
              saved = rows[0];
            } else {
              throw new ConflictException(
                'Outra análise deste período já está em andamento. Atualize a página.',
              );
            }
          } else {
            throw new ForbiddenException(
              'A autorização da IA mudou durante a geração. Nenhum relatório foi salvo.',
            );
          }
          return saved;
        });
      } catch (error) {
        await this.database.forUser(userId, (database) =>
          database.query(
            "UPDATE ai_insights SET state='failed',report=NULL WHERE user_id=$1 AND kind=$2 AND period_start=$3 AND generation_token=$4 AND state='generating'",
            [userId, kind, period.start, token],
          ),
        );
        throw error;
      }
    } else if (claim.cached?.state === 'ready') {
      result = claim.cached;
    } else {
      throw new ConflictException(
        'Outra análise deste período já está em andamento. Atualize a página.',
      );
    }
    return result;
  }
}
