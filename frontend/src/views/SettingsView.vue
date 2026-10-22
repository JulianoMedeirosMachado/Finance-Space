<script setup lang="ts">
import { Tags, Users, History, Download, Upload, ShieldCheck, ChevronRight } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
const auth = useAuthStore();
const settings = [
  {
    to: '/categories',
    title: 'Categorias',
    description: 'Organize despesas e receitas do seu jeito.',
    icon: Tags,
  },
  {
    to: '/people',
    title: 'Responsáveis',
    description: 'Cadastre você e as pessoas dos seus acertos.',
    icon: Users,
  },
  {
    to: '/history',
    title: 'Histórico da planilha',
    description: 'Consulte os registros originais importados.',
    icon: History,
  },
  {
    to: '/imports',
    title: 'Importações',
    description: 'Traga sua planilha e confira os dados.',
    icon: Upload,
  },
];
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">DO SEU JEITO</span>
      <h1>Configurações</h1>
      <p>Organize os detalhes do seu espaço financeiro.</p>
    </div>
  </div>
  <section class="panel account-panel">
    <span class="avatar large">{{ auth.user?.name.slice(0, 1).toUpperCase() }}</span>
    <div>
      <h2>{{ auth.user?.name }}</h2>
      <p>{{ auth.user?.email }}</p>
    </div>
    <span class="badge paid"><ShieldCheck :size="14" />Conta pessoal</span>
  </section>
  <div class="settings-grid">
    <RouterLink v-for="item in settings" :key="item.to" :to="item.to" class="panel settings-link"
      ><span class="settings-icon"><component :is="item.icon" :size="23" /></span>
      <div>
        <h2>{{ item.title }}</h2>
        <p>{{ item.description }}</p>
      </div>
      <ChevronRight :size="19"
    /></RouterLink>
  </div>
  <section class="panel export-panel">
    <Download :size="24" />
    <div>
      <h2>Uma cópia dos seus dados</h2>
      <p>
        Exporte todos os registros da sua conta em JSON. Nas telas de cadastros, você também pode
        exportar as listas em CSV.
      </p>
    </div>
    <a class="button secondary" href="/api/finance/export" download>Exportar meus dados</a>
  </section>
</template>
