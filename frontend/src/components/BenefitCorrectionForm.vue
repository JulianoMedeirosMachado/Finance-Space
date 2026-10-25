<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { X } from 'lucide-vue-next';
import { t } from '../i18n';
import { api } from '../services/api';
import { useFinanceStore } from '../stores/finance';
import { money, monthLabel } from '../utils/format';
import type { Dashboard } from '../types';

const props = defineProps<{ month: string; balance: number }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const finance = useFinanceStore();
const selectedMonth = props.month;
const expectedBalance = ref(props.balance);
const actualBalance = ref('');
const note = ref('');
const busy = ref(false);
const error = ref('');
const dialog = ref<HTMLDialogElement>();
const target = computed(() => {
  const value = actualBalance.value.trim().replace(',', '.');
  let result: number | null = null;
  if (/^\d+(\.\d{1,2})?$/.test(value)) {
    const [whole, fraction = ''] = value.split('.');
    const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
    if (Number.isSafeInteger(cents) && cents <= 100_000_000_000) {
      result = cents;
    }
  }
  return result;
});
const difference = computed(() =>
  target.value === null ? null : target.value - expectedBalance.value,
);
onMounted(() => dialog.value?.showModal());

async function reloadBalance() {
  busy.value = true;
  error.value = '';
  try {
    const summary = await api<Dashboard>(`/finance/dashboard?month=${selectedMonth}`);
    expectedBalance.value = summary.benefits.balance;
  } catch (failure) {
    error.value =
      failure instanceof Error ? failure.message : t('Não foi possível carregar os dados.');
  } finally {
    busy.value = false;
  }
}
async function save() {
  if (!busy.value && target.value !== null && difference.value !== 0) {
    busy.value = true;
    error.value = '';
    try {
      await finance.correctBenefitBalance({
        month: selectedMonth,
        balance: target.value,
        expectedBalance: expectedBalance.value,
        note: note.value,
      });
      emit('saved');
    } catch (failure) {
      error.value = failure instanceof Error ? failure.message : t('Não foi possível salvar.');
    } finally {
      busy.value = false;
    }
  }
}
</script>
<template>
  <dialog
    ref="dialog"
    class="form-dialog"
    aria-labelledby="benefit-correction-title"
    @cancel.prevent="!busy && emit('close')"
  >
    <form @submit.prevent="save">
      <div class="dialog-header">
        <h2 id="benefit-correction-title">{{ t('Corrigir saldo do vale') }}</h2>
        <button
          class="icon-button"
          type="button"
          :disabled="busy"
          :aria-label="t('Fechar formulário')"
          @click="emit('close')"
        >
          <X :size="20" />
        </button>
      </div>
      <div class="dialog-body">
        <p class="field-hint">
          {{ t('Competência') }}: <strong>{{ monthLabel(selectedMonth) }}</strong>
        </p>
        <p class="field-hint">
          {{
            t(
              'Informe o saldo real considerando todos os lançamentos até esta competência, incluindo o crédito do mês se ele já foi registrado. A diferença será salva como correção, sem contar como compra ou crédito.',
            )
          }}
        </p>
        <p>
          {{ t('Saldo calculado') }}: <strong>{{ money(expectedBalance) }}</strong>
        </p>
        <div class="form-grid">
          <label class="full-width"
            >{{ t('Saldo real no vale (R$)')
            }}<input
              v-model="actualBalance"
              inputmode="decimal"
              type="text"
              required
              maxlength="20"
              :disabled="busy"
              placeholder="0,00"
          /></label>
          <label class="full-width"
            >{{ t('Observação')
            }}<textarea v-model="note" maxlength="2000" rows="3" :disabled="busy" />
          </label>
        </div>
        <p v-if="difference !== null">
          {{ t('Correção a registrar') }}: <strong>{{ money(difference) }}</strong>
        </p>
        <p v-if="difference === 0" class="field-hint">
          {{ t('O saldo informado já corresponde ao calculado. Nenhuma correção é necessária.') }}
        </p>
        <p v-if="error" class="notice error" role="alert">{{ error }}</p>
        <button type="button" class="text-button" :disabled="busy" @click="reloadBalance">
          {{ t('Atualizar saldo calculado') }}
        </button>
      </div>
      <div class="dialog-footer">
        <button type="button" class="button secondary" :disabled="busy" @click="emit('close')">
          {{ t('Cancelar') }}
        </button>
        <button class="button primary" :disabled="busy || target === null || difference === 0">
          {{ busy ? t('Salvando…') : t('Confirmar correção') }}
        </button>
      </div>
    </form>
  </dialog>
</template>
