import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api, ApiError } from '../services/api';
import { language, setLanguage, type Language } from '../i18n';

interface User {
  id: string;
  name: string;
  email: string;
  language: Language;
}
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const ready = ref(false);
  async function initialize() {
    try {
      user.value = await api<User>('/auth/me');
      setLanguage(user.value.language);
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
  }
  async function updateLanguage(language: Language) {
    user.value = await api<User>('/auth/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ language }),
    });
    setLanguage(user.value.language);
  }
  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    user.value = null;
    setLanguage('pt-BR');
  }
  return { user, ready, initialize, authenticate, updateLanguage, logout };
});
