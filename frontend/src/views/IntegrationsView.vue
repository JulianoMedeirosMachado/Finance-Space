<script setup lang="ts">
import { ArrowLeft } from 'lucide-vue-next';
import IntegrationSettings from '../components/IntegrationSettings.vue';
import { t } from '../i18n';
</script>

<template>
  <div class="page-heading">
    <div>
      <span class="eyebrow">{{ t('DO SEU JEITO') }}</span>
      <h1>{{ t('Integração IA') }}</h1>
      <p>{{ t('Configure sua inteligência artificial e conecte o Telegram.') }}</p>
    </div>
    <RouterLink to="/settings" class="button secondary">
      <ArrowLeft :size="18" />{{ t('Voltar às configurações') }}
    </RouterLink>
  </div>
  <IntegrationSettings />
</template>
