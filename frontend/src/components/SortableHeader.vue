<script setup lang="ts">
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-vue-next';
import { t } from '../i18n';
import type { SortDirection } from '../composables/useTableSort';

defineProps<{ label: string; state: SortDirection | 'none' }>();
const emit = defineEmits<{ sort: [] }>();
</script>

<template>
  <th scope="col" :aria-sort="state">
    <button
      type="button"
      class="table-sort-button"
      :class="{ active: state !== 'none' }"
      :aria-label="
        state === 'ascending'
          ? t('Ordenar {column} em ordem decrescente', { column: label })
          : t('Ordenar {column} em ordem crescente', { column: label })
      "
      @click="emit('sort')"
    >
      <span>{{ label }}</span>
      <ArrowUp v-if="state === 'ascending'" :size="14" aria-hidden="true" />
      <ArrowDown v-else-if="state === 'descending'" :size="14" aria-hidden="true" />
      <ArrowUpDown v-else :size="14" aria-hidden="true" />
    </button>
  </th>
</template>
