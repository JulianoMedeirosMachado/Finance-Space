import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api, ApiError } from '../services/api';

interface User {
  id: string;
  name: string;
  email: string;
}
export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const ready = ref(false);
  async function initialize() {
    try {
      user.value = await api<User>('/auth/me');
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
    user.value = await api<User>(`/auth/${mode}`, { method: 'POST', body: JSON.stringify(input) });
  }
  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    user.value = null;
  }
  return { user, ready, initialize, authenticate, logout };
});
