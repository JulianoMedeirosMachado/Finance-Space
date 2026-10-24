<script setup lang="ts">
import { t, language } from '../i18n';

import { useFinanceStore } from '../stores/finance';
import { money, monthLabel } from '../utils/format';
import TrendChart from '../components/TrendChart.vue';
import StatCard from '../components/StatCard.vue';
import SortableHeader from '../components/SortableHeader.vue';
import { computed } from 'vue';
import { useTableSort, type SortColumns } from '../composables/useTableSort';
import type { Dashboard } from '../types';
const finance = useFinanceStore();
const trendColumns = computed<SortColumns<Dashboard['trend'][number]>>(() => ({
  month: (row) => row.month,
  income: (row) => row.income,
  expenses: (row) => row.expenses,
  investments: (row) => row.investments,
  freeBalance: (row) => row.freeBalance,
}));
const trendHeaders = computed(() => [
  { key: 'month', label: t('Competência') },
  { key: 'income', label: t('Receitas') },
  { key: 'expenses', label: t('Despesas') },
  { key: 'investments', label: t('Investimentos') },
  { key: 'freeBalance', label: t('Saldo livre previsto') },
]);
const {
  sortedRows: trendRows,
  changeSort: sortTrend,
  sortState: trendSortState,
} = useTableSort(
  computed(() => finance.dashboard?.trend || []),
  trendColumns,
  'month',
);
const categoryColumns = computed<SortColumns<Dashboard['categories'][number]>>(() => ({
  name: (row) => (row.uncategorized ? t('Sem categoria') : row.name),
  amount: (row) => row.amount,
  share: (row) =>
    finance.dashboard?.expenses ? row.amount / finance.dashboard.expenses : undefined,
}));
const {
  sortedRows: categoryRows,
  changeSort: sortCategories,
  sortState: categorySortState,
} = useTableSort(
  computed(() => finance.dashboard?.categories || []),
  categoryColumns,
  'amount',
  'descending',
);
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">{{ t('ENTENDA SEUS NÚMEROS') }}</span>
      <h1>{{ t('Relatórios') }}</h1>
      <p>{{ t('Compare períodos e enxergue os compromissos que vêm pela frente.') }}</p>
    </div>
    <a class="button secondary" href="/api/finance/export" download>{{
      t('Exportar todos os dados')
    }}</a>
  </div>
  <template v-if="finance.dashboard"
    ><div class="stats-grid three">
      <StatCard
        :label="t('Receitas realizadas')"
        :value="finance.dashboard.realizedIncome"
        :detail="t('Receitas marcadas como lançadas ou pagas')"
        tone="green"
      /><StatCard
        :label="t('Investimentos previstos')"
        :value="finance.dashboard.investments"
        :detail="t('Aportes da competência selecionada')"
        tone="purple"
      /><StatCard
        :label="t('Saldo livre previsto')"
        :value="finance.dashboard.freeBalance"
        :detail="t('Inclui acertos previstos com terceiros')"
      />
    </div>
    <section class="panel chart-panel">
      <div class="panel-heading">
        <div>
          <h2>{{ t('Comparativo de competências') }}</h2>
          <p>{{ t('Valores previstos com realizações substituindo as respectivas previsões.') }}</p>
        </div>
      </div>
      <TrendChart :items="finance.dashboard.trend" />
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <SortableHeader
                v-for="column in trendHeaders"
                :key="column.key"
                :label="column.label"
                :state="trendSortState(column.key)"
                @sort="sortTrend(column.key)"
              />
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in trendRows" :key="item.month">
              <td>{{ monthLabel(item.month) }}</td>
              <td>{{ money(item.income) }}</td>
              <td>{{ money(item.expenses) }}</td>
              <td>{{ money(item.investments) }}</td>
              <td>{{ money(item.freeBalance) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <section class="panel">
      <div class="panel-heading">
        <div>
          <h2>{{ t('Despesas por categoria') }}</h2>
          <p>{{ monthLabel(finance.month) }}</p>
        </div>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <SortableHeader
                :label="t('Categoria')"
                :state="categorySortState('name')"
                @sort="sortCategories('name')"
              />
              <SortableHeader
                :label="t('Valor')"
                :state="categorySortState('amount')"
                @sort="sortCategories('amount')"
              />
              <SortableHeader
                :label="t('Participação nas despesas')"
                :state="categorySortState('share')"
                @sort="sortCategories('share')"
              />
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in categoryRows" :key="item.name">
              <td>{{ item.uncategorized ? t('Sem categoria') : item.name }}</td>
              <td>{{ money(item.amount) }}</td>
              <td>
                {{
                  finance.dashboard.expenses
                    ? `${((item.amount / finance.dashboard.expenses) * 100).toLocaleString(language, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
                    : '—'
                }}
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!finance.dashboard.categories.length" class="empty-state compact">
          <p>{{ t('Adicione despesas para visualizar a distribuição por categoria.') }}</p>
        </div>
      </div>
    </section></template
  >
</template>
