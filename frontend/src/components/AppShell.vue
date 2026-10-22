<script setup lang="ts">
import { ref, watch } from 'vue';
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
  Upload,
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
} from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { useFinanceStore } from '../stores/finance';
const auth = useAuthStore();
const finance = useFinanceStore();
const route = useRoute();
const router = useRouter();
const mobileOpen = ref(false);
const dark = ref(localStorage.getItem('finance-theme') !== 'light');
const links = [
  { path: '/dashboard', label: 'Visão geral', icon: LayoutDashboard },
  { path: '/month', label: 'Meu mês', icon: CalendarDays },
  { path: '/transactions', label: 'Lançamentos', icon: ArrowLeftRight },
  { path: '/recurring', label: 'Recorrentes', icon: Repeat2 },
  { path: '/installments', label: 'Parcelamentos', icon: Layers },
  { path: '/income', label: 'Receitas', icon: Wallet },
  { path: '/cards', label: 'Cartões', icon: CreditCard },
  { path: '/invoices', label: 'Faturas', icon: FileText },
  { path: '/accounts', label: 'Contas bancárias', icon: Landmark },
  { path: '/benefits', label: 'Vale-alimentação', icon: Utensils },
  { path: '/settlements', label: 'Acertos', icon: Users },
  { path: '/reports', label: 'Relatórios', icon: ChartNoAxesCombined },
];
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
    finance.error = error instanceof Error ? error.message : 'Não foi possível sair.';
  }
}
</script>

<template>
  <template v-if="auth.user && !route.meta.public">
    <button
      v-if="mobileOpen"
      class="sidebar-backdrop"
      aria-label="Fechar menu"
      @click="mobileOpen = false"
    />
    <aside class="sidebar" :class="{ open: mobileOpen }">
      <RouterLink class="brand" to="/dashboard"
        ><img src="../assets/logo-final-white.png" alt="Finance Space" /><span
          >finance<span class="brand-accent">space</span
          ><small>Seu dinheiro. Seu espaço.</small></span
        ></RouterLink
      >
      <p class="nav-heading">SEU ESPAÇO</p>
      <nav aria-label="Navegação principal">
        <RouterLink v-for="link in links" :key="link.path" :to="link.path"
          ><component :is="link.icon" :size="18" /><span>{{ link.label }}</span></RouterLink
        >
      </nav>
      <div class="sidebar-bottom">
        <RouterLink to="/imports"><Upload :size="18" /> Importar planilha</RouterLink
        ><RouterLink to="/settings"><Settings :size="18" /> Configurações</RouterLink>
        <div class="profile">
          <span class="avatar">{{ auth.user.name.slice(0, 1).toUpperCase() }}</span
          ><span class="profile-name">{{ auth.user.name }}<small>Minha conta pessoal</small></span
          ><button class="icon-button" title="Sair" aria-label="Sair da conta" @click="logout">
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
            aria-label="Abrir menu"
            @click="mobileOpen = true"
          >
            <Menu :size="22" /></button
          ><span
            >Finance Space
            <span class="breadcrumb"
              >/
              {{
                links.find((link) => link.path === route.path)?.label ||
                (route.path === '/imports' ? 'Importação' : 'Configurações')
              }}</span
            ></span
          >
        </div>
        <div class="topbar-actions">
          <div class="month-picker">
            <button class="icon-button" aria-label="Mês anterior" @click="changeMonth(-1)">
              <ChevronLeft :size="17" /></button
            ><input v-model="finance.month" type="month" aria-label="Competência" /><button
              class="icon-button"
              aria-label="Próximo mês"
              @click="changeMonth(1)"
            >
              <ChevronRight :size="17" />
            </button>
          </div>
          <button
            class="icon-button theme-button"
            :aria-label="dark ? 'Ativar tema claro' : 'Ativar tema escuro'"
            @click="dark = !dark"
          >
            <Sun v-if="dark" :size="20" /><Moon v-else :size="20" />
          </button>
        </div>
      </header>
      <main class="main-content">
        <div v-if="finance.error" role="alert" class="notice error">
          {{ finance.error
          }}<button class="text-button" @click="finance.refresh">Tentar novamente</button>
        </div>
        <div v-if="finance.message" role="status" class="notice success">
          {{ finance.message
          }}<button class="icon-button" aria-label="Fechar aviso" @click="finance.message = ''">
            <X :size="16" />
          </button>
        </div>
        <div
          v-if="finance.loading"
          class="loading-line"
          role="status"
          aria-label="Carregando dados"
        />
        <RouterView :key="route.path" />
      </main>
    </div>
  </template>
  <RouterView v-else />
</template>
