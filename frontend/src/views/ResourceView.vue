<script setup lang="ts">
import { computed, ref } from 'vue';
import { Plus, Search, Pencil, Trash2, ArrowDownToLine, CreditCard, Layers } from 'lucide-vue-next';
import { resources } from '../config/resources';
import { useFinanceStore } from '../stores/finance';
import { dateLabel, money, monthLabel, natureLabels, statusLabels } from '../utils/format';
import RecordForm from '../components/RecordForm.vue';
import StatCard from '../components/StatCard.vue';
import type { FinanceRecord, RecordData, ResourceKind } from '../types';
const props = defineProps<{ kind: ResourceKind }>();
const finance = useFinanceStore();
const definition = computed(() => resources[props.kind]);
const search = ref('');
const statusFilter = ref('');
const allMonths = ref(false);
const formOpen = ref(false);
const editing = ref<FinanceRecord>();
const initial = ref<RecordData>();
const deleting = ref<FinanceRecord>();
const busy = ref(false);
const error = ref('');
const scopedKinds = ['transactions', 'invoices', 'benefits', 'settlements', 'history'];
const rows = computed(() =>
  finance.byKind(props.kind).filter((record) => {
    const matchesMonth =
      allMonths.value || !scopedKinds.includes(props.kind) || record.data.month === finance.month;
    const matchesStatus = !statusFilter.value || record.data.status === statusFilter.value;
    const haystack = Object.entries(record.data)
      .map(([key, value]) => (key.endsWith('Id') ? finance.label(value) : value))
      .join(' ')
      .toLowerCase();
    return matchesMonth && matchesStatus && haystack.includes(search.value.toLowerCase());
  }),
);
const amountTotal = computed(() =>
  rows.value.reduce((sum, record) => sum + Number(record.data.amount || 0), 0),
);
function display(record: FinanceRecord, key: string) {
  const value = record.data[key];
  const field = definition.value.fields.find((item) => item.key === key);
  let result = String(value ?? '—');
  if (value !== undefined) {
    if (field?.type === 'money') {
      result = money(value);
    } else if (field?.source) {
      result = finance.label(value);
    } else if (field?.type === 'checkbox') {
      result = value ? 'Sim' : 'Não';
    } else if (field?.type === 'month') {
      result = monthLabel(String(value));
    } else if (field?.type === 'date') {
      result = dateLabel(value);
    } else if (key === 'nature') {
      result = natureLabels[String(value)] || String(value);
    } else if (key === 'status') {
      result = statusLabels[String(value)] || String(value);
    } else if (key === 'type') {
      result = value === 'bank' ? 'Conta bancária' : 'Dinheiro';
    }
  }
  return result;
}
function openForm(record?: FinanceRecord, values?: RecordData) {
  editing.value = record;
  initial.value = values;
  formOpen.value = true;
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
function exportCsv() {
  const columns = definition.value.columns;
  const escape = (value: string) => `"${value.replace(/^[=+@-]/, "'$&").replace(/"/g, '""')}"`;
  const header = columns.map(
    (key) => definition.value.fields.find((field) => field.key === key)?.label || key,
  );
  const csv =
    '\ufeff' +
    [header, ...rows.value.map((record) => columns.map((key) => display(record, key)))]
      .map((row) => row.map(escape).join(';'))
      .join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `finance-space-${props.kind}-${finance.month}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">{{
        kind === 'cards' || kind === 'accounts' ? 'SEU PATRIMÔNIO' : 'SUA ORGANIZAÇÃO'
      }}</span>
      <h1>{{ definition.title }}</h1>
      <p>{{ definition.description }}</p>
    </div>
    <button v-if="!definition.readOnly" class="button primary" @click="openForm()">
      <Plus :size="18" />Adicionar {{ definition.singular }}
    </button>
  </div>
  <div v-if="kind === 'accounts' && finance.dashboard?.balances.length" class="stats-grid">
    <StatCard
      v-for="account in finance.dashboard.balances"
      :key="account.id"
      :label="account.name"
      :value="account.balance"
      detail="Saldo realizado até a competência"
    />
  </div>
  <div v-if="kind === 'benefits' && finance.dashboard" class="stats-grid three">
    <StatCard
      label="Crédito do mês"
      :value="finance.dashboard.benefits.credits"
      tone="green"
    /><StatCard label="Consumo do mês" :value="finance.dashboard.benefits.spent" /><StatCard
      label="Saldo acumulado"
      :value="finance.dashboard.benefits.balance"
      detail="Créditos menos compras até este mês"
    />
  </div>
  <div v-if="kind === 'settlements' && finance.dashboard" class="stats-grid three">
    <StatCard
      v-for="person in finance.dashboard.thirdParty"
      :key="person.id"
      :label="person.name"
      :value="person.remaining"
      :detail="
        person.remaining >= 0
          ? 'Você tem a receber nesta competência'
          : 'Você tem a pagar nesta competência'
      "
    />
  </div>
  <div
    v-if="(kind === 'cards' || kind === 'invoices') && finance.dashboard?.cards.length"
    class="card-grid"
  >
    <article
      v-for="(card, index) in finance.dashboard.cards"
      :key="card.id"
      class="bank-card"
      :class="`bank-card-${index % 3}`"
    >
      <div class="bank-card-heading">
        <span>{{ card.name }}</span
        ><CreditCard :size="23" />
      </div>
      <small>Fatura de {{ monthLabel(finance.month) }}</small
      ><strong>{{ money(card.reported ?? card.predicted) }}</strong>
      <div class="card-utilization">
        <div :style="{ width: `${Math.min(100, Math.max(0, (card.utilization || 0) * 100))}%` }" />
      </div>
      <div class="bank-card-details">
        <span>Limite {{ card.limit === undefined ? 'não informado' : money(card.limit) }}</span
        ><span>{{
          card.utilization === null ? '—' : `${Math.round(card.utilization * 100)}%`
        }}</span>
      </div>
      <div class="bank-card-details">
        <span>Fecha dia {{ card.closingDay || '—' }}</span
        ><span>Vence dia {{ card.dueDay || '—' }}</span>
      </div>
      <p v-if="card.difference !== null" class="card-difference">
        Diferença da previsão: {{ money(card.difference) }} · Pago: {{ money(card.paid) }}
      </p>
      <RouterLink v-if="kind === 'cards'" class="text-button" to="/invoices"
        >Conferir faturas →</RouterLink
      >
    </article>
  </div>
  <p v-if="kind === 'installments'" class="field-hint">
    <Layers :size="16" /> A parcela atual e o término aparecem na visão Meu mês. O valor cadastrado
    é o de cada parcela.
  </p>
  <section class="panel">
    <div class="table-toolbar">
      <div class="search-field">
        <Search :size="17" /><input
          v-model="search"
          aria-label="Buscar registros"
          placeholder="Buscar por descrição, pessoa, categoria…"
        />
      </div>
      <div class="toolbar-options">
        <label v-if="scopedKinds.includes(kind)" class="inline-checkbox"
          ><input v-model="allMonths" type="checkbox" />Todos os meses</label
        ><select
          v-if="['transactions', 'settlements'].includes(kind)"
          v-model="statusFilter"
          aria-label="Filtrar por situação"
        >
          <option value="">Todas as situações</option>
          <option v-for="(label, value) in statusLabels" :key="value" :value="value">
            {{ label }}
          </option></select
        ><button
          class="icon-button"
          title="Exportar CSV"
          aria-label="Exportar registros em CSV"
          @click="exportCsv"
        >
          <ArrowDownToLine :size="18" />
        </button>
      </div>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th v-for="key in definition.columns" :key="key">
              {{ definition.fields.find((field) => field.key === key)?.label.replace(' (R$)', '') }}
            </th>
            <th v-if="!definition.readOnly" class="actions-cell">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="record in rows" :key="record.id">
            <td
              v-for="key in definition.columns"
              :key="key"
              :class="{
                'money-cell':
                  definition.fields.find((field) => field.key === key)?.type === 'money',
              }"
            >
              <span v-if="key === 'status'" class="badge" :class="String(record.data.status)">{{
                display(record, key)
              }}</span
              ><span v-else>{{ display(record, key) }}</span>
            </td>
            <td v-if="!definition.readOnly" class="actions-cell">
              <button class="icon-button" aria-label="Editar registro" @click="openForm(record)">
                <Pencil :size="15" /></button
              ><button
                class="icon-button danger-text"
                aria-label="Excluir registro"
                @click="
                  deleting = record;
                  error = '';
                "
              >
                <Trash2 :size="15" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!rows.length" class="empty-state">
        <component :is="kind === 'cards' ? CreditCard : Layers" :size="34" />
        <h3>{{ search ? 'Nenhum resultado por aqui' : 'Seu espaço está pronto para começar' }}</h3>
        <p>
          {{
            search
              ? 'Tente outro termo ou ajuste os filtros.'
              : 'Adicione um registro ou importe os dados da sua planilha.'
          }}
        </p>
        <RouterLink class="text-button" to="/imports">Importar minha planilha →</RouterLink>
      </div>
    </div>
    <div class="table-footer">
      <span>{{ rows.length }} registro{{ rows.length === 1 ? '' : 's' }}</span
      ><span v-if="definition.columns.includes('amount')"
        >Soma dos valores exibidos: <strong>{{ money(amountTotal) }}</strong></span
      >
    </div>
  </section>
  <RecordForm
    v-if="formOpen"
    :kind="kind"
    :record="editing"
    :initial="initial"
    @close="formOpen = false"
    @saved="formOpen = false"
  />
  <div v-if="deleting" class="modal-backdrop" @keydown.esc="deleting = undefined">
    <section
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-title"
      class="confirm-dialog"
    >
      <h2 id="delete-title">Excluir registro?</h2>
      <p>
        {{ deleting.data.name || deleting.data.description || 'O registro selecionado' }} será
        removido da sua conta.
      </p>
      <p v-if="error" class="notice error">{{ error }}</p>
      <div class="dialog-footer">
        <button class="button secondary" :disabled="busy" @click="deleting = undefined">
          Cancelar</button
        ><button class="button danger" :disabled="busy" @click="confirmDelete">
          {{ busy ? 'Excluindo…' : 'Excluir registro' }}
        </button>
      </div>
    </section>
  </div>
</template>
