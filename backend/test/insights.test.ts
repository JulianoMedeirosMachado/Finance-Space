import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ServiceUnavailableException } from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service';
import { DatabaseService } from '../src/database/database.service';
import { FinanceService } from '../src/finance/finance.service';
import type { FinanceData, FinanceRecord, ResourceKind } from '../src/finance/finance.schema';
import { AiService, AiCredential } from '../src/integrations/ai.service';
import { IntegrationRepository } from '../src/integrations/integration.repository';
import { IntegrationService } from '../src/integrations/integration.service';
import { InsightsService } from '../src/integrations/insights.service';
import { InsightReport } from '../src/integrations/insights.schema';
import {
  buildInsightSummary,
  closedPeriod,
  localToday,
  previousPeriod,
  restoreInsightLabels,
} from '../src/integrations/insights-summary';
import { backupInsights, restoreInsights } from '../src/integrations/insights-backup';
import { TelegramClient } from '../src/integrations/telegram.client';

test('closed insight periods use Sao Paulo calendar, Monday weeks, leap years and year boundaries', () => {
  assert.equal(localToday(new Date('2026-10-19T01:00:00Z')), '2026-10-18');
  assert.deepEqual(closedPeriod('weekly', '2026-10-23'), {
    start: '2026-10-12',
    end: '2026-10-18',
  });
  assert.deepEqual(closedPeriod('weekly', '2027-01-04'), {
    start: '2026-12-28',
    end: '2027-01-03',
  });
  assert.deepEqual(closedPeriod('monthly', '2028-03-01'), {
    start: '2028-02-01',
    end: '2028-02-29',
  });
  assert.deepEqual(previousPeriod('monthly', closedPeriod('monthly', '2027-01-01')), {
    start: '2026-11-01',
    end: '2026-11-30',
  });
});

const record = (id: string, kind: ResourceKind, data: FinanceData): FinanceRecord => ({
  id,
  kind,
  data,
  version: 1,
});
test('insight summary contains only aggregates and pseudonyms, separates forecasts, transfers, benefits and recorded cash', () => {
  const records: FinanceRecord[] = [
    record('bank-private', 'accounts', {
      name: 'PRIVATE_BANK',
      openingBalance: 100000,
      openingMonth: '2026-01',
    }),
    record('cash-private', 'accounts', {
      name: 'PRIVATE_CASH',
      openingBalance: 0,
      openingMonth: '2026-01',
    }),
    record('category-private', 'categories', { name: 'PRIVATE_CATEGORY' }),
    record('other-private', 'people', { name: 'PRIVATE_PERSON', isSelf: false }),
    record('card-private', 'cards', { name: 'PRIVATE_CARD' }),
    record('spend-private', 'transactions', {
      description: 'PRIVATE_DESCRIPTION',
      note: 'PRIVATE_NOTE',
      date: '2026-10-13',
      month: '2026-10',
      nature: 'expense',
      amount: 10000,
      cardId: 'card-private',
      categoryId: 'category-private',
      personId: 'other-private',
      status: 'posted',
    }),
    record('salary-private', 'transactions', {
      description: 'PRIVATE_SALARY',
      date: '2026-10-14',
      month: '2026-10',
      nature: 'income',
      amount: 50000,
      accountId: 'bank-private',
      status: 'paid',
    }),
    record('move-private', 'transactions', {
      date: '2026-10-15',
      month: '2026-10',
      nature: 'transfer',
      amount: 20000,
      accountId: 'bank-private',
      destinationAccountId: 'cash-private',
      status: 'paid',
    }),
    record('invoice-private', 'transactions', {
      date: '2026-10-16',
      month: '2026-10',
      nature: 'invoice_payment',
      amount: 10000,
      accountId: 'bank-private',
      cardId: 'card-private',
      status: 'paid',
    }),
    record('future-private', 'transactions', {
      date: '2026-10-25',
      month: '2026-10',
      nature: 'expense',
      amount: 999,
      accountId: 'bank-private',
      status: 'posted',
    }),
    record('planned-private', 'transactions', {
      date: '2026-10-17',
      month: '2026-10',
      nature: 'expense',
      amount: 999,
      accountId: 'bank-private',
      status: 'planned',
    }),
    record('cancelled-private', 'transactions', {
      date: '2026-10-17',
      month: '2026-10',
      nature: 'expense',
      amount: 999,
      accountId: 'bank-private',
      status: 'cancelled',
    }),
    record('benefit-private', 'benefits', {
      date: '2026-10-17',
      month: '2026-10',
      nature: 'expense',
      amount: 2000,
    }),
    record('benefit-correction-private', 'benefits', {
      date: '2026-10-17',
      month: '2026-10',
      nature: 'adjustment',
      amount: -1234,
    }),
    record('goal-private', 'goals', { name: 'PRIVATE_GOAL', targetAmount: 100000 }),
    record('contribution-private', 'goalContributions', {
      goalId: 'goal-private',
      date: '2026-10-10',
      amount: 10000,
    }),
    record('archive-private', 'history', {
      month: '2026-10',
      nature: 'expense',
      amount: 999999,
      description: 'PRIVATE_ARCHIVE',
    }),
  ];
  const snapshot = buildInsightSummary(records, 'weekly', '2026-10-23');
  const totals = snapshot.payload.recordedPurchasesByDate;
  assert.equal(totals.expenses, 10000);
  assert.equal(totals.income, 50000);
  assert.equal(totals.thirdPartyExpenseParticipation, 10000);
  assert.equal(totals.mealAllowance.purchases, 2000);
  assert.equal(totals.mealAllowance.adjustments, -1234);
  assert.equal(totals.mealAllowance.credits, 0);
  assert.equal(snapshot.payload.currentPosition.recordedCashBalance, 140000);
  assert.equal(snapshot.payload.currentPosition.goals[0].savedAmount, 10000);
  assert.equal(snapshot.payload.coverage.historicalArchiveExcluded, true);
  assert.equal(
    snapshot.payload.changes.find((change) => change.metric === 'expenses')!.percentageChange,
    null,
  );
  const compared = buildInsightSummary(
    [
      ...records,
      record('previous-private', 'transactions', {
        date: '2026-10-06',
        month: '2026-10',
        nature: 'expense',
        amount: 5000,
        status: 'posted',
        cardId: 'card-private',
      }),
    ],
    'weekly',
    '2026-10-23',
  );
  assert.equal(
    compared.payload.changes.find((change) => change.metric === 'expenses')!.percentageChange,
    100,
  );
  const sent = JSON.stringify(snapshot.payload);
  assert.doesNotMatch(sent, /PRIVATE_|-private|description|note|user_id|email|password/i);
  assert.equal(snapshot.labels.category_1, 'PRIVATE_CATEGORY');
  const rendered = restoreInsightLabels(
    {
      title: '[[category_1]]',
      summary: '[[goal_1]]',
      findings: [{ title: 'Budget', detail: 'Recorded totals only.', suggestion: '' }],
    },
    snapshot.labels,
  );
  assert.equal(rendered.title, 'PRIVATE_CATEGORY');
  assert.equal(rendered.summary, 'PRIVATE_GOAL');
});

class InsightAi extends AiService {
  calls: { credential: AiCredential; snapshot: unknown; language: string }[] = [];
  wait?: Promise<void>;
  fail = false;
  async insights(
    credential: AiCredential,
    snapshot: unknown,
    language: string,
  ): Promise<InsightReport> {
    this.calls.push({ credential, snapshot, language });
    if (this.wait) {
      await this.wait;
    }
    let result: InsightReport;
    if (!this.fail) {
      result = {
        title: 'Overview',
        summary: 'Review [[category_1]].',
        findings: [
          {
            title: 'Budget',
            detail: 'Based on recorded data only.',
            suggestion: 'Check [[goal_1]].',
          },
        ],
      };
    } else {
      throw new ServiceUnavailableException('Simulated provider failure');
    }
    return result;
  }
}

test(
  'insights require separate consent, cache periods, isolate owners, revoke in-flight work and preserve ready reports in backups/restarts',
  { timeout: 45000 },
  async () => {
    const names = ['DATA_DIRECTORY', 'DATABASE_URL', 'INTEGRATION_ENCRYPTION_KEY'] as const;
    const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    const directory = await mkdtemp(join(tmpdir(), 'finance-insights-'));
    process.env.DATA_DIRECTORY = directory;
    process.env.DATABASE_URL = '';
    process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    let database = new DatabaseService();
    const ai = new InsightAi();
    const repository = () => new IntegrationRepository(database);
    const integration = () =>
      new IntegrationService(repository(), ai, new FinanceService(database), new TelegramClient());
    const insights = () =>
      new InsightsService(database, repository(), integration(), new FinanceService(database), ai);
    async function waitForCalls(count: number) {
      for (let index = 0; index < 200 && ai.calls.length < count; index++) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(ai.calls.length, count);
    }
    try {
      await database.onModuleInit();
      const auth = new AuthService(database);
      const alice = (
        await auth.register('Alice', 'alice@example.test', 'correct-password', 'en-US')
      ).user;
      const bob = (await auth.register('Bob', 'bob@example.test', 'correct-password')).user;
      for (const user of [alice, bob]) {
        await integration().saveAi(user.id, {
          provider: 'deepseek',
          model: 'test-model',
          apiKey: randomBytes(24).toString('hex'),
          consent: true,
        });
      }
      const finance = new FinanceService(database);
      await finance.save(alice.id, 'categories', { name: 'PRIVATE_CATEGORY' });
      await finance.save(alice.id, 'goals', { name: 'PRIVATE_GOAL', targetAmount: 10000 });
      assert.equal((await insights().list(alice.id)).enabled, false);
      await assert.rejects(insights().generate(alice.id, 'weekly', 'en-US'));
      assert.equal(ai.calls.length, 0);
      await integration().setInsightsEnabled(alice.id, true);
      let release!: () => void;
      ai.wait = new Promise<void>((resolve) => {
        release = resolve;
      });
      const first = insights().generate(alice.id, 'weekly', 'en-US');
      await waitForCalls(1);
      await assert.rejects(insights().generate(alice.id, 'weekly', 'en-US'));
      await assert.rejects(insights().generate(alice.id, 'weekly', 'en-US', true));
      assert.equal(ai.calls.length, 1);
      release();
      const report = await first;
      ai.wait = undefined;
      assert.equal(report.state, 'ready');
      assert.equal(report.report!.summary, 'Review PRIVATE_CATEGORY.');
      assert.equal((await insights().generate(alice.id, 'weekly', 'pt-BR')).id, report.id);
      assert.equal(ai.calls.length, 1);
      assert.doesNotMatch(
        JSON.stringify(ai.calls[0].snapshot),
        /PRIVATE_|alice|example.test|password/i,
      );
      assert.equal((await insights().list(bob.id)).reports.length, 0);
      assert.equal(
        (
          await database.forUser(bob.id, (db) =>
            db.query('SELECT id FROM ai_insights WHERE id=$1', [report.id]),
          )
        ).length,
        0,
      );
      assert.equal(
        (
          await database.forUser(bob.id, (db) =>
            db.query('UPDATE ai_insights SET report=NULL WHERE id=$1 RETURNING id', [report.id]),
          )
        ).length,
        0,
      );
      const policies = await database.query(
        "SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE relname='ai_insights'",
      );
      assert.ok(policies[0].relrowsecurity && policies[0].relforcerowsecurity);
      await database.query('UPDATE integration_settings SET ai_last_at=NULL WHERE user_id=$1', [
        alice.id,
      ]);
      ai.fail = true;
      await assert.rejects(insights().generate(alice.id, 'monthly', 'en-US'));
      assert.equal(
        (await insights().list(alice.id)).reports.find((value) => value.kind === 'monthly')!.state,
        'failed',
      );
      ai.fail = false;
      const callsAfterFailure = ai.calls.length;
      await assert.rejects(
        insights().generate(alice.id, 'monthly', 'en-US'),
        /Confirme explicitamente/,
      );
      assert.equal(ai.calls.length, callsAfterFailure);
      await insights().list(alice.id);
      assert.equal(ai.calls.length, callsAfterFailure);
      await database.query('UPDATE integration_settings SET ai_last_at=NULL WHERE user_id=$1', [
        alice.id,
      ]);
      const previousFetch = globalThis.fetch;
      let providerCalls = 0;
      try {
        globalThis.fetch = async (_url, options) => {
          providerCalls++;
          const request = JSON.parse(String(options?.body));
          assert.deepEqual(request.thinking, { type: 'disabled' });
          assert.doesNotMatch(
            JSON.stringify(request.messages),
            /PRIVATE_|alice|example.test|password/i,
          );
          return new Response(
            JSON.stringify({
              choices: [
                {
                  finish_reason: 'stop',
                  message: {
                    content:
                      '```json\n' +
                      JSON.stringify({
                        title: 'Monthly summary',
                        summary: 'Review [[category_1]].',
                        extra: 'ignored',
                        findings: [
                          { title: 'Coverage', detail: 'Recorded data may be incomplete.' },
                        ],
                      }) +
                      '\n```',
                  },
                },
              ],
            }),
            { status: 200 },
          );
        };
        const realAdapterService = new InsightsService(
          database,
          repository(),
          integration(),
          new FinanceService(database),
          new AiService(),
        );
        const saved = await realAdapterService.generate(alice.id, 'monthly', 'en-US', true);
        assert.equal(saved.state, 'ready');
        assert.equal(saved.report!.summary, 'Review PRIVATE_CATEGORY.');
        assert.equal(saved.report!.findings[0].suggestion, '');
        assert.equal(
          (await realAdapterService.generate(alice.id, 'monthly', 'en-US', true)).id,
          saved.id,
        );
        assert.equal(providerCalls, 1);
      } finally {
        globalThis.fetch = previousFetch;
      }
      assert.equal(
        (await insights().list(alice.id)).reports.filter((value) => value.state === 'ready').length,
        2,
      );
      await integration().setInsightsEnabled(bob.id, true);
      ai.wait = new Promise<void>((resolve) => {
        release = resolve;
      });
      const expectedCalls = ai.calls.length + 1;
      const revoked = insights().generate(bob.id, 'weekly', 'pt-BR');
      const rejection = assert.rejects(revoked);
      await waitForCalls(expectedCalls);
      await integration().setInsightsEnabled(bob.id, false);
      release();
      await rejection;
      ai.wait = undefined;
      const bobReport = (await insights().list(bob.id)).reports[0];
      assert.equal(bobReport.state, 'failed');
      assert.equal(bobReport.report, null);
      await repository().deleteAi(alice.id);
      assert.equal((await insights().list(alice.id)).enabled, false);
      assert.equal(
        (await insights().list(alice.id)).reports.filter((value) => value.state === 'ready').length,
        2,
      );
      await assert.rejects(insights().generate(alice.id, 'weekly', 'en-US'));
      await integration().saveAi(alice.id, {
        provider: 'deepseek',
        model: 'test-model',
        apiKey: randomBytes(24).toString('hex'),
        consent: true,
      });
      await integration().setInsightsEnabled(alice.id, true);
      await integration().saveAi(alice.id, {
        provider: 'openrouter',
        model: 'vendor/model',
        apiKey: randomBytes(24).toString('hex'),
        consent: true,
      });
      assert.equal((await insights().list(alice.id)).enabled, false);
      const backedUp = await backupInsights(database);
      assert.equal(backedUp.length, 2);
      await database.transaction(async (db) => {
        await db.query('DELETE FROM ai_insights');
        await restoreInsights(db, backedUp);
      });
      await database.onModuleDestroy();
      database = new DatabaseService();
      await database.onModuleInit();
      const reopened = await insights().list(alice.id);
      assert.equal(reopened.enabled, false);
      assert.equal(reopened.reports.length, 2);
      assert.equal(
        reopened.reports.find((value) => value.id === report.id)!.report!.summary,
        'Review PRIVATE_CATEGORY.',
      );
      assert.equal((await insights().list(bob.id)).reports.length, 0);
    } finally {
      await database.onModuleDestroy();
      for (const name of names) {
        if (previous[name] === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = previous[name];
        }
      }
      await rm(directory, { recursive: true });
    }
  },
);
