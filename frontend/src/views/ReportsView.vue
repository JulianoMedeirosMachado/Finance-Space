<script setup lang="ts">
import { t, language } from '../i18n';

import { useFinanceStore } from '../stores/finance';
import { money, monthLabel } from '../utils/format';
import TrendChart from '../components/TrendChart.vue';
import StatCard from '../components/StatCard.vue';
const finance = useFinanceStore();
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
              <th>{{ t('Competência') }}</th>
              <th>{{ t('Receitas') }}</th>
              <th>{{ t('Despesas') }}</th>
              <th>{{ t('Investimentos') }}</th>
              <th>{{ t('Saldo livre previsto') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in finance.dashboard.trend" :key="item.month">
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
              <th>{{ t('Categoria') }}</th>
              <th>{{ t('Valor') }}</th>
              <th>{{ t('Participação nas despesas') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in finance.dashboard.categories" :key="item.name">
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
