<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { X } from 'lucide-vue-next';
import { resources } from '../config/resources';
import { useFinanceStore } from '../stores/finance';
import type { FinanceRecord, RecordData, ResourceKind } from '../types';
const props = defineProps<{ kind: ResourceKind; record?: FinanceRecord; initial?: RecordData }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const finance = useFinanceStore();
const definition = resources[props.kind];
const form = ref<Record<string, string | number | boolean>>({});
const busy = ref(false);
const error = ref('');
const dialog = ref<HTMLDialogElement>();
const today = new Date();
const defaultDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
for (const field of definition.fields) {
  const original = props.record?.data[field.key] ?? props.initial?.[field.key];
  form.value[field.key] =
    original === undefined
      ? (field.default ??
        (field.type === 'checkbox'
          ? false
          : field.type === 'month'
            ? finance.month
            : field.type === 'date'
              ? !field.required
                ? ''
                : props.kind === 'goalContributions' || finance.month === defaultDate.slice(0, 7)
                  ? defaultDate
                  : `${finance.month}-01`
              : field.key === 'openingBalance'
                ? '0.00'
                : ''))
      : field.type === 'money'
        ? (Number(original) / 100).toFixed(2)
        : original;
}
const fields = computed(() =>
  definition.fields.filter((field) => {
    let visible = true;
    if (props.kind === 'transactions') {
      if (field.key === 'destinationAccountId') {
        visible = form.value.nature === 'transfer';
      }
      if (field.key === 'cardId') {
        visible = form.value.nature !== 'transfer';
      }
      if (['personId', 'categoryId'].includes(field.key)) {
        visible = !['transfer', 'invoice_payment'].includes(String(form.value.nature));
      }
    }
    return visible;
  }),
);
onMounted(() => dialog.value?.showModal());
async function save() {
  busy.value = true;
  error.value = '';
  try {
    const data: RecordData = {};
    for (const field of fields.value) {
      const value = form.value[field.key];
      if (value !== '' && value !== undefined) {
        if (field.type === 'money') {
          const normalized = String(value).replace(',', '.');
          const [integer, decimal = ''] = normalized.replace('-', '').split('.');
          data[field.key] =
            (Number(integer) * 100 + Number(decimal.padEnd(2, '0').slice(0, 2))) *
            (normalized.startsWith('-') ? -1 : 1);
        } else if (field.type === 'number') {
          data[field.key] = Number(value);
        } else {
          data[field.key] = value;
        }
      }
    }
    if (props.record?.data.sourceId) {
      data.sourceId = props.record.data.sourceId;
    }
    await finance.save(props.kind, data, props.record);
    emit('saved');
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'Não foi possível salvar.';
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <dialog ref="dialog" class="form-dialog" @cancel.prevent="emit('close')">
    <form @submit.prevent="save">
      <div class="dialog-header">
        <div>
          <span class="eyebrow">FINANCE SPACE</span>
          <h2>{{ record ? 'Editar' : 'Adicionar' }} {{ definition.singular }}</h2>
        </div>
        <button
          type="button"
          class="icon-button"
          aria-label="Fechar formulário"
          @click="emit('close')"
        >
          <X :size="20" />
        </button>
      </div>
      <div class="dialog-body">
        <div v-if="error" class="notice error" role="alert">{{ error }}</div>
        <p v-if="kind === 'recurring' || kind === 'income'" class="field-hint">
          Alterações recalculam as previsões do período. Realizações já registradas mantêm seus
          valores. Para uma mudança futura, encerre esta recorrência e crie outra.
        </p>
        <div class="form-grid">
          <label
            v-for="field in fields"
            :key="field.key"
            :class="{
              'full-width': field.type === 'textarea',
              'checkbox-label': field.type === 'checkbox',
            }"
            ><template v-if="field.type !== 'checkbox'"
              >{{ field.label }}<span v-if="field.required" class="required"> *</span></template
            ><select
              v-if="field.type === 'select'"
              v-model="form[field.key]"
              :required="field.required"
            >
              <option value="">Selecione</option>
              <template v-if="field.source"
                ><option
                  v-for="item in finance.byKind(field.source)"
                  :key="item.id"
                  :value="item.id"
                >
                  {{ item.data.name }}
                </option></template
              >
              <option
                v-for="option in field.options || []"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option></select
            ><textarea
              v-else-if="field.type === 'textarea'"
              :value="String(form[field.key] || '')"
              @input="form[field.key] = ($event.target as HTMLTextAreaElement).value"
              rows="3"
              maxlength="2000" /><template v-else-if="field.type === 'checkbox'"
              ><input v-model="form[field.key]" type="checkbox" />{{ field.label }}</template
            ><input
              v-else
              v-model="form[field.key]"
              :type="field.type === 'money' ? 'number' : field.type || 'text'"
              :step="field.type === 'money' ? '0.01' : field.type === 'number' ? '1' : undefined"
              :min="field.min"
              :max="field.max"
              :maxlength="field.type === 'text' ? 250 : undefined"
              :required="field.required"
          /></label>
        </div>
        <p v-if="fields.some((field) => field.source)" class="field-hint">
          Cadastre contas, cartões, categorias e responsáveis nas respectivas telas ou em
          Configurações.
        </p>
      </div>
      <div class="dialog-footer">
        <button class="button secondary" type="button" :disabled="busy" @click="emit('close')">
          Cancelar</button
        ><button class="button primary" :disabled="busy">
          {{ busy ? 'Salvando…' : 'Salvar alterações' }}
        </button>
      </div>
    </form>
  </dialog>
</template>
