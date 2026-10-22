<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
} from 'lucide-vue-next';
import { api } from '../services/api';
import { useFinanceStore } from '../stores/finance';
import { resources } from '../config/resources';
import { money, monthLabel } from '../utils/format';
import type { RecordData, ResourceKind } from '../types';
interface Controls {
  month: string;
  income: number;
  expenses: number;
  investments: number;
  freeBalance: number;
  benefitSpent: number;
  benefitCredit: number;
}
interface Preview {
  id: string;
  items: { id: string; kind: ResourceKind; data: RecordData; duplicate: boolean; source: string }[];
  errors: string[];
  warnings: string[];
  controls: Controls | null;
  comparison: Controls | null;
  alreadyImported: boolean;
}
const finance = useFinanceStore();
const file = ref<File>();
const preview = ref<Preview>();
const busy = ref(false);
const error = ref('');
const success = ref(false);
const excluded = ref<string[]>([]);
const selectedKind = ref('');
const imports = ref<
  { id: string; filename: string; created_at: string; summary: Record<string, number> }[]
>([]);
const counts = computed(() =>
  Object.entries(resources)
    .map(([kind, definition]) => ({
      kind,
      title: definition.title,
      count:
        preview.value?.items.filter(
          (item) => item.kind === kind && !item.duplicate && !excluded.value.includes(item.id),
        ).length || 0,
    }))
    .filter((item) => item.count),
);
const visibleItems = computed(() =>
  (preview.value?.items || []).filter(
    (item) => !selectedKind.value || item.kind === selectedKind.value,
  ),
);
const metrics = [
  { key: 'income', label: 'Receitas previstas' },
  { key: 'expenses', label: 'Despesas previstas' },
  { key: 'investments', label: 'Investimentos' },
  { key: 'freeBalance', label: 'Saldo livre previsto' },
  { key: 'benefitCredit', label: 'Crédito VA do mês' },
  { key: 'benefitSpent', label: 'Consumo VA do mês' },
] as const;
const matches = computed(
  () =>
    preview.value?.controls &&
    preview.value.comparison &&
    metrics.every(
      (metric) => preview.value!.controls![metric.key] === preview.value!.comparison![metric.key],
    ),
);
function pickFile(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0];
  preview.value = undefined;
  success.value = false;
  error.value = '';
}
async function loadHistory() {
  imports.value = await api('/imports');
}
onMounted(async () => {
  try {
    await loadHistory();
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'Não foi possível carregar.';
  }
});
async function analyze() {
  busy.value = true;
  error.value = '';
  success.value = false;
  try {
    if (file.value) {
      const form = new FormData();
      form.append('file', file.value);
      preview.value = await api<Preview>('/imports/preview', { method: 'POST', body: form });
      excluded.value = [];
    }
  } catch (failure) {
    error.value =
      failure instanceof Error ? failure.message : 'Não foi possível analisar a planilha.';
  } finally {
    busy.value = false;
  }
}
async function confirm() {
  busy.value = true;
  error.value = '';
  try {
    if (preview.value) {
      await api('/imports/confirm', {
        method: 'POST',
        body: JSON.stringify({ id: preview.value.id, excluded: excluded.value }),
      });
      if (preview.value.controls) {
        finance.month = preview.value.controls.month;
      }
      await finance.refresh();
      await loadHistory();
      success.value = true;
      preview.value = undefined;
      file.value = undefined;
    }
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : 'Não foi possível importar.';
  } finally {
    busy.value = false;
  }
}
function referenceLabel(id: unknown) {
  return String(
    preview.value?.items.find((item) => item.id === id)?.data.name || finance.label(id),
  );
}
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">SEU HISTÓRICO CONTINUA AQUI</span>
      <h1>Da planilha para o seu espaço</h1>
      <p>Importe seus dados, confira os valores e continue de onde parou.</p>
    </div>
  </div>
  <div class="import-steps">
    <span class="active">01 <strong>Selecionar planilha</strong></span
    ><ArrowRight :size="16" /><span :class="{ active: preview }"
      >02 <strong>Conferir os dados</strong></span
    ><ArrowRight :size="16" /><span :class="{ active: success }"
      >03 <strong>Pronto para continuar</strong></span
    >
  </div>
  <div v-if="error" role="alert" class="notice error">{{ error }}</div>
  <div v-if="success" role="status" class="notice success">
    <CheckCircle2 :size="20" />Importação concluída. Seus dados foram salvos na sua
    conta.<RouterLink class="text-button" to="/dashboard">Ver meu painel →</RouterLink>
  </div>
  <section v-if="!preview" class="panel upload-panel">
    <span class="upload-icon"><UploadCloud :size="32" /></span>
    <h2>Traga sua planilha de finanças</h2>
    <p>Selecione o arquivo modelo de finanças em formato .xlsx.</p>
    <label class="file-picker"
      ><input
        type="file"
        accept=".xlsx"
        aria-label="Selecionar planilha Excel"
        :disabled="busy"
        @change="pickFile"
      /><span class="button secondary"
        ><FileSpreadsheet :size="17" />{{ file?.name || 'Selecionar arquivo' }}</span
      ></label
    ><small>Até 10 MB. Seu arquivo original será preservado.</small
    ><button class="button primary" :disabled="!file || busy" @click="analyze">
      {{ busy ? 'Analisando planilha…' : 'Analisar e conferir dados' }}<ArrowRight :size="17" />
    </button>
  </section>
  <template v-if="preview"
    ><section class="panel import-summary">
      <div class="panel-heading">
        <div>
          <h2>Confira antes de importar</h2>
          <p>
            {{ preview.items.length }} registros reconhecidos.
            {{ preview.items.filter((item) => item.duplicate).length }} duplicados serão ignorados.
          </p>
        </div>
        <button class="text-button" :disabled="busy" @click="preview = undefined">
          Escolher outro arquivo
        </button>
      </div>
      <div v-if="preview.alreadyImported" class="notice warning">
        Este arquivo já foi importado. Registros ainda existentes serão ignorados.
      </div>
      <div class="import-counts">
        <span v-for="item in counts" :key="item.kind"
          ><strong>{{ item.count }}</strong
          >{{ item.title }}</span
        >
      </div>
      <div v-for="warning in preview.warnings" :key="warning" class="import-warning">
        <AlertTriangle :size="16" />
        <p>{{ warning }}</p>
      </div>
      <div v-if="preview.errors.length" class="notice error">
        <div>
          <strong>Corrija os erros na planilha e envie novamente:</strong>
          <p v-for="item in preview.errors" :key="item">{{ item }}</p>
        </div>
      </div>
    </section>
    <section v-if="preview.controls && preview.comparison" class="panel">
      <div class="panel-heading">
        <div>
          <h2>Conferência de {{ monthLabel(preview.controls.month) }}</h2>
          <p>
            Comparação dos valores salvos no Excel com os cálculos da plataforma antes da seleção de
            exclusões.
          </p>
        </div>
        <span class="badge" :class="matches ? 'paid' : 'planned'">{{
          matches ? 'Totais conferidos' : 'Revisar diferenças'
        }}</span>
      </div>
      <div class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Indicador</th>
              <th>Planilha</th>
              <th>Plataforma</th>
              <th>Diferença</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="metric in metrics" :key="metric.key">
              <td>{{ metric.label }}</td>
              <td>{{ money(preview.controls[metric.key]) }}</td>
              <td>{{ money(preview.comparison[metric.key]) }}</td>
              <td
                :class="{
                  'danger-text': preview.comparison[metric.key] !== preview.controls[metric.key],
                }"
              >
                {{ money(preview.comparison[metric.key] - preview.controls[metric.key]) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    <section class="panel">
      <div class="table-toolbar">
        <h2>Registros reconhecidos</h2>
        <select v-model="selectedKind" aria-label="Filtrar tipo importado">
          <option value="">Todos os tipos</option>
          <option v-for="(definition, kind) in resources" :key="kind" :value="kind">
            {{ definition.title }}
          </option>
        </select>
      </div>
      <div class="table-scroll import-table">
        <table>
          <thead>
            <tr>
              <th>Ignorar</th>
              <th>Origem</th>
              <th>Tipo</th>
              <th>Descrição</th>
              <th>Competência / início</th>
              <th>Responsável</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in visibleItems" :key="item.id">
              <td>
                <input
                  v-if="!['cards', 'categories', 'people'].includes(item.kind) && !item.duplicate"
                  v-model="excluded"
                  type="checkbox"
                  :value="item.id"
                  :aria-label="`Excluir da importação: ${item.data.description || item.data.name}`"
                /><span v-else class="badge" :class="item.duplicate ? '' : 'paid'">{{
                  item.duplicate ? 'Duplicado' : 'Cadastro'
                }}</span
                ><small
                  v-if="!['cards', 'categories', 'people'].includes(item.kind) && !item.duplicate"
                  >{{ excluded.includes(item.id) ? 'Ignorar' : 'Incluir' }}</small
                >
              </td>
              <td>{{ item.source }}</td>
              <td>{{ resources[item.kind].title }}</td>
              <td>{{ item.data.description || item.data.name }}</td>
              <td>{{ item.data.month || item.data.startMonth || '—' }}</td>
              <td>{{ item.data.personId ? referenceLabel(item.data.personId) : '—' }}</td>
              <td>{{ item.data.amount === undefined ? '—' : money(item.data.amount) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="table-footer">
        <span
          >Marque os registros que deseja ignorar. Cadastros necessários aos vínculos são
          mantidos.</span
        >
      </div>
    </section>
    <div class="import-confirm">
      <p>Confirme após revisar os dados. A prévia expira em 30 minutos.</p>
      <button
        class="button primary"
        :disabled="busy || !!preview.errors.length || !counts.length"
        @click="confirm"
      >
        {{ busy ? 'Importando…' : 'Confirmar importação' }}<CheckCircle2 :size="18" />
      </button>
    </div>
  </template>
  <section v-if="imports.length" class="panel">
    <div class="panel-heading"><h2>Importações anteriores</h2></div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Arquivo</th>
            <th>Data</th>
            <th>Registros importados</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in imports" :key="item.id">
            <td>{{ item.filename }}</td>
            <td>{{ new Date(item.created_at).toLocaleString('pt-BR') }}</td>
            <td>{{ Object.values(item.summary).reduce((sum, count) => sum + count, 0) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
