import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createSSRApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { renderToString } from '@vue/server-renderer';
import { fileURLToPath } from 'node:url';

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
  console.log(
    'Component checks passed: privacy, goals, allowance reconciliation, escaped XSS payloads and CSV formula protection.',
  );
} finally {
  await server.close();
}
