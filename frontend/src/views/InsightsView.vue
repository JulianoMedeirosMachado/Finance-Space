<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { t } from '../i18n';
import { api } from '../services/api';
import InsightsPanel from '../components/InsightsPanel.vue';
import type { InsightKind, InsightsOverview } from '../types/insights';

const overview = ref<InsightsOverview | null>(null);
const kind = ref<InsightKind>('weekly');
const selectedId = ref('');
const busy = ref(false);
const waiting = ref(false);
const error = ref('');
const attempted = new Set<string>();
let lastRequest = 0;
let scheduled: ReturnType<typeof setTimeout> | undefined;
let polling: ReturnType<typeof setInterval> | undefined;
let active = true;
const current = computed(() =>
  overview.value?.reports.find(
    (report) =>
      report.kind === kind.value &&
      report.period_start === overview.value?.periods[kind.value].start,
  ),
);

async function refresh() {
  try {
    overview.value = await api<InsightsOverview>('/insights');
  } catch (failure) {
    error.value =
      failure instanceof Error ? failure.message : t('Não foi possível concluir a operação.');
  }
}

async function generate() {
  if (
    active &&
    overview.value?.enabled &&
    overview.value.ready &&
    !busy.value &&
    !selectedId.value &&
    current.value?.state !== 'ready'
  ) {
    const requestedKind = kind.value;
    attempted.add(`${requestedKind}:${overview.value.periods[requestedKind].start}`);
    busy.value = true;
    waiting.value = false;
    error.value = '';
    lastRequest = Date.now();
    try {
      await api(`/insights/${requestedKind}`, { method: 'POST' });
    } catch (failure) {
      error.value =
        failure instanceof Error ? failure.message : t('Não foi possível concluir a operação.');
    } finally {
      if (active) {
        await refresh();
        busy.value = false;
        scheduleNewPeriod();
      }
    }
  }
}

function scheduleNewPeriod() {
  clearTimeout(scheduled);
  waiting.value = false;
  if (
    active &&
    overview.value?.enabled &&
    overview.value.ready &&
    !busy.value &&
    !selectedId.value &&
    !current.value &&
    !attempted.has(`${kind.value}:${overview.value.periods[kind.value].start}`)
  ) {
    const delay = Math.max(0, lastRequest + 11000 - Date.now());
    waiting.value = delay > 0;
    scheduled = setTimeout(() => void generate(), delay);
  }
}

async function changeKind(value: InsightKind) {
  clearTimeout(scheduled);
  waiting.value = false;
  kind.value = value;
  selectedId.value = '';
  error.value = '';
  await refresh();
  scheduleNewPeriod();
}

function focusKind(value: InsightKind) {
  void changeKind(value);
  document.getElementById(`${value}-insights`)?.focus();
}

onMounted(async () => {
  await refresh();
  if (active) {
    scheduleNewPeriod();
    polling = setInterval(() => {
      if (!busy.value && overview.value?.reports.some((report) => report.state === 'generating')) {
        void refresh();
      }
    }, 5000);
  }
});
onUnmounted(() => {
  active = false;
  clearTimeout(scheduled);
  clearInterval(polling);
});

function selectReport(id: string) {
  selectedId.value = id;
  scheduleNewPeriod();
}
</script>

<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">{{ t('SEU DINHEIRO EM PERSPECTIVA') }}</span>
      <h1>{{ t('Insights da IA') }}</h1>
      <p>
        {{
          t(
            'Resumos semanais e mensais, com dados calculados pelo app e interpretados pela sua IA.',
          )
        }}
      </p>
    </div>
  </div>
  <div
    class="insight-tabs"
    role="tablist"
    :aria-label="t('Período dos insights')"
    @keydown.right.prevent="focusKind(kind === 'weekly' ? 'monthly' : 'weekly')"
    @keydown.left.prevent="focusKind(kind === 'weekly' ? 'monthly' : 'weekly')"
    @keydown.home.prevent="focusKind('weekly')"
    @keydown.end.prevent="focusKind('monthly')"
  >
    <button
      id="weekly-insights"
      class="button"
      :class="kind === 'weekly' ? 'primary' : 'secondary'"
      role="tab"
      :aria-selected="kind === 'weekly'"
      :tabindex="kind === 'weekly' ? 0 : -1"
      aria-controls="insights-content"
      @click="changeKind('weekly')"
    >
      {{ t('Insights semanais') }}
    </button>
    <button
      id="monthly-insights"
      class="button"
      :class="kind === 'monthly' ? 'primary' : 'secondary'"
      role="tab"
      :aria-selected="kind === 'monthly'"
      :tabindex="kind === 'monthly' ? 0 : -1"
      aria-controls="insights-content"
      @click="changeKind('monthly')"
    >
      {{ t('Insights mensais') }}
    </button>
  </div>
  <div
    id="insights-content"
    role="tabpanel"
    :aria-labelledby="kind === 'weekly' ? 'weekly-insights' : 'monthly-insights'"
  >
    <InsightsPanel
      v-if="overview"
      :overview="overview"
      :kind="kind"
      :selected-id="selectedId"
      :busy="busy"
      :waiting="waiting"
      :error="error"
      @generate="generate"
      @refresh="refresh"
      @select="selectReport"
    />
    <p v-else-if="error" class="notice error" role="alert">{{ error }}</p>
    <p v-else role="status">{{ t('Carregando insights...') }}</p>
  </div>
</template>
