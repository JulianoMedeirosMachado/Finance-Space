<script setup lang="ts">
import { t } from '../i18n';

import { computed } from 'vue';
import {
  ArrowUpRight,
  ArrowRight,
  Eye,
  EyeOff,
  Plus,
  Sparkles,
  CreditCard,
  CalendarDays,
} from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useFinanceStore } from '../stores/finance';
import { usePrivacyStore } from '../stores/privacy';
import { monthLabel } from '../utils/format';
import StatCard from '../components/StatCard.vue';
import TrendChart from '../components/TrendChart.vue';
const auth = useAuthStore();
const finance = useFinanceStore();
const privacy = usePrivacyStore();
const summary = computed(() => finance.dashboard);
const categories = computed(() => summary.value?.categories.slice(0, 5) || []);
const totalCategories = computed(() =>
  Math.max(1, ...categories.value.map((category) => Math.abs(category.amount))),
);
const colors = ['#48cfa4', '#7d8ff0', '#eab778', '#c58bf0', '#77b9e5'];
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">{{ t('SEU DINHEIRO, COM PERSPECTIVA') }}</span>
      <h1>
        {{ t('Olá,') }} {{ auth.user?.name.split(' ')[0] }}<span class="greeting-dot">.</span>
      </h1>
      <p>{{ t('Aqui está o panorama das suas finanças em') }} {{ monthLabel(finance.month) }}.</p>
    </div>
    <div class="page-actions">
      <button
        class="button secondary"
        :aria-label="
          privacy.hidden ? t('Mostrar valores do painel') : t('Ocultar valores do painel')
        "
        :aria-pressed="privacy.hidden"
        @click="privacy.toggle"
      >
        <Eye v-if="privacy.hidden" :size="18" /><EyeOff v-else :size="18" />{{
          privacy.hidden ? t('Mostrar valores') : t('Ocultar valores')
        }}</button
      ><RouterLink class="button primary" to="/transactions"
        ><Plus :size="18" />{{ t('Novo lançamento') }}</RouterLink
      >
    </div>
  </div>
  <div v-if="!finance.records.length && !finance.loading" class="welcome-banner">
    <div class="welcome-icon"><Sparkles :size="25" /></div>
    <div>
      <h3>{{ t('Seu próximo capítulo começa aqui.') }}</h3>
      <p>
        {{ t('Cadastre suas contas, organize seus lançamentos e comece a planejar suas metas.') }}
      </p>
    </div>
    <RouterLink class="button secondary" to="/accounts"
      ><Plus :size="16" />{{ t('Adicionar conta') }}</RouterLink
    >
  </div>
  <template v-if="summary"
    ><div class="stats-grid">
      <StatCard
        :masked="privacy.hidden"
        :label="t('Receitas previstas')"
        :value="summary.income"
        :detail="t('Entradas planejadas para o mês')"
        tone="green"
      /><StatCard
        :masked="privacy.hidden"
        :label="t('Despesas e investimentos')"
        :value="summary.expenses + summary.investments"
        :detail="t('Recorrentes, parcelas e avulsos')"
        tone="orange"
      /><StatCard
        :masked="privacy.hidden"
        :label="t('Acertos previstos')"
        :value="summary.reimbursements"
        :detail="t('Participação de outras pessoas')"
        tone="purple"
      /><StatCard
        :masked="privacy.hidden"
        :label="t('Saldo livre previsto')"
        :value="summary.freeBalance"
        :detail="t('Receitas + acertos − saídas')"
        :tone="!privacy.hidden && summary.freeBalance < 0 ? 'red' : 'highlight'"
      />
    </div>
    <div class="dashboard-grid">
      <section class="panel chart-panel">
        <div class="panel-heading">
          <div>
            <h2>{{ t('Seu dinheiro ao longo do tempo') }}</h2>
            <p>{{ t('Dois meses anteriores e próximos três meses.') }}</p>
          </div>
          <ArrowUpRight :size="20" class="muted" />
        </div>
        <TrendChart v-if="!privacy.hidden" :items="summary.trend" />
        <div v-else class="private-chart">
          <EyeOff :size="27" />
          <p>{{ t('Seus valores estão ocultos.') }}</p>
          <button class="text-button" @click="privacy.toggle">
            {{ t('Mostrar o comparativo') }}
          </button>
        </div>
      </section>
      <section class="panel category-panel">
        <div class="panel-heading">
          <div>
            <h2>{{ t('Para onde vai seu dinheiro') }}</h2>
            <p>{{ t('Despesas por categoria neste mês.') }}</p>
          </div>
        </div>
        <div v-if="categories.length" class="category-list">
          <div v-for="(category, index) in categories" :key="category.name" class="category-item">
            <div>
              <span
                ><i :style="{ background: colors[index] }" />{{
                  category.uncategorized ? t('Sem categoria') : category.name
                }}</span
              ><strong>{{ privacy.formatAmount(category.amount) }}</strong>
            </div>
            <div class="category-track">
              <div
                :style="{
                  background: colors[index],
                  width: privacy.hidden
                    ? '0%'
                    : `${(Math.abs(category.amount) / totalCategories) * 100}%`,
                }"
              />
            </div>
          </div>
        </div>
        <div v-else class="empty-state compact">
          <p>{{ t('Suas categorias aparecerão aqui ao cadastrar despesas.') }}</p>
        </div>
      </section>
    </div>
    <div class="dashboard-bottom">
      <section class="panel">
        <div class="panel-heading">
          <div>
            <h2><CreditCard :size="18" />{{ t('Seus cartões') }}</h2>
            <p>{{ t('Um olhar sobre as faturas do mês.') }}</p>
          </div>
          <RouterLink class="text-button" to="/cards"
            >{{ t('Ver todos') }} <ArrowRight :size="15"
          /></RouterLink>
        </div>
        <div v-if="summary.cards.length" class="mini-card-list">
          <div v-for="(card, index) in summary.cards" :key="card.id" class="mini-card-row">
            <span class="card-avatar" :class="`card-color-${index % 3}`"
              ><CreditCard :size="19"
            /></span>
            <div>
              <strong>{{ card.name }}</strong
              ><small>{{
                card.dueDay
                  ? t('Vencimento dia {day}', { day: card.dueDay })
                  : t('Vencimento não informado')
              }}</small>
            </div>
            <div class="align-right">
              <strong>{{ privacy.formatAmount(card.reported ?? card.predicted) }}</strong
              ><small>{{
                card.reported === undefined ? t('Previsto') : t('Informado pelo banco')
              }}</small>
            </div>
          </div>
        </div>
        <div v-else class="empty-state compact">
          <p>{{ t('Cadastre um cartão para acompanhar suas faturas.') }}</p>
        </div>
      </section>
      <section class="panel">
        <div class="panel-heading">
          <div>
            <h2><CalendarDays :size="18" />{{ t('No seu radar') }}</h2>
            <p>{{ t('Próximos compromissos previstos.') }}</p>
          </div>
          <RouterLink class="text-button" to="/month"
            >{{ t('Meu mês') }} <ArrowRight :size="15"
          /></RouterLink>
        </div>
        <div v-if="summary.pending.length" class="upcoming-list">
          <div v-for="entry in summary.pending.slice(0, 4)" :key="entry.id" class="upcoming-row">
            <span class="date-tile"
              >{{ String(entry.date || finance.month + '-01').slice(8, 10)
              }}<small>{{ monthLabel(finance.month).split(' ')[0] }}</small></span
            >
            <div>
              <strong>{{ entry.description }}</strong
              ><small>{{ finance.label(entry.cardId || entry.accountId) }}</small>
            </div>
            <strong class="align-right">{{ privacy.formatAmount(entry.amount) }}</strong>
          </div>
        </div>
        <div v-else class="empty-state compact">
          <p>{{ t('Nenhum compromisso previsto para este mês.') }}</p>
        </div>
      </section>
    </div>
    <div class="insight-strip">
      <Sparkles :size="19" />
      <p>
        {{
          t(
            'Os valores previstos ajudam a planejar. Confira realizações e saldos bancários para acompanhar o que já aconteceu.',
          )
        }}
      </p>
      <RouterLink to="/reports" class="text-button">{{ t('Explorar relatórios →') }}</RouterLink>
    </div>
  </template>
</template>
