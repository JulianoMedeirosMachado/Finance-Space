<script setup lang="ts">
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
const contributions = computed(() =>
  finance
    .byKind('goalContributions')
    .filter((record) => record.data.goalId === selectedId.value)
    .sort(
      (a, b) =>
        String(b.data.date).localeCompare(String(a.data.date)) ||
        String(b.id).localeCompare(String(a.id)),
    ),
);
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
    error.value = failure instanceof Error ? failure.message : 'Não foi possível excluir.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">UM PASSO MAIS PERTO</span>
      <h1>Metas</h1>
      <p>Da próxima GPU à viagem dos sonhos: acompanhe o dinheiro que você já separou.</p>
    </div>
    <button class="button primary" @click="form = { kind: 'goals' }">
      <Plus :size="18" />Nova meta
    </button>
  </div>
  <div class="goal-toolbar">
    <p>O aporte mensal é um plano. Registre cada aporte quando separar o valor.</p>
    <select v-model="filter" aria-label="Filtrar metas">
      <option value="all">Todas as metas</option>
      <option value="active">Em andamento</option>
      <option value="completed">Concluídas</option>
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
            goal.completed ? 'Meta alcançada' : 'Em andamento'
          }}</span>
        </div>
        <div class="goal-actions">
          <button
            class="icon-button"
            :aria-label="`Editar meta ${goal.name}`"
            @click="editGoal(goal)"
          >
            <Pencil :size="16" /></button
          ><button
            class="icon-button danger-text"
            :aria-label="`Excluir meta ${goal.name}`"
            @click="requestDelete(goal.id)"
          >
            <Trash2 :size="16" />
          </button>
        </div>
      </div>
      <div class="goal-amount">
        <strong>{{ money(goal.savedAmount) }}</strong
        ><span>de {{ money(goal.targetAmount) }}</span>
      </div>
      <div class="goal-progress-heading">
        <span
          >{{ goal.contributionCount }} aporte{{
            goal.contributionCount === 1 ? '' : 's'
          }}
          registrado{{ goal.contributionCount === 1 ? '' : 's' }}</span
        ><strong>{{ goal.progress.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) }}%</strong>
      </div>
      <progress
        class="goal-progress"
        :value="goal.progress"
        max="100"
        :aria-label="`Progresso da meta ${goal.name}`"
      >
        {{ goal.progress }}%
      </progress>
      <p class="goal-remaining">
        {{
          goal.completed
            ? 'Objetivo alcançado. Cada aporte fez a diferença!'
            : `Faltam ${money(goal.remainingAmount)} para chegar lá.`
        }}
      </p>
      <div class="goal-plan">
        <span v-if="goal.monthlyAmount"
          ><ArrowUpRight :size="15" />{{ money(goal.monthlyAmount) }} por mês</span
        ><span v-else>Aporte mensal livre</span
        ><span v-if="goal.deadline"><CalendarDays :size="14" />{{ dateLabel(goal.deadline) }}</span>
      </div>
      <p v-if="goal.estimatedContributions !== null && !goal.completed" class="field-hint">
        Com o plano atual: aproximadamente {{ goal.estimatedContributions }} aporte{{
          goal.estimatedContributions === 1 ? '' : 's'
        }}
        para completar.
      </p>
      <div class="goal-card-footer">
        <button class="button primary" @click="addContribution(goal.id)">
          <Plus :size="16" />Adicionar aporte</button
        ><button class="text-button" @click="selectedId = goal.id">Ver histórico →</button>
      </div>
    </article>
  </div>
  <section v-else class="panel empty-state">
    <Target :size="38" />
    <h3>{{ goals.length ? 'Nenhuma meta neste filtro' : 'Qual é seu próximo objetivo?' }}</h3>
    <p>
      {{
        goals.length
          ? 'Escolha outro filtro para encontrar suas metas.'
          : 'Defina um valor, planeje seu aporte mensal e acompanhe o progresso a cada contribuição.'
      }}
    </p>
    <button v-if="!goals.length" class="button primary" @click="form = { kind: 'goals' }">
      <Plus :size="16" />Criar minha primeira meta
    </button>
  </section>
  <p class="field-hint">
    Os aportes acompanham sua meta. Eles não criam nem duplicam lançamentos financeiros; registre as
    movimentações bancárias na tela Lançamentos.
  </p>
  <ModalPanel
    v-if="selectedGoal && !form && !deleting"
    :title="`Aportes — ${selectedGoal.name}`"
    @close="selectedId = ''"
    ><div class="goal-history-total">
      <strong>{{ money(selectedGoal.savedAmount) }}</strong
      ><span>guardados de {{ money(selectedGoal.targetAmount) }}</span>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Valor</th>
            <th>Observação</th>
            <th>Ações</th>
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
                aria-label="Editar aporte"
                @click="form = { kind: 'goalContributions', record }"
              >
                <Pencil :size="15" /></button
              ><button
                class="icon-button danger-text"
                aria-label="Excluir aporte"
                @click="requestDelete(record.id)"
              >
                <Trash2 :size="15" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!contributions.length" class="empty-state compact">
        <p>Nenhum aporte registrado nesta meta ainda.</p>
      </div>
    </div>
    <template #footer
      ><button class="button secondary" @click="selectedId = ''">Fechar</button
      ><button class="button primary" @click="addContribution(selectedId)">
        <Plus :size="16" />Adicionar aporte
      </button></template
    ></ModalPanel
  >
  <ModalPanel v-if="deleting && !form" title="Excluir registro?" @close="deleting = undefined"
    ><p>{{ deleting.data.name || 'Este aporte' }} será removido. O progresso será recalculado.</p>
    <p v-if="deleting.kind === 'goals'" class="field-hint">
      Metas com aportes são preservadas. Para excluir uma meta, remova seus aportes pelo histórico
      primeiro.
    </p>
    <p v-if="error" role="alert" class="notice error">{{ error }}</p>
    <template #footer
      ><button class="button secondary" :disabled="busy" @click="deleting = undefined">
        Cancelar</button
      ><button class="button danger" :disabled="busy" @click="confirmDelete">
        {{ busy ? 'Excluindo…' : 'Excluir' }}
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
