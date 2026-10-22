<script setup lang="ts">
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
    ? 'Crie uma nova senha'
    : mode.value === 'register'
      ? 'Comece seu novo espaço'
      : mode.value === 'forgot'
        ? 'Recupere seu acesso'
        : 'Bom ter você de volta.',
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
    error.value = failure instanceof Error ? failure.message : 'Não foi possível conectar.';
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
        <span class="eyebrow">MAIS CLAREZA, MAIS TRANQUILIDADE</span>
        <h1>Um espaço para<br />seu próximo<br /><em>passo.</em></h1>
        <p>Seu mês, seus planos e cada detalhe das suas finanças. Tudo conectado em um só lugar.</p>
        <div class="auth-features">
          <span><Wallet :size="18" /> Controle que acompanha você</span
          ><span><ChartNoAxesCombined :size="18" /> Uma visão clara do que vem pela frente</span
          ><span><ShieldCheck :size="18" /> Seus dados salvos na sua conta</span>
        </div>
      </div>
      <small>Finance Space · Finanças com perspectiva.</small>
    </section>
    <section class="auth-form-section">
      <form class="auth-form" @submit.prevent="submit">
        <span class="eyebrow">SEU ESPAÇO FINANCEIRO</span>
        <h2>{{ title }}</h2>
        <p>
          {{
            mode === 'register'
              ? 'Crie sua conta para começar a organizar suas finanças.'
              : mode === 'forgot'
                ? 'Enviaremos um link para redefinir sua senha.'
                : 'Entre na sua conta e veja como está seu mês.'
          }}
        </p>
        <div v-if="error" role="alert" class="notice error">{{ error }}</div>
        <div v-if="notice" role="status" class="notice success">{{ notice }}</div>
        <label v-if="mode === 'register' && !isReset"
          >Seu nome<input
            v-model="name"
            required
            minlength="2"
            maxlength="80"
            autocomplete="name"
            placeholder="Como podemos chamar você?" /></label
        ><label v-if="!isReset"
          >E-mail<input
            v-model="email"
            required
            type="email"
            autocomplete="email"
            placeholder="voce@exemplo.com" /></label
        ><label v-if="mode !== 'forgot' || isReset"
          >Senha<input
            v-model="password"
            required
            type="password"
            :minlength="mode === 'register' || isReset ? 10 : 1"
            maxlength="128"
            :autocomplete="mode === 'login' && !isReset ? 'current-password' : 'new-password'"
            :placeholder="mode === 'register' ? 'Pelo menos 10 caracteres' : 'Sua senha'" /></label
        ><button
          v-if="mode === 'login' && !isReset"
          class="text-button forgot-link"
          type="button"
          @click="
            mode = 'forgot';
            error = '';
          "
        >
          Esqueci minha senha</button
        ><button class="button primary auth-submit" :disabled="busy">
          {{
            busy
              ? 'Aguarde…'
              : isReset
                ? 'Salvar nova senha'
                : mode === 'register'
                  ? 'Criar minha conta'
                  : mode === 'forgot'
                    ? 'Enviar instruções'
                    : 'Entrar na minha conta'
          }}<ArrowRight :size="18" />
        </button>
        <p v-if="!isReset" class="auth-switch">
          {{ mode === 'login' ? 'Ainda não tem uma conta?' : 'Já tem uma conta?' }}
          <button
            class="text-button"
            type="button"
            @click="
              mode = mode === 'login' ? 'register' : 'login';
              error = '';
              notice = '';
            "
          >
            {{ mode === 'login' ? 'Criar conta' : 'Entrar' }}
          </button>
        </p>
        <p class="auth-footnote">
          <ShieldCheck :size="15" /> Suas finanças ficam vinculadas à sua conta.
        </p>
      </form>
    </section>
  </div>
</template>
