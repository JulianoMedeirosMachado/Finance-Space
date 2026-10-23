<script setup lang="ts">
import { t, language } from '../i18n';

import { Tags, Users, History, Download, ShieldCheck, ChevronRight } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { computed, ref } from 'vue';
import type { Language } from '../i18n';
const auth = useAuthStore();
const busy = ref(false);
const error = ref('');
const saved = ref(false);
async function changeLanguage(event: Event) {
  busy.value = true;
  error.value = '';
  saved.value = false;
  try {
    await auth.updateLanguage((event.target as HTMLSelectElement).value as Language);
    saved.value = true;
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : t('Não foi possível salvar.');
    (event.target as HTMLSelectElement).value = language.value;
  } finally {
    busy.value = false;
  }
}
const settings = computed(() => [
  {
    to: '/categories',
    title: t('Categorias'),
    description: t('Organize despesas e receitas do seu jeito.'),
    icon: Tags,
  },
  {
    to: '/people',
    title: t('Responsáveis'),
    description: t('Cadastre você e as pessoas dos seus acertos.'),
    icon: Users,
  },
  {
    to: '/history',
    title: t('Histórico financeiro'),
    description: t('Consulte os registros originais importados.'),
    icon: History,
  },
]);
</script>
<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">{{ t('DO SEU JEITO') }}</span>
      <h1>{{ t('Configurações') }}</h1>
      <p>{{ t('Organize os detalhes do seu espaço financeiro.') }}</p>
    </div>
  </div>
  <section class="panel account-panel">
    <span class="avatar large">{{ auth.user?.name.slice(0, 1).toUpperCase() }}</span>
    <div>
      <h2>{{ auth.user?.name }}</h2>
      <p>{{ auth.user?.email }}</p>
    </div>
    <span class="badge paid"><ShieldCheck :size="14" />{{ t('Conta pessoal') }}</span>
  </section>
  <section class="panel language-panel">
    <div>
      <h2>{{ t('Idioma da conta') }}</h2>
      <p>{{ t('A preferência é salva na sua conta e aplicada nos próximos acessos.') }}</p>
    </div>
    <label
      >{{ t('Idioma') }}
      <select :value="language" :disabled="busy" @change="changeLanguage">
        <option value="pt-BR">Português (Brasil)</option>
        <option value="en-US">English</option>
      </select>
    </label>
    <p v-if="error" role="alert" class="notice error">{{ error }}</p>
    <p v-if="saved" role="status" class="notice success">{{ t('Idioma atualizado.') }}</p>
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
      <h2>{{ t('Uma cópia dos seus dados') }}</h2>
      <p>
        {{
          t(
            'Exporte todos os registros da sua conta em JSON. Nas telas de cadastros, você também pode exportar as listas em CSV.',
          )
        }}
      </p>
    </div>
    <a class="button secondary" href="/api/finance/export" download>{{
      t('Exportar meus dados')
    }}</a>
  </section>
</template>
