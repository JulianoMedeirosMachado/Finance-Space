import { computed, ref, type ComputedRef } from 'vue';
import { language } from '../i18n';

export type SortDirection = 'ascending' | 'descending';
export type SortValue = string | number | boolean | null | undefined;
export type SortColumns<T> = Record<string, (row: T) => SortValue>;

export function useTableSort<T>(
  rows: ComputedRef<T[]>,
  columns: ComputedRef<SortColumns<T>>,
  initialKey: string,
  initialDirection: SortDirection = 'ascending',
) {
  const sortKey = ref(initialKey);
  const direction = ref<SortDirection>(initialDirection);
  const collator = computed(
    () => new Intl.Collator(language.value, { numeric: true, sensitivity: 'base' }),
  );
  const sortedRows = computed(() => {
    const selector = columns.value[sortKey.value];
    let sorted: T[];
    if (selector) {
      const values = rows.value.map((row, index) => ({ row, index, value: selector(row) }));
      values.sort((left, right) => {
        const a = left.value;
        const b = right.value;
        const missingA =
          a === null ||
          a === undefined ||
          a === '' ||
          (typeof a === 'number' && !Number.isFinite(a));
        const missingB =
          b === null ||
          b === undefined ||
          b === '' ||
          (typeof b === 'number' && !Number.isFinite(b));
        let comparison = 0;
        if (missingA !== missingB) {
          comparison = missingA ? 1 : -1;
        } else if (!missingA && !missingB) {
          const numeric =
            (typeof a === 'number' || typeof a === 'boolean') &&
            (typeof b === 'number' || typeof b === 'boolean');
          comparison = numeric
            ? Number(a) - Number(b)
            : collator.value.compare(String(a), String(b));
          comparison *= direction.value === 'ascending' ? 1 : -1;
        }
        return comparison || left.index - right.index;
      });
      sorted = values.map((value) => value.row);
    } else {
      sorted = [...rows.value];
    }
    return sorted;
  });
  function changeSort(key: string) {
    if (Object.hasOwn(columns.value, key)) {
      direction.value =
        sortKey.value === key && direction.value === 'ascending' ? 'descending' : 'ascending';
      sortKey.value = key;
    }
  }
  function sortState(key: string): SortDirection | 'none' {
    return key === sortKey.value ? direction.value : 'none';
  }
  return { sortedRows, sortKey, direction, changeSort, sortState };
}
