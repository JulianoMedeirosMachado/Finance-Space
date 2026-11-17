import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api, ApiError } from '../services/api';
import { language, setLanguage, type Language } from '../i18n';
import { setCurrency, type Currency } from '../utils/currency';

interface User {
  id: string;
  name: string;
  email: string;
  language: Language;
  currency: Currency;
}
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const ready = ref(false);
  async function initialize() {
    try {
      user.value = await api<User>('/auth/me');
      setLanguage(user.value.language);
      setCurrency(user.value.currency);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) {
        throw error;
      }
    } finally {
      ready.value = true;
    }
  }
  async function authenticate(
    mode: 'login' | 'register',
    input: { name?: string; email: string; password: string },
  ) {
    user.value = await api<User>(`/auth/${mode}`, {
      method: 'POST',
      body: JSON.stringify(mode === 'register' ? { ...input, language: language.value } : input),
    });
    setLanguage(user.value.language);
    setCurrency(user.value.currency);
  }
  async function updateLanguage(language: Language) {
    user.value = await api<User>('/auth/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ language }),
    });
    setLanguage(user.value.language);
    setCurrency(user.value.currency);
  }
  async function updateCurrency(currency: Currency) {
    user.value = await api<User>('/auth/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ currency }),
    });
    setCurrency(user.value.currency);
  }
  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    user.value = null;
    setCurrency('BRL');
    setLanguage('pt-BR');
  }
  return { user, ready, initialize, authenticate, updateLanguage, updateCurrency, logout };
});
