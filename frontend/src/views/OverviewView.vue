<script setup lang="ts">
import { computed } from 'vue';
import {
  ArrowUpRight,
  ArrowRight,
  Upload,
  Plus,
  Sparkles,
  CreditCard,
  CalendarDays,
} from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useFinanceStore } from '../stores/finance';
import { money, monthLabel } from '../utils/format';
import StatCard from '../components/StatCard.vue';
import TrendChart from '../components/TrendChart.vue';
const auth = useAuthStore();
const finance = useFinanceStore();
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
      <span class="eyebrow">SEU DINHEIRO, COM PERSPECTIVA</span>
      <h1>Olá, {{ auth.user?.name.split(' ')[0] }}<span class="greeting-dot">.</span></h1>
      <p>Aqui está o panorama das suas finanças em {{ monthLabel(finance.month) }}.</p>
    </div>
    <RouterLink class="button primary" to="/transactions"
      ><Plus :size="18" />Novo lançamento</RouterLink
    >
  </div>
  <div v-if="!finance.records.length && !finance.loading" class="welcome-banner">
    <div class="welcome-icon"><Sparkles :size="25" /></div>
    <div>
      <h3>Seu próximo capítulo começa aqui.</h3>
      <p>Traga sua planilha para o Finance Space e veja seus números ganharem perspectiva.</p>
    </div>
    <RouterLink class="button secondary" to="/imports"
      ><Upload :size="16" />Importar planilha</RouterLink
    >
  </div>
  <template v-if="summary"
    ><div class="stats-grid">
      <StatCard
        label="Receitas previstas"
        :value="summary.income"
        detail="Entradas planejadas para o mês"
        tone="green"
      /><StatCard
        label="Despesas e investimentos"
        :value="summary.expenses + summary.investments"
        detail="Recorrentes, parcelas e avulsos"
        tone="orange"
      /><StatCard
        label="Acertos previstos"
        :value="summary.reimbursements"
        detail="Participação de outras pessoas"
        tone="purple"
      /><StatCard
        label="Saldo livre previsto"
        :value="summary.freeBalance"
        detail="Receitas + acertos − saídas"
        :tone="summary.freeBalance < 0 ? 'red' : 'highlight'"
      />
    </div>
    <div class="dashboard-grid">
      <section class="panel chart-panel">
        <div class="panel-heading">
          <div>
            <h2>Seu dinheiro ao longo do tempo</h2>
            <p>Dois meses anteriores e próximos três meses.</p>
          </div>
          <ArrowUpRight :size="20" class="muted" />
        </div>
        <TrendChart :items="summary.trend" />
      </section>
      <section class="panel category-panel">
        <div class="panel-heading">
          <div>
            <h2>Para onde vai seu dinheiro</h2>
            <p>Despesas por categoria neste mês.</p>
          </div>
        </div>
        <div v-if="categories.length" class="category-list">
          <div v-for="(category, index) in categories" :key="category.name" class="category-item">
            <div>
              <span><i :style="{ background: colors[index] }" />{{ category.name }}</span
              ><strong>{{ money(category.amount) }}</strong>
            </div>
            <div class="category-track">
              <div
                :style="{
                  background: colors[index],
                  width: `${(Math.abs(category.amount) / totalCategories) * 100}%`,
                }"
              />
            </div>
          </div>
        </div>
        <div v-else class="empty-state compact">
          <p>Suas categorias aparecerão aqui ao cadastrar despesas.</p>
        </div>
      </section>
    </div>
    <div class="dashboard-bottom">
      <section class="panel">
        <div class="panel-heading">
          <div>
            <h2><CreditCard :size="18" />Seus cartões</h2>
            <p>Um olhar sobre as faturas do mês.</p>
          </div>
          <RouterLink class="text-button" to="/cards"
            >Ver todos <ArrowRight :size="15"
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
                card.dueDay ? `Vencimento dia ${card.dueDay}` : 'Vencimento não informado'
              }}</small>
            </div>
            <div class="align-right">
              <strong>{{ money(card.reported ?? card.predicted) }}</strong
              ><small>{{
                card.reported === undefined ? 'Previsto' : 'Informado pelo banco'
              }}</small>
            </div>
          </div>
        </div>
        <div v-else class="empty-state compact">
          <p>Cadastre um cartão para acompanhar suas faturas.</p>
        </div>
      </section>
      <section class="panel">
        <div class="panel-heading">
          <div>
            <h2><CalendarDays :size="18" />No seu radar</h2>
            <p>Próximos compromissos previstos.</p>
          </div>
          <RouterLink class="text-button" to="/month">Meu mês <ArrowRight :size="15" /></RouterLink>
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
            <strong class="align-right">{{ money(entry.amount) }}</strong>
          </div>
        </div>
        <div v-else class="empty-state compact">
          <p>Nenhum compromisso previsto para este mês.</p>
        </div>
      </section>
    </div>
    <div class="insight-strip">
      <Sparkles :size="19" />
      <p>
        Os valores previstos ajudam a planejar. Confira realizações e saldos bancários para
        acompanhar o que já aconteceu.
      </p>
      <RouterLink to="/reports" class="text-button">Explorar relatórios →</RouterLink>
    </div>
  </template>
</template>
