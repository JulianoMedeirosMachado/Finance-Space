<script setup lang="ts">
import { t } from '../i18n';

import { computed } from 'vue';
import { money, monthLabel } from '../utils/format';
const props = defineProps<{
  items: { month: string; income: number; expenses: number; investments: number }[];
}>();
const max = computed(() =>
  Math.max(1, ...props.items.flatMap((item) => [item.income, item.expenses + item.investments])),
);
</script>
<template>
  <div class="trend-chart" role="img" :aria-label="t('Comparativo mensal de receitas e despesas')">
    <div v-for="item in items" :key="item.month" class="trend-group">
      <div class="trend-bars">
        <div
          class="trend-bar income-bar"
          :style="{ height: `${Math.max(1, (item.income / max) * 100)}%` }"
          :title="`${t('Receitas')}: ${money(item.income)}`"
        />
        <div
          class="trend-bar expense-bar"
          :style="{ height: `${Math.max(1, ((item.expenses + item.investments) / max) * 100)}%` }"
          :title="`${t('Saídas')}: ${money(item.expenses + item.investments)}`"
        />
      </div>
      <small>{{ monthLabel(item.month) }}</small>
    </div>
  </div>
  <div class="chart-legend">
    <span><i class="income-dot" />{{ t('Receitas') }}</span
    ><span><i class="expense-dot" />{{ t('Despesas + investimentos') }}</span>
  </div>
</template>
