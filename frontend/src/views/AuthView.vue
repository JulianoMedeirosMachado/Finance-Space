<script setup lang="ts">
import { t, language } from '../i18n';

import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ArrowRight, ShieldCheck, Wallet, ChartNoAxesCombined } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import { api } from '../services/api';
const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const mode = ref<'login' | 'register' | 'forgot'>('login');
const isReset = computed(() => route.path === '/reset-password');
const name = ref('');
const email = ref('');
const password = ref('');
const error = ref('');
const notice = ref('');
const busy = ref(false);
const title = computed(() =>
  isReset.value
    ? t('Crie uma nova senha')
    : mode.value === 'register'
      ? t('Comece seu novo espaço')
      : mode.value === 'forgot'
        ? t('Recupere seu acesso')
        : t('Bom ter você de volta.'),
);
async function submit() {
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    if (isReset.value) {
      const result = await api<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: route.query.token, password: password.value }),
      });
      notice.value = result.message;
      auth.user = null;
      await router.push('/login');
    } else if (mode.value === 'forgot') {
      notice.value = (
        await api<{ message: string }>('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email: email.value }),
        })
      ).message;
    } else {
      await auth.authenticate(mode.value, {
        ...(mode.value === 'register' ? { name: name.value } : {}),
        email: email.value,
        password: password.value,
      });
      await router.push('/dashboard');
    }
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : t('Não foi possível conectar.');
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <div class="auth-page">
    <section class="auth-story">
      <div class="brand">
        <img src="../assets/logo-final-white.png" alt="" /><span
          >finance<span class="brand-accent">space</span></span
        >
      </div>
      <div>
        <span class="eyebrow">{{ t('MAIS CLAREZA, MAIS TRANQUILIDADE') }}</span>
        <h1>
          {{ t('Um espaço para') }}<br />{{ t('seu próximo') }}<br /><em>{{ t('passo.') }}</em>
        </h1>
        <p>
          {{
            t(
              'Seu mês, seus planos e cada detalhe das suas finanças. Tudo conectado em um só lugar.',
            )
          }}
        </p>
        <div class="auth-features">
          <span><Wallet :size="18" /> {{ t('Controle que acompanha você') }}</span
          ><span
            ><ChartNoAxesCombined :size="18" />
            {{ t('Uma visão clara do que vem pela frente') }}</span
          ><span><ShieldCheck :size="18" /> {{ t('Seus dados salvos na sua conta') }}</span>
        </div>
      </div>
      <small>{{ t('Finance Space · Finanças com perspectiva.') }}</small>
    </section>
    <section class="auth-form-section">
      <form class="auth-form" @submit.prevent="submit">
        <label class="auth-language"
          >{{ t('Idioma') }}
          <select v-model="language">
            <option value="pt-BR">Português (Brasil)</option>
            <option value="en-US">English</option>
          </select>
        </label>
        <span class="eyebrow">{{ t('SEU ESPAÇO FINANCEIRO') }}</span>
        <h2>{{ title }}</h2>
        <p>
          {{
            mode === 'register'
              ? t('Crie sua conta para começar a organizar suas finanças.')
              : mode === 'forgot'
                ? t('Enviaremos um link para redefinir sua senha.')
                : t('Entre na sua conta e veja como está seu mês.')
          }}
        </p>
        <div v-if="error" role="alert" class="notice error">{{ error }}</div>
        <div v-if="notice" role="status" class="notice success">{{ notice }}</div>
        <label v-if="mode === 'register' && !isReset"
          >{{ t('Seu nome')
          }}<input
            v-model="name"
            required
            minlength="2"
            maxlength="80"
            autocomplete="name"
            :placeholder="t('Como podemos chamar você?')" /></label
        ><label v-if="!isReset"
          >{{ t('E-mail')
          }}<input
            v-model="email"
            required
            type="email"
            autocomplete="email"
            :placeholder="t('voce@exemplo.com')" /></label
        ><label v-if="mode !== 'forgot' || isReset"
          >{{ t('Senha')
          }}<input
            v-model="password"
            required
            type="password"
            :minlength="mode === 'register' || isReset ? 10 : 1"
            maxlength="128"
            :autocomplete="mode === 'login' && !isReset ? 'current-password' : 'new-password'"
            :placeholder="
              mode === 'register' ? t('Pelo menos 10 caracteres') : t('Sua senha')
            " /></label
        ><button
          v-if="mode === 'login' && !isReset"
          class="text-button forgot-link"
          type="button"
          @click="
            mode = 'forgot';
            error = '';
          "
        >
          {{ t('Esqueci minha senha') }}</button
        ><button class="button primary auth-submit" :disabled="busy">
          {{
            busy
              ? t('Aguarde…')
              : isReset
                ? t('Salvar nova senha')
                : mode === 'register'
                  ? t('Criar minha conta')
                  : mode === 'forgot'
                    ? t('Enviar instruções')
                    : t('Entrar na minha conta')
          }}<ArrowRight :size="18" />
        </button>
        <p v-if="!isReset" class="auth-switch">
          {{ mode === 'login' ? t('Ainda não tem uma conta?') : t('Já tem uma conta?') }}
          <button
            class="text-button"
            type="button"
            @click="
              mode = mode === 'login' ? 'register' : 'login';
              error = '';
              notice = '';
            "
          >
            {{ mode === 'login' ? t('Criar conta') : t('Entrar') }}
          </button>
        </p>
        <p class="auth-footnote">
          <ShieldCheck :size="15" /> {{ t('Suas finanças ficam vinculadas à sua conta.') }}
        </p>
      </form>
    </section>
  </div>
</template>
