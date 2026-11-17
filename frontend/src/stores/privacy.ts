import { defineStore } from 'pinia';
import { ref } from 'vue';
import { money } from '../utils/format';
import { currencySymbol } from '../utils/currency';

export const usePrivacyStore = defineStore('privacy', () => {
  const hidden = ref(true);
  function toggle() {
    hidden.value = !hidden.value;
  }
  function hide() {
    hidden.value = true;
  }
  function formatAmount(value: unknown) {
    return hidden.value ? `${currencySymbol.value} ••••` : money(value);
  }
  return { hidden, toggle, hide, formatAmount };
});
