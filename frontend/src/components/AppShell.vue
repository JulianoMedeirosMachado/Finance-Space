<script setup lang="ts">
import { t } from '../i18n';

import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import {
  LayoutDashboard,
  CalendarDays,
  ArrowLeftRight,
  Repeat2,
  Layers,
  CreditCard,
  Landmark,
  Wallet,
  Utensils,
  Users,
  Target,
  ChartNoAxesCombined,
  Settings,
  Sun,
  Moon,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
  Sparkles,
  RefreshCw,
} from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useFinanceStore } from '../stores/finance';
import { usePrivacyStore } from '../stores/privacy';
const auth = useAuthStore();
const finance = useFinanceStore();
const privacy = usePrivacyStore();
const route = useRoute();
const router = useRouter();
const mobileOpen = ref(false);
const dark = ref(localStorage.getItem('finance-theme') !== 'light');
let lastExternalRefresh = 0;
function refreshAfterReturning() {
  if (
    document.visibilityState === 'visible' &&
    auth.user &&
    !finance.loading &&
    Date.now() - lastExternalRefresh > 5000
  ) {
    lastExternalRefresh = Date.now();
    void finance.refresh();
  }
}
onMounted(() => {
  document.addEventListener('visibilitychange', refreshAfterReturning);
  window.addEventListener('focus', refreshAfterReturning);
});
onUnmounted(() => {
  document.removeEventListener('visibilitychange', refreshAfterReturning);
  window.removeEventListener('focus', refreshAfterReturning);
});
const links = computed(() => [
  { path: '/dashboard', label: t('Visão geral'), icon: LayoutDashboard },
  { path: '/month', label: t('Meu mês'), icon: CalendarDays },
  { path: '/transactions', label: t('Lançamentos'), icon: ArrowLeftRight },
  { path: '/recurring', label: t('Recorrentes'), icon: Repeat2 },
  { path: '/installments', label: t('Parcelamentos'), icon: Layers },
  { path: '/income', label: t('Receitas'), icon: Wallet },
  { path: '/cards', label: t('Cartões'), icon: CreditCard },
  { path: '/invoices', label: t('Faturas'), icon: FileText },
  { path: '/accounts', label: t('Contas bancárias'), icon: Landmark },
  { path: '/benefits', label: t('Vale-alimentação'), icon: Utensils },
  { path: '/settlements', label: t('Acertos'), icon: Users },
  { path: '/goals', label: t('Metas'), icon: Target },
  { path: '/reports', label: t('Relatórios'), icon: ChartNoAxesCombined },
  { path: '/insights', label: t('Insights da IA'), icon: Sparkles },
]);
watch(
  dark,
  (value) => {
    document.documentElement.dataset.theme = value ? 'dark' : 'light';
    localStorage.setItem('finance-theme', value ? 'dark' : 'light');
  },
  { immediate: true },
);
watch(
  () => auth.user?.id,
  async (id) => {
    finance.reset();
    privacy.hide();
    if (id) {
      await finance.refresh();
    }
  },
  { immediate: true },
);
watch(
  () => finance.month,
  () => {
    if (auth.user) {
      void finance.refresh();
    }
  },
);
watch(
  () => route.path,
  () => {
    mobileOpen.value = false;
    finance.message = '';
  },
);
function changeMonth(delta: number) {
  const [year, month] = finance.month.split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  finance.month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
async function logout() {
  try {
    await auth.logout();
    finance.reset();
    await router.push('/login');
  } catch (error) {
    finance.error = error instanceof Error ? error.message : t('Não foi possível sair.');
  }
}
</script>

<template>
  <template v-if="auth.user && !route.meta.public">
    <button
      v-if="mobileOpen"
      class="sidebar-backdrop"
      :aria-label="t('Fechar menu')"
      @click="mobileOpen = false"
    />
    <aside class="sidebar" :class="{ open: mobileOpen }">
      <RouterLink class="brand" to="/dashboard"
        ><img src="../assets/logo-final-white.png" alt="Finance Space" /><span
          >finance<span class="brand-accent">space</span
          ><small>{{ t('Seu dinheiro. Seu espaço.') }}</small></span
        ></RouterLink
      >
      <p class="nav-heading">{{ t('SEU ESPAÇO') }}</p>
      <nav :aria-label="t('Navegação principal')">
        <RouterLink v-for="link in links" :key="link.path" :to="link.path"
          ><component :is="link.icon" :size="18" /><span>{{ link.label }}</span></RouterLink
        >
      </nav>
      <div class="sidebar-bottom">
        <RouterLink to="/settings"><Settings :size="18" /> {{ t('Configurações') }}</RouterLink>
        <div class="profile">
          <span class="avatar">{{ auth.user.name.slice(0, 1).toUpperCase() }}</span
          ><span class="profile-name"
            >{{ auth.user.name }}<small>{{ t('Minha conta pessoal') }}</small></span
          ><button
            class="icon-button"
            :title="t('Sair')"
            :aria-label="t('Sair da conta')"
            @click="logout"
          >
            <LogOut :size="17" />
          </button>
        </div>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar">
        <div class="topbar-title">
          <button
            class="icon-button mobile-menu"
            :aria-label="t('Abrir menu')"
            @click="mobileOpen = true"
          >
            <Menu :size="22" /></button
          ><span
            >Finance Space
            <span class="breadcrumb"
              >/
              {{
                links.find((link) => link.path === route.path)?.label || t('Configurações')
              }}</span
            ></span
          >
        </div>
        <div class="topbar-actions">
          <div class="month-picker">
            <button class="icon-button" :aria-label="t('Mês anterior')" @click="changeMonth(-1)">
              <ChevronLeft :size="17" /></button
            ><input v-model="finance.month" type="month" :aria-label="t('Competência')" /><button
              class="icon-button"
              :aria-label="t('Próximo mês')"
              @click="changeMonth(1)"
            >
              <ChevronRight :size="17" />
            </button>
          </div>
          <button
            class="icon-button"
            :title="finance.loading ? t('Atualizando dados...') : t('Atualizar dados')"
            :aria-label="finance.loading ? t('Atualizando dados...') : t('Atualizar dados')"
            :aria-busy="finance.loading"
            :disabled="finance.loading"
            @click="finance.refresh()"
          >
            <RefreshCw :size="20" :class="{ 'refresh-spinning': finance.loading }" />
          </button>
          <button
            class="icon-button theme-button"
            :aria-label="dark ? t('Ativar tema claro') : t('Ativar tema escuro')"
            @click="dark = !dark"
          >
            <Sun v-if="dark" :size="20" /><Moon v-else :size="20" />
          </button>
        </div>
      </header>
      <main class="main-content">
        <div v-if="finance.error" role="alert" class="notice error">
          {{ t(finance.error)
          }}<button class="text-button" @click="finance.refresh">
            {{ t('Tentar novamente') }}
          </button>
        </div>
        <div v-if="finance.message" role="status" class="notice success">
          {{ t(finance.message)
          }}<button
            class="icon-button"
            :aria-label="t('Fechar aviso')"
            @click="finance.message = ''"
          >
            <X :size="16" />
          </button>
        </div>
        <div
          v-if="finance.loading"
          class="loading-line"
          role="status"
          :aria-label="t('Carregando dados')"
        />
        <RouterView :key="route.path" />
      </main>
    </div>
  </template>
  <RouterView v-else />
</template>
