import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createSSRApp, computed, ref } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { renderToString } from '@vue/server-renderer';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { middlewareMode: true },
  appType: 'custom',
});
try {
  const { default: Overview } = await server.ssrLoadModule('/src/views/OverviewView.vue');
  const { default: Goals } = await server.ssrLoadModule('/src/views/GoalsView.vue');
  const { default: ResourceView } = await server.ssrLoadModule('/src/views/ResourceView.vue');
  const { usePrivacyStore } = await server.ssrLoadModule('/src/stores/privacy.ts');
  const { useFinanceStore } = await server.ssrLoadModule('/src/stores/finance.ts');
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: Overview }],
  });
  await router.push('/');
  const privacy = usePrivacyStore(pinia);
  const finance = useFinanceStore(pinia);
  finance.month = '2026-10';
  finance.records = [
    {
      id: 'credit',
      kind: 'benefits',
      data: { description: 'Benefit credit', amount: 10000, month: '2026-10', nature: 'income' },
      version: 1,
    },
    {
      id: 'purchase',
      kind: 'benefits',
      data: { description: 'Benefit purchase', amount: 2500, month: '2026-10', nature: 'expense' },
      version: 1,
    },
  ];
  finance.dashboard = {
    month: '2026-10',
    income: 123456789,
    expenses: 23456789,
    investments: 55500,
    reimbursements: 77700,
    freeBalance: 99999999,
    entries: [],
    pending: [
      {
        id: 'p',
        sourceId: 'p',
        sourceKind: 'recurring',
        description: 'Pending',
        nature: 'expense',
        amount: 54321,
        month: '2026-10',
        status: 'planned',
      },
    ],
    realizedIncome: 0,
    cards: [
      {
        id: 'c',
        name: 'Card',
        predicted: 98765,
        paid: 0,
        remaining: 98765,
        utilization: null,
        difference: null,
      },
    ],
    categories: [{ name: 'Category', amount: 65432 }],
    benefits: {
      credits: 10000,
      spent: 2500,
      previousBalance: 2000,
      monthBalance: 7500,
      balance: 9500,
    },
    balances: [],
    thirdParty: [],
    trend: [
      {
        month: '2026-10',
        income: 123456789,
        expenses: 23456789,
        investments: 55500,
        freeBalance: 99999999,
      },
    ],
    goals: [
      {
        id: 'goal',
        name: 'GPU',
        targetAmount: 500000,
        monthlyAmount: 10000,
        savedAmount: 10000,
        remainingAmount: 490000,
        progress: 2,
        completed: false,
        estimatedContributions: 49,
        contributionCount: 1,
      },
    ],
  };
  const render = (component, props) =>
    renderToString(createSSRApp(component, props).use(pinia).use(router));
  const { useTableSort } = await server.ssrLoadModule('/src/composables/useTableSort.ts');
  const { default: SortableHeader } = await server.ssrLoadModule(
    '/src/components/SortableHeader.vue',
  );
  const sortSource = ref([
    { id: 'zero', value: 0, date: '2025-12-31', name: 'Água 2', flag: false },
    { id: 'large', value: 10000, date: '2026-10-24', name: 'Água 10', flag: true },
    { id: 'negative', value: -100, date: '2026-01-01', name: 'Abacate', flag: false },
    { id: 'missing', value: undefined, date: undefined, name: undefined, flag: undefined },
    { id: 'equal', value: 10000, date: '2026-10-24', name: 'Zebra', flag: true },
  ]);
  const originalOrder = sortSource.value.map((row) => row.id);
  const tableSort = useTableSort(
    computed(() => sortSource.value),
    computed(() => ({
      date: (row) => row.date,
      value: (row) => row.value,
      name: (row) => row.name,
      flag: (row) => row.flag,
    })),
    'date',
    'descending',
  );
  const sortedIds = () => tableSort.sortedRows.value.map((row) => row.id);
  assert.deepEqual(sortedIds(), ['large', 'equal', 'negative', 'zero', 'missing']);
  tableSort.changeSort('value');
  assert.deepEqual(sortedIds(), ['negative', 'zero', 'large', 'equal', 'missing']);
  tableSort.changeSort('value');
  assert.deepEqual(sortedIds(), ['large', 'equal', 'zero', 'negative', 'missing']);
  assert.equal(tableSort.sortState('value'), 'descending');
  assert.equal(tableSort.sortState('date'), 'none');
  tableSort.changeSort('nonexistent');
  assert.equal(tableSort.sortKey.value, 'value');
  tableSort.changeSort('name');
  assert.deepEqual(sortedIds(), ['negative', 'zero', 'large', 'equal', 'missing']);
  tableSort.changeSort('flag');
  assert.deepEqual(sortedIds(), ['zero', 'negative', 'large', 'equal', 'missing']);
  assert.deepEqual(
    sortSource.value.map((row) => row.id),
    originalOrder,
  );
  sortSource.value = [
    ...sortSource.value,
    { id: 'fresh', value: 20000, date: '2026-10-25', name: 'Novo', flag: true },
  ];
  assert.equal(tableSort.sortKey.value, 'flag');
  assert.equal(tableSort.direction.value, 'ascending');
  assert.ok(sortedIds().includes('fresh'));
  const header = await render(SortableHeader, { label: 'Data', state: 'descending' });
  assert.match(header, /scope="col" aria-sort="descending"/);
  assert.match(header, /type="button"/);
  assert.match(header, /Ordenar Data em ordem crescente/);
  const escapedHeader = await render(SortableHeader, {
    label: '<img src=x onerror=alert(1)>',
    state: 'none',
  });
  assert.doesNotMatch(escapedHeader, /<img src=x/);
  const hidden = await render(Overview);
  assert.equal(privacy.hidden, true);
  assert.match(hidden, /R\$ ••••/);
  assert.doesNotMatch(hidden, /1\.234\.567,89|234\.567,89|999\.999,99|987,65|654,32|543,21/);
  assert.doesNotMatch(hidden, /title="Receitas:|title="Saídas:/);
  privacy.toggle();
  const visible = await render(Overview);
  assert.match(visible, /1\.234\.567,89/);
  assert.match(visible, /987,65/);
  assert.match(visible, /654,32/);
  assert.match(visible, /543,21/);
  assert.match(visible, /title="Receitas:/);
  privacy.hide();
  assert.doesNotMatch(await render(Overview), /1\.234\.567,89/);
  assert.equal(usePrivacyStore(createPinia()).hidden, true);
  const goals = await render(Goals);
  assert.match(goals, /GPU/);
  assert.match(goals, /2%/);
  assert.match(goals, /<progress[^>]*value="2"/);
  assert.match(goals, /5\.000,00/);
  const benefits = await render(ResourceView, { kind: 'benefits' });
  assert.match(benefits, /Crédito/);
  assert.match(benefits, /Compra/);
  assert.match(benefits, /Saldo anterior/);
  assert.match(benefits, /Resultado dos registros exibidos/);
  assert.match(benefits, /75,00/);
  const malicious = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
  finance.dashboard.goals[0].name = malicious;
  const escapedGoal = await render(Goals);
  assert.match(escapedGoal, /&lt;img/);
  assert.match(escapedGoal, /&lt;script&gt;/);
  assert.doesNotMatch(escapedGoal, /<img src=x|<script>alert/);
  finance.records[0].data.description = malicious;
  const escapedRecord = await render(ResourceView, { kind: 'benefits' });
  assert.match(escapedRecord, /&lt;img/);
  assert.doesNotMatch(escapedRecord, /<img src=x|<script>alert/);
  const { serializeCsv } = await server.ssrLoadModule('/src/utils/csv.ts');
  const csv = serializeCsv([['\t=HYPERLINK("https://example.test")', '  +formula', 'Normal text']]);
  assert.match(csv, /"'\t=HYPERLINK/);
  assert.match(csv, /"'  \+formula"/);
  assert.match(csv, /"Normal text"/);
  const { setLanguage, language, t } = await server.ssrLoadModule('/src/i18n/index.ts');
  const { resources } = await server.ssrLoadModule('/src/config/resources.ts');
  const { money, dateLabel, monthLabel } = await server.ssrLoadModule('/src/utils/format.ts');
  const { default: Settings } = await server.ssrLoadModule('/src/views/SettingsView.vue');
  const { default: Integrations } = await server.ssrLoadModule('/src/views/IntegrationsView.vue');
  const { default: Insights } = await server.ssrLoadModule('/src/views/InsightsView.vue');
  const { default: InsightsPanel } = await server.ssrLoadModule(
    '/src/components/InsightsPanel.vue',
  );
  const { default: Auth } = await server.ssrLoadModule('/src/views/AuthView.vue');
  const { default: Month } = await server.ssrLoadModule('/src/views/MonthView.vue');
  const { default: Reports } = await server.ssrLoadModule('/src/views/ReportsView.vue');
  const { default: RecordForm } = await server.ssrLoadModule('/src/components/RecordForm.vue');
  const { default: IntegrationSettings } = await server.ssrLoadModule(
    '/src/components/IntegrationSettings.vue',
  );
  assert.equal(resources.value.accounts.title, 'Contas bancárias');
  setLanguage('en-US');
  const integrationSource = await readFile(
    new URL('../src/components/IntegrationSettings.vue', import.meta.url),
    'utf8',
  );
  for (const match of integrationSource.matchAll(/\bt\(\s*'([^']+)'/g)) {
    assert.doesNotMatch(t(match[1]), /[çãõáéíóúêô]/i, `Untranslated integration text: ${match[1]}`);
  }
  for (const file of ['../src/views/InsightsView.vue', '../src/components/InsightsPanel.vue']) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    for (const match of source.matchAll(/\bt\(\s*'([^']+)'/g)) {
      assert.doesNotMatch(t(match[1]), /[çãõáéíóúêô]/i, `Untranslated insights text: ${match[1]}`);
    }
  }
  {
    let settings;
    await render({
      setup() {
        settings = IntegrationSettings.setup({}, { expose() {} });
        return () => null;
      },
    });
    const previousFetch = globalThis.fetch;
    const requests = [];
    let fail = false;
    let release;
    let pause = false;
    let saved = {
      aiAvailable: true,
      telegramAvailable: true,
      provider: 'deepseek',
      model: 'test-model',
      hasKey: true,
      insightsEnabled: false,
      telegram: null,
      candidate: null,
    };
    const renderSettings = () => render({ ...IntegrationSettings, setup: () => settings });
    try {
      globalThis.fetch = async (url, options) => {
        requests.push({ url: String(url), method: options.method, body: options.body });
        if (options.method === 'PATCH') {
          assert.equal(String(url), '/api/integrations/insights');
          if (pause) {
            await new Promise((resolve) => {
              release = resolve;
            });
          }
          if (fail) {
            return new Response(JSON.stringify({ message: 'Simulated failure' }), { status: 500 });
          }
          saved = { ...saved, insightsEnabled: JSON.parse(options.body).enabled };
        } else {
          assert.equal(String(url), '/api/integrations');
        }
        return new Response(JSON.stringify(saved), { status: 200 });
      };
      await settings.refresh();
      assert.equal(settings.insightsConsent.value, false);
      assert.equal(settings.insightsChanged.value, false);
      settings.insightsConsent.value = true;
      assert.equal(settings.status.value.insightsEnabled, false);
      assert.equal(requests.length, 1);
      const pending = await renderSettings();
      assert.match(pending, /Unsaved change/);
      assert.match(pending, /Confirm insights preference/);
      assert.match(pending, /integration-status[^>]*>Disabled/);
      assert.match(pending, /integration-consent-title/);
      await settings.saveInsights();
      assert.equal(saved.insightsEnabled, true);
      assert.equal(settings.insightsChanged.value, false);
      assert.equal(requests.length, 2);
      await settings.saveInsights();
      assert.equal(requests.length, 2);
      settings.insightsConsent.value = false;
      assert.equal(saved.insightsEnabled, true);
      fail = true;
      await settings.saveInsights();
      assert.equal(saved.insightsEnabled, true);
      assert.equal(settings.status.value.insightsEnabled, true);
      assert.equal(settings.insightsChanged.value, true);
      assert.equal(settings.error.value, 'Simulated failure');
      fail = false;
      pause = true;
      const saving = settings.saveInsights();
      assert.equal(settings.busy.value, true);
      const count = requests.length;
      await settings.saveInsights();
      assert.equal(requests.length, count);
      release();
      await saving;
      assert.equal(saved.insightsEnabled, false);
      assert.equal(settings.insightsChanged.value, false);
      saved = { ...saved, hasKey: false };
      await settings.refresh();
      settings.insightsConsent.value = true;
      const beforeBlocked = requests.length;
      await settings.saveInsights();
      assert.equal(requests.length, beforeBlocked);
      assert.equal(saved.insightsEnabled, false);
      assert.ok(
        requests.every(
          (request) =>
            request.url === '/api/integrations' || request.url === '/api/integrations/insights',
        ),
      );
    } finally {
      globalThis.fetch = previousFetch;
    }
  }
  const insightsOverview = {
    enabled: false,
    ready: false,
    periods: {
      weekly: { start: '2026-10-12', end: '2026-10-18' },
      monthly: { start: '2026-09-01', end: '2026-09-30' },
    },
    reports: [],
  };
  const disabledInsights = await render(InsightsPanel, {
    overview: insightsOverview,
    kind: 'weekly',
  });
  assert.match(disabledInsights, /Your insights are disabled/);
  assert.match(disabledInsights, /href="\/integrations"/);
  assert.doesNotMatch(disabledInsights, /Generate analysis/);
  const insightReport = {
    id: 'insight',
    kind: 'weekly',
    period_start: '2026-10-12',
    period_end: '2026-10-18',
    state: 'ready',
    report: {
      title: malicious,
      summary: malicious,
      findings: [{ title: 'Budget', detail: malicious, suggestion: malicious }],
    },
    language: 'en-US',
    model: 'model',
    generated_at: '2026-10-19T12:00:00Z',
  };
  const renderedInsight = await render(InsightsPanel, {
    overview: { ...insightsOverview, reports: [insightReport] },
    kind: 'weekly',
  });
  assert.match(renderedInsight, /&lt;img/);
  assert.doesNotMatch(renderedInsight, /<img src=x|<script>alert/);
  assert.match(renderedInsight, /Analysis history/);
  assert.doesNotMatch(renderedInsight, /[çãõáéíóúêô]/i);
  const failedInsights = await render(InsightsPanel, {
    overview: {
      ...insightsOverview,
      enabled: true,
      ready: true,
      reports: [{ ...insightReport, state: 'failed', report: null }],
    },
    kind: 'weekly',
  });
  assert.match(failedInsights, /I understand that retrying makes a new AI request/);
  assert.match(failedInsights, /type="checkbox"/);
  assert.match(failedInsights, /<button[^>]*disabled[^>]*>[\s\S]*?Try again/);
  assert.doesNotMatch(failedInsights, /[çãõáéíóúêô]/i);
  assert.equal(resources.value.accounts.title, 'Bank accounts');
  assert.equal(
    resources.value.transactions.fields.find((field) => field.key === 'nature').options[0].label,
    'Expense',
  );
  assert.equal(language.value, 'en-US');
  assert.match(money(123456), /1,234\.56/);
  assert.match(money(123456), /R\$/);
  assert.equal(dateLabel('2026-10-22'), '10/22/2026');
  assert.match(monthLabel('2026-10'), /Oct/);
  assert.equal(t('Editar meta {name}', { name: '<img>' }), 'Edit goal <img>');
  assert.equal(t('{count} aporte registrado', { count: 1 }), '1 contribution recorded');
  assert.equal(t('{count} aportes registrados', { count: 2 }), '2 contributions recorded');
  for (const component of [
    Overview,
    Goals,
    Settings,
    Auth,
    Month,
    Reports,
    IntegrationSettings,
    Integrations,
    Insights,
  ]) {
    const translated = (await render(component)).replaceAll('Português (Brasil)', '');
    assert.doesNotMatch(
      translated,
      /[çãõáéíóúêô]/i,
      `Untranslated interface in ${component.__file}`,
    );
  }
  for (const kind of Object.keys(resources.value)) {
    const translatedPage = await render(ResourceView, { kind });
    const translatedForm = await render(RecordForm, { kind });
    assert.doesNotMatch(translatedPage, /[çãõáéíóúêô]/i, `Untranslated page: ${kind}`);
    assert.doesNotMatch(translatedForm, /[çãõáéíóúêô]/i, `Untranslated form: ${kind}`);
  }
  const translatedGoal = await render(Goals);
  assert.match(translatedGoal, /&lt;img/);
  assert.doesNotMatch(translatedGoal, /<img src=x|<script>alert/);
  setLanguage('pt-BR');
  assert.equal(resources.value.accounts.title, 'Contas bancárias');
  assert.equal(dateLabel('2026-10-22'), '22/10/2026');
  assert.match(await render(Settings), /Idioma da conta/);
  const settingsPage = await render(Settings);
  assert.match(settingsPage, /href="\/integrations"/);
  assert.match(settingsPage, /Integração IA/);
  assert.doesNotMatch(settingsPage, /Carregando integrações|ai-api-key|integration-panel/);
  const integrationsPage = await render(Integrations);
  assert.match(integrationsPage, /<h1>Integração IA<\/h1>/);
  assert.match(integrationsPage, /href="\/settings"/);
  assert.match(integrationsPage, /integration-panel/);
  {
    const previousRecords = finance.records;
    const previousMonth = finance.month;
    const previousDocument = globalThis.document;
    const previousCreateUrl = URL.createObjectURL;
    const previousRevokeUrl = URL.revokeObjectURL;
    let capturedCsv;
    let clicked = false;
    try {
      finance.month = '2026-10';
      finance.records = [
        { id: 'a-card', kind: 'cards', version: 1, data: { name: 'Zebra' } },
        { id: 'z-card', kind: 'cards', version: 1, data: { name: 'Abacate' } },
        {
          id: 'old',
          kind: 'transactions',
          version: 1,
          data: {
            description: 'Older purchase',
            date: '2026-10-01',
            month: '2026-10',
            amount: 900,
            cardId: 'a-card',
            nature: 'expense',
            status: 'paid',
          },
        },
        {
          id: 'new',
          kind: 'transactions',
          version: 1,
          data: {
            description: 'New purchase',
            date: '2026-10-24',
            month: '2026-10',
            amount: 10000,
            cardId: 'z-card',
            nature: 'expense',
            status: 'posted',
          },
        },
        {
          id: 'middle',
          kind: 'transactions',
          version: 1,
          data: {
            description: 'Middle purchase',
            date: '2026-10-10',
            month: '2026-10',
            amount: 2000,
            nature: 'expense',
            status: 'posted',
          },
        },
        {
          id: 'next-month',
          kind: 'transactions',
          version: 1,
          data: {
            description: 'Future purchase',
            date: '2026-11-01',
            month: '2026-11',
            amount: 42,
            nature: 'expense',
            status: 'posted',
          },
        },
      ];
      const sourceOrder = finance.records.map((record) => record.id);
      let table;
      await render({
        setup() {
          table = ResourceView.setup({ kind: 'transactions' }, { expose() {} });
          return () => null;
        },
      });
      assert.deepEqual(
        table.rows.value.map((record) => record.id),
        ['new', 'middle', 'old'],
      );
      table.changeSort('amount');
      assert.deepEqual(
        table.rows.value.map((record) => record.id),
        ['old', 'middle', 'new'],
      );
      table.changeSort('cardId');
      assert.deepEqual(
        table.rows.value.map((record) => record.id),
        ['new', 'old', 'middle'],
      );
      table.search.value = 'abacate';
      assert.deepEqual(
        table.rows.value.map((record) => record.id),
        ['new'],
      );
      table.statusFilter.value = 'paid';
      assert.equal(table.rows.value.length, 0);
      table.statusFilter.value = 'posted';
      assert.equal(table.rows.value.length, 1);
      table.search.value = '';
      table.statusFilter.value = '';
      table.allMonths.value = true;
      assert.equal(table.rows.value.length, 4);
      assert.equal(table.sortState('cardId'), 'ascending');
      assert.deepEqual(
        finance.records.map((record) => record.id),
        sourceOrder,
      );
      table.allMonths.value = false;
      table.changeSort('date');
      table.changeSort('date');
      finance.records = [
        ...finance.records,
        {
          id: 'fresh',
          kind: 'transactions',
          version: 1,
          data: {
            description: 'Fresh purchase',
            date: '2026-10-25',
            month: '2026-10',
            amount: 1,
            nature: 'expense',
            status: 'posted',
          },
        },
      ];
      assert.equal(table.rows.value[0].id, 'fresh');
      assert.equal(table.sortState('date'), 'descending');
      assert.equal(table.amountTotal.value, 12901);
      assert.equal(finance.month, '2026-10');
      globalThis.document = {
        createElement: () => ({
          click() {
            clicked = true;
          },
        }),
      };
      URL.createObjectURL = (blob) => {
        capturedCsv = blob;
        return 'blob:synthetic-sort-test';
      };
      URL.revokeObjectURL = () => {};
      table.exportCsv();
      const csv = await capturedCsv.text();
      assert.equal(clicked, true);
      assert.ok(csv.indexOf('Fresh purchase') < csv.indexOf('New purchase'));
      assert.ok(csv.indexOf('New purchase') < csv.indexOf('Middle purchase'));
      assert.ok(csv.indexOf('Middle purchase') < csv.indexOf('Older purchase'));
      assert.doesNotMatch(csv, /Future purchase/);
    } finally {
      finance.records = previousRecords;
      finance.month = previousMonth;
      URL.createObjectURL = previousCreateUrl;
      URL.revokeObjectURL = previousRevokeUrl;
      if (previousDocument === undefined) {
        delete globalThis.document;
      } else {
        globalThis.document = previousDocument;
      }
    }
  }
  const shellSource = await readFile(
    new URL('../src/components/AppShell.vue', import.meta.url),
    'utf8',
  );
  assert.match(shellSource, /@click="finance\.refresh\(\)"/);
  assert.match(shellSource, /:disabled="finance\.loading"/);
  assert.match(
    shellSource,
    /:aria-label="finance\.loading \? t\('Atualizando dados\.\.\.'\) : t\('Atualizar dados'\)"/,
  );
  assert.doesNotMatch(shellSource, /location\.reload|router\.go\(0\)/);
  const previousFetch = globalThis.fetch;
  const previousFinance = {
    records: finance.records,
    dashboard: finance.dashboard,
    month: finance.month,
  };
  const previousRoute = router.currentRoute.value.fullPath;
  const previousPrivacy = privacy.hidden;
  const requests = [];
  try {
    globalThis.fetch = async (url, options) => {
      requests.push(String(url));
      assert.equal(options.method, undefined);
      const data = String(url).includes('/records')
        ? [
            {
              id: 'telegram-record',
              kind: 'transactions',
              version: 1,
              data: { description: 'Telegram purchase', amount: 2290 },
            },
          ]
        : { ...previousFinance.dashboard, expenses: 2290 };
      return new Response(JSON.stringify(data), { status: 200 });
    };
    const pending = finance.refresh();
    assert.equal(finance.loading, true);
    await pending;
    assert.equal(finance.loading, false);
    assert.equal(finance.records[0].id, 'telegram-record');
    assert.equal(finance.dashboard.expenses, 2290);
    assert.equal(finance.month, previousFinance.month);
    assert.equal(router.currentRoute.value.fullPath, previousRoute);
    assert.equal(privacy.hidden, previousPrivacy);
    assert.deepEqual(requests, [
      '/api/finance/records',
      `/api/finance/dashboard?month=${previousFinance.month}`,
    ]);
  } finally {
    globalThis.fetch = previousFetch;
    finance.$patch(previousFinance);
  }
  assert.match(
    await render(InsightsPanel, { overview: insightsOverview, kind: 'monthly' }),
    /Seus insights estão desabilitados/,
  );
  console.log(
    'Component checks passed: table sorting, privacy, goals, allowance reconciliation, escaped XSS payloads, CSV protection and Portuguese/English pages and forms.',
  );
} finally {
  await server.close();
}
