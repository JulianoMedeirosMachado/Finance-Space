<script setup lang="ts">
import { t, language } from '../i18n';

import { computed, ref } from 'vue';
import {
  Target,
  Plus,
  Pencil,
  Trash2,
  ArrowUpRight,
  CheckCircle2,
  CalendarDays,
} from 'lucide-vue-next';
import { useFinanceStore } from '../stores/finance';
import { money, dateLabel } from '../utils/format';
import type { FinanceRecord, GoalSummary, RecordData, ResourceKind } from '../types';
import RecordForm from '../components/RecordForm.vue';
import ModalPanel from '../components/ModalPanel.vue';
import SortableHeader from '../components/SortableHeader.vue';
import { useTableSort, type SortColumns } from '../composables/useTableSort';

const finance = useFinanceStore();
const goals = computed(() => finance.dashboard?.goals || []);
const filter = ref('all');
const visibleGoals = computed(() =>
  goals.value.filter(
    (goal) =>
      filter.value === 'all' || (filter.value === 'completed' ? goal.completed : !goal.completed),
  ),
);
const form = ref<{ kind: ResourceKind; record?: FinanceRecord; initial?: RecordData }>();
const selectedId = ref('');
const selectedGoal = computed(() => goals.value.find((goal) => goal.id === selectedId.value));
const filteredContributions = computed(() =>
  finance.byKind('goalContributions').filter((record) => record.data.goalId === selectedId.value),
);
const contributionColumns = computed<SortColumns<FinanceRecord>>(() => ({
  date: (record) => record.data.date,
  amount: (record) => record.data.amount,
  note: (record) => record.data.note,
}));
const {
  sortedRows: contributions,
  changeSort: sortContributions,
  sortState: contributionSortState,
} = useTableSort(filteredContributions, contributionColumns, 'date', 'descending');
const deleting = ref<FinanceRecord>();
const busy = ref(false);
const error = ref('');

function editGoal(goal: GoalSummary) {
  form.value = { kind: 'goals', record: finance.records.find((record) => record.id === goal.id) };
}
function addContribution(goalId: string) {
  form.value = { kind: 'goalContributions', initial: { goalId } };
}
function requestDelete(id: string) {
  deleting.value = finance.records.find((record) => record.id === id);
  error.value = '';
}
async function confirmDelete() {
  busy.value = true;
  error.value = '';
  try {
    if (deleting.value) {
      await finance.remove(deleting.value);
      deleting.value = undefined;
    }
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : t('Não foi possível excluir.');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">{{ t('UM PASSO MAIS PERTO') }}</span>
      <h1>{{ t('Metas') }}</h1>
      <p>
        {{ t('Da próxima GPU à viagem dos sonhos: acompanhe o dinheiro que você já separou.') }}
      </p>
    </div>
    <button class="button primary" @click="form = { kind: 'goals' }">
      <Plus :size="18" />{{ t('Nova meta') }}
    </button>
  </div>
  <div class="goal-toolbar">
    <p>{{ t('O aporte mensal é um plano. Registre cada aporte quando separar o valor.') }}</p>
    <select v-model="filter" :aria-label="t('Filtrar metas')">
      <option value="all">{{ t('Todas as metas') }}</option>
      <option value="active">{{ t('Em andamento') }}</option>
      <option value="completed">{{ t('Concluídas') }}</option>
    </select>
  </div>
  <div v-if="visibleGoals.length" class="goals-grid">
    <article v-for="goal in visibleGoals" :key="goal.id" class="panel goal-card">
      <div class="goal-card-heading">
        <span class="settings-icon"
          ><CheckCircle2 v-if="goal.completed" :size="23" /><Target v-else :size="23"
        /></span>
        <div>
          <h2>{{ goal.name }}</h2>
          <span class="badge" :class="goal.completed ? 'paid' : 'planned'">{{
            goal.completed ? t('Meta alcançada') : t('Em andamento')
          }}</span>
        </div>
        <div class="goal-actions">
          <button
            class="icon-button"
            :aria-label="t('Editar meta {name}', { name: goal.name })"
            @click="editGoal(goal)"
          >
            <Pencil :size="16" /></button
          ><button
            class="icon-button danger-text"
            :aria-label="t('Excluir meta {name}', { name: goal.name })"
            @click="requestDelete(goal.id)"
          >
            <Trash2 :size="16" />
          </button>
        </div>
      </div>
      <div class="goal-amount">
        <strong>{{ money(goal.savedAmount) }}</strong
        ><span>{{ t('de') }} {{ money(goal.targetAmount) }}</span>
      </div>
      <div class="goal-progress-heading">
        <span>{{
          t(
            goal.contributionCount === 1
              ? '{count} aporte registrado'
              : '{count} aportes registrados',
            { count: goal.contributionCount },
          )
        }}</span
        ><strong
          >{{ goal.progress.toLocaleString(language, { maximumFractionDigits: 1 }) }}%</strong
        >
      </div>
      <progress
        class="goal-progress"
        :value="goal.progress"
        max="100"
        :aria-label="t('Progresso da meta {name}', { name: goal.name })"
      >
        {{ goal.progress }}%
      </progress>
      <p class="goal-remaining">
        {{
          goal.completed
            ? t('Objetivo alcançado. Cada aporte fez a diferença!')
            : t('Faltam {amount} para chegar lá.', { amount: money(goal.remainingAmount) })
        }}
      </p>
      <div class="goal-plan">
        <span v-if="goal.monthlyAmount"
          ><ArrowUpRight :size="15" />{{ money(goal.monthlyAmount) }} {{ t('por mês') }}</span
        ><span v-else>{{ t('Aporte mensal livre') }}</span
        ><span v-if="goal.deadline"><CalendarDays :size="14" />{{ dateLabel(goal.deadline) }}</span>
      </div>
      <p v-if="goal.estimatedContributions !== null && !goal.completed" class="field-hint">
        {{
          t(
            goal.estimatedContributions === 1
              ? 'Com o plano atual: aproximadamente {count} aporte para completar.'
              : 'Com o plano atual: aproximadamente {count} aportes para completar.',
            { count: goal.estimatedContributions },
          )
        }}
      </p>
      <div class="goal-card-footer">
        <button class="button primary" @click="addContribution(goal.id)">
          <Plus :size="16" />{{ t('Adicionar aporte') }}</button
        ><button class="text-button" @click="selectedId = goal.id">
          {{ t('Ver histórico →') }}
        </button>
      </div>
    </article>
  </div>
  <section v-else class="panel empty-state">
    <Target :size="38" />
    <h3>{{ goals.length ? t('Nenhuma meta neste filtro') : t('Qual é seu próximo objetivo?') }}</h3>
    <p>
      {{
        goals.length
          ? t('Escolha outro filtro para encontrar suas metas.')
          : t(
              'Defina um valor, planeje seu aporte mensal e acompanhe o progresso a cada contribuição.',
            )
      }}
    </p>
    <button v-if="!goals.length" class="button primary" @click="form = { kind: 'goals' }">
      <Plus :size="16" />{{ t('Criar minha primeira meta') }}
    </button>
  </section>
  <p class="field-hint">
    {{
      t(
        'Os aportes acompanham sua meta. Eles não criam nem duplicam lançamentos financeiros; registre as movimentações bancárias na tela Lançamentos.',
      )
    }}
  </p>
  <ModalPanel
    v-if="selectedGoal && !form && !deleting"
    :title="t('Aportes — {name}', { name: selectedGoal.name })"
    @close="selectedId = ''"
    ><div class="goal-history-total">
      <strong>{{ money(selectedGoal.savedAmount) }}</strong
      ><span>{{ t('guardados de') }} {{ money(selectedGoal.targetAmount) }}</span>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <SortableHeader
              :label="t('Data')"
              :state="contributionSortState('date')"
              @sort="sortContributions('date')"
            />
            <SortableHeader
              :label="t('Valor')"
              :state="contributionSortState('amount')"
              @sort="sortContributions('amount')"
            />
            <SortableHeader
              :label="t('Observação')"
              :state="contributionSortState('note')"
              @sort="sortContributions('note')"
            />
            <th>{{ t('Ações') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in contributions" :key="record.id">
            <td>{{ dateLabel(record.data.date) }}</td>
            <td>{{ money(record.data.amount) }}</td>
            <td>{{ record.data.note || '—' }}</td>
            <td class="actions-cell">
              <button
                class="icon-button"
                :aria-label="t('Editar aporte')"
                @click="form = { kind: 'goalContributions', record }"
              >
                <Pencil :size="15" /></button
              ><button
                class="icon-button danger-text"
                :aria-label="t('Excluir aporte')"
                @click="requestDelete(record.id)"
              >
                <Trash2 :size="15" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!contributions.length" class="empty-state compact">
        <p>{{ t('Nenhum aporte registrado nesta meta ainda.') }}</p>
      </div>
    </div>
    <template #footer
      ><button class="button secondary" @click="selectedId = ''">{{ t('Fechar') }}</button
      ><button class="button primary" @click="addContribution(selectedId)">
        <Plus :size="16" />{{ t('Adicionar aporte') }}
      </button></template
    ></ModalPanel
  >
  <ModalPanel v-if="deleting && !form" :title="t('Excluir registro?')" @close="deleting = undefined"
    ><p>
      {{ deleting.data.name || t('Este aporte') }}
      {{ t('será removido. O progresso será recalculado.') }}
    </p>
    <p v-if="deleting.kind === 'goals'" class="field-hint">
      {{
        t(
          'Metas com aportes são preservadas. Para excluir uma meta, remova seus aportes pelo histórico primeiro.',
        )
      }}
    </p>
    <p v-if="error" role="alert" class="notice error">{{ error }}</p>
    <template #footer
      ><button class="button secondary" :disabled="busy" @click="deleting = undefined">
        {{ t('Cancelar') }}</button
      ><button class="button danger" :disabled="busy" @click="confirmDelete">
        {{ busy ? t('Excluindo…') : t('Excluir') }}
      </button></template
    ></ModalPanel
  >
  <RecordForm
    v-if="form"
    :kind="form.kind"
    :record="form.record"
    :initial="form.initial"
    @close="form = undefined"
    @saved="form = undefined"
  />
</template>
