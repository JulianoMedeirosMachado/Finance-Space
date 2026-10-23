import { defineStore } from 'pinia';
import { ref } from 'vue';
import { money } from '../utils/format';

export const usePrivacyStore = defineStore('privacy', () => {
  const hidden = ref(true);
  function toggle() {
    hidden.value = !hidden.value;
  }
  function hide() {
    hidden.value = true;
  }
  function formatAmount(value: unknown) {
    return hidden.value ? 'R$ ••••' : money(value);
  }
  return { hidden, toggle, hide, formatAmount };
});
