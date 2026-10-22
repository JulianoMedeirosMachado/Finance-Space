<script setup lang="ts">
import { computed, ref } from 'vue';
import { Search, Check, CalendarDays } from 'lucide-vue-next';
import { useFinanceStore } from '../stores/finance';
import { money, monthLabel, natureLabels, statusLabels } from '../utils/format';
import RecordForm from '../components/RecordForm.vue';
import type { FinanceRecord, MonthlyEntry } from '../types';
const finance = useFinanceStore();
const search = ref('');
const person = ref('');
const nature = ref('');
const busy = ref(false);
const error = ref('');
const selected = ref<MonthlyEntry>();
const selectedAccount = ref('');
const editing = ref<FinanceRecord>();
const entries = computed(() =>
  (finance.dashboard?.entries || []).filter(
    (entry) =>
      entry.description.toLowerCase().includes(search.value.toLowerCase()) &&
      (!person.value || entry.personId === person.value) &&
      (!nature.value || entry.nature === nature.value),
  ),
);
const total = computed(() => entries.value.reduce((sum, entry) => sum + entry.amount, 0));
async function realize() {
  busy.value = true;
  error.value = '';
  try {
    if (selected.value) {
      await finance.realize(selected.value.sourceId, selectedAccount.value || undefined);
      selected.value = undefined;
    }
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'Não foi possível registrar.';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">CADA DETALHE DO SEU MÊS</span>
      <h1>Meu mês</h1>
      <p>
        Recorrentes, parcelas e avulsos de {{ monthLabel(finance.month) }}, reunidos
        automaticamente.
      </p>
    </div>
    <RouterLink class="button secondary" to="/transactions">Ver lançamentos</RouterLink>
  </div>
  <section class="panel">
    <div class="table-toolbar">
      <div class="search-field">
        <Search :size="17" /><input
          v-model="search"
          placeholder="Buscar descrição"
          aria-label="Buscar descrição"
        />
      </div>
      <div class="toolbar-options">
        <select v-model="person" aria-label="Filtrar responsável">
          <option value="">Todos os responsáveis</option>
          <option v-for="item in finance.byKind('people')" :key="item.id" :value="item.id">
            {{ item.data.name }}
          </option></select
        ><select v-model="nature" aria-label="Filtrar natureza">
          <option value="">Todas as naturezas</option>
          <option v-for="(label, value) in natureLabels" :key="value" :value="value">
            {{ label }}
          </option>
        </select>
      </div>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Descrição</th>
            <th>Responsável</th>
            <th>Natureza</th>
            <th>Conta / cartão</th>
            <th>Parcela</th>
            <th>Término</th>
            <th>Saldo após o mês</th>
            <th>Valor</th>
            <th>Situação</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="entry in entries" :key="entry.id">
            <td>
              <strong>{{ entry.description }}</strong
              ><small class="table-secondary">{{
                entry.sourceKind === 'history'
                  ? 'Histórico'
                  : entry.sourceKind === 'transactions'
                    ? 'Lançamento'
                    : 'Previsão automática'
              }}</small>
            </td>
            <td>{{ finance.label(entry.personId) }}</td>
            <td>{{ natureLabels[entry.nature] }}</td>
            <td>{{ finance.label(entry.cardId || entry.accountId) }}</td>
            <td>{{ entry.installment || '—' }}</td>
            <td>{{ entry.endMonth ? monthLabel(String(entry.endMonth)) : '—' }}</td>
            <td>{{ entry.remainingAmount === undefined ? '—' : money(entry.remainingAmount) }}</td>
            <td class="money-cell">{{ money(entry.amount) }}</td>
            <td>
              <span class="badge" :class="entry.status">{{ statusLabels[entry.status] }}</span>
            </td>
            <td>
              <button
                v-if="entry.sourceKind !== 'transactions' && entry.sourceKind !== 'history'"
                class="button small secondary"
                @click="
                  selected = entry;
                  selectedAccount = String(entry.accountId || '');
                  error = '';
                "
              >
                <Check :size="14" />Realizar</button
              ><button
                v-else-if="entry.sourceKind === 'transactions'"
                class="text-button"
                @click="editing = finance.records.find((record) => record.id === entry.id)"
              >
                Editar
              </button>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="!entries.length" class="empty-state">
        <CalendarDays :size="34" />
        <h3>Nenhum lançamento neste mês</h3>
        <p>Cadastre seus compromissos ou importe sua planilha.</p>
      </div>
    </div>
    <div class="table-footer">
      <span>{{ entries.length }} registros</span
      ><span
        >Soma dos valores exibidos: <strong>{{ money(total) }}</strong></span
      >
    </div>
  </section>
  <RecordForm
    v-if="editing"
    kind="transactions"
    :record="editing"
    @close="editing = undefined"
    @saved="editing = undefined"
  />
  <div v-if="selected" class="modal-backdrop">
    <form class="confirm-dialog" @submit.prevent="realize">
      <h2>Registrar realização</h2>
      <p>{{ selected.description }} · {{ money(selected.amount) }}</p>
      <label
        >Conta bancária<select v-model="selectedAccount" :required="!selected.cardId">
          <option value="">
            {{
              selected.cardId
                ? 'Compra no cartão — sem saída bancária agora'
                : 'Selecione uma conta'
            }}
          </option>
          <option
            v-for="account in finance.byKind('accounts')"
            :key="account.id"
            :value="account.id"
          >
            {{ account.data.name }}
          </option>
        </select></label
      >
      <p class="field-hint">
        A realização substitui a previsão deste mês e preserva o valor registrado.
      </p>
      <p v-if="error" role="alert" class="notice error">{{ error }}</p>
      <div class="dialog-footer">
        <button
          type="button"
          class="button secondary"
          :disabled="busy"
          @click="selected = undefined"
        >
          Cancelar</button
        ><button class="button primary" :disabled="busy">
          {{ busy ? 'Salvando…' : 'Confirmar realização' }}
        </button>
      </div>
    </form>
  </div>
</template>
