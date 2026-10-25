import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../services/api';
import type { Dashboard, FinanceRecord, RecordData, ResourceKind } from '../types';

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
export const useFinanceStore = defineStore('finance', () => {
  const month = ref(currentMonth());
  const records = ref<FinanceRecord[]>([]);
  const dashboard = ref<Dashboard | null>(null);
  const loading = ref(false);
  const message = ref('');
  const error = ref('');
  let loadVersion = 0;
  const byKind = computed(
    () => (kind: ResourceKind) => records.value.filter((record) => record.kind === kind),
  );
  async function refresh() {
    const version = ++loadVersion;
    loading.value = true;
    error.value = '';
    try {
      const [data, summary] = await Promise.all([
        api<FinanceRecord[]>('/finance/records'),
        api<Dashboard>(`/finance/dashboard?month=${month.value}`),
      ]);
      if (version === loadVersion) {
        records.value = data;
        dashboard.value = summary;
      }
    } catch (failure) {
      error.value =
        failure instanceof Error ? failure.message : 'Não foi possível carregar os dados.';
    } finally {
      if (version === loadVersion) {
        loading.value = false;
      }
    }
  }
  async function save(kind: ResourceKind, data: RecordData, record?: FinanceRecord) {
    await api(`/finance/records/${kind}${record ? `/${record.id}` : ''}`, {
      method: record ? 'PUT' : 'POST',
      body: JSON.stringify(record ? { data, version: record.version } : data),
    });
    message.value = 'Alterações salvas.';
    await refresh();
  }
  async function remove(record: FinanceRecord) {
    await api(`/finance/records/${record.id}`, { method: 'DELETE' });
    message.value = 'Registro excluído.';
    await refresh();
  }
  async function correctBenefitBalance(input: {
    month: string;
    balance: number;
    expectedBalance: number;
    note: string;
  }) {
    await api('/finance/benefits/correction', { method: 'POST', body: JSON.stringify(input) });
    message.value = 'Saldo do vale corrigido.';
    await refresh();
  }
  async function realize(sourceId: string, accountId?: string) {
    await api('/finance/realize', {
      method: 'POST',
      body: JSON.stringify({ month: month.value, sourceId, accountId }),
    });
    message.value = 'Realização registrada.';
    await refresh();
  }
  function label(id: unknown) {
    return String(records.value.find((record) => record.id === id)?.data.name || '—');
  }
  function reset() {
    loadVersion++;
    records.value = [];
    dashboard.value = null;
    error.value = '';
    message.value = '';
  }
  return {
    month,
    records,
    dashboard,
    loading,
    message,
    error,
    byKind,
    refresh,
    save,
    remove,
    correctBenefitBalance,
    realize,
    label,
    reset,
  };
});
