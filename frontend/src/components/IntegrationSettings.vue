<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Bot, KeyRound } from 'lucide-vue-next';
import { api } from '../services/api';
import { t } from '../i18n';

interface IntegrationStatus {
  aiAvailable: boolean;
  telegramAvailable: boolean;
  provider: 'deepseek' | 'openrouter';
  model: string;
  hasKey: boolean;
  insightsEnabled: boolean;
  telegram: { id: string; name: string } | null;
  candidate: { id: string; name: string } | null;
}
const status = ref<IntegrationStatus | null>(null);
const provider = ref<'deepseek' | 'openrouter'>('deepseek');
const model = ref('');
const apiKey = ref('');
const consent = ref(false);
const busy = ref(false);
const error = ref('');
const notice = ref('');
const link = ref('');

async function run(operation: () => Promise<void>) {
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    await operation();
  } catch (failure) {
    error.value =
      failure instanceof Error ? failure.message : t('Não foi possível concluir a operação.');
  } finally {
    busy.value = false;
  }
}

async function refresh() {
  status.value = await api<IntegrationStatus>('/integrations');
}

onMounted(() =>
  run(async () => {
    await refresh();
    provider.value = status.value!.provider;
    model.value = status.value!.model;
  }),
);

async function saveAi() {
  await run(async () => {
    status.value = await api<IntegrationStatus>('/integrations/ai', {
      method: 'PUT',
      body: JSON.stringify({
        provider: provider.value,
        model: model.value,
        consent: consent.value,
        ...(apiKey.value ? { apiKey: apiKey.value } : {}),
      }),
    });
    apiKey.value = '';
    notice.value = t('Configuração da IA salva.');
  });
}

async function testAi() {
  await run(async () => {
    await api('/integrations/ai/test', { method: 'POST' });
    notice.value = t('Conexão com a IA validada.');
  });
}

async function removeAi() {
  await run(async () => {
    status.value = await api<IntegrationStatus>('/integrations/ai', { method: 'DELETE' });
    apiKey.value = '';
    model.value = '';
    consent.value = false;
    notice.value = t('Chave removida. Os rascunhos pendentes foram cancelados.');
  });
}

async function connectTelegram() {
  await run(async () => {
    const result = await api<{ url: string }>('/integrations/telegram/link', { method: 'POST' });
    link.value = result.url;
    await refresh();
  });
}

async function confirmTelegram() {
  await run(async () => {
    status.value = await api<IntegrationStatus>('/integrations/telegram/confirm', {
      method: 'POST',
      body: JSON.stringify({ candidateId: status.value?.candidate?.id }),
    });
    link.value = '';
    notice.value = t('Telegram conectado. Envie uma despesa para começar.');
  });
}

async function disconnectTelegram() {
  await run(async () => {
    status.value = await api<IntegrationStatus>('/integrations/telegram', { method: 'DELETE' });
    link.value = '';
    notice.value = t('Telegram desconectado.');
  });
}

async function changeInsights(event: Event) {
  const checkbox = event.target as HTMLInputElement;
  const previous = status.value!.insightsEnabled;
  await run(async () => {
    status.value = await api<IntegrationStatus>('/integrations/insights', {
      method: 'PATCH',
      body: JSON.stringify({ enabled: checkbox.checked }),
    });
    notice.value = t('Preferência dos insights atualizada.');
  });
  checkbox.checked = status.value?.insightsEnabled ?? previous;
}
</script>

<template>
  <section class="panel integration-panel" :aria-label="t('Integrações')" :aria-busy="busy">
    <h2><Bot :size="22" /> {{ t('Integrações') }}</h2>
    <p>
      {{
        t(
          'Sua IA, sua conta. Use o bot central para preparar lançamentos e confirme antes de cadastrar.',
        )
      }}
    </p>
    <p v-if="error" class="notice error" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice success" role="status">{{ notice }}</p>
    <p v-if="!status">{{ t('Carregando integrações...') }}</p>
    <template v-else>
      <form class="integration-form" @submit.prevent="saveAi">
        <h3><KeyRound :size="18" /> {{ t('Inteligência artificial') }}</h3>
        <p v-if="!status.aiAvailable" class="notice">
          {{
            t('O administrador precisa configurar a criptografia no servidor para habilitar a IA.')
          }}
        </p>
        <fieldset :disabled="busy">
          <div class="form-grid">
            <label
              >{{ t('Provedor') }}
              <select v-model="provider" @change="apiKey = ''">
                <option value="deepseek">DeepSeek</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </label>
            <label
              >{{ t('Identificador do modelo')
              }}<input
                v-model="model"
                required
                maxlength="150"
                autocomplete="off"
                :placeholder="t('Copie o identificador do painel do provedor')"
            /></label>
            <label class="full-width"
              >{{ t('Chave de API') }}
              <input
                v-model="apiKey"
                name="ai-api-key"
                type="password"
                autocomplete="new-password"
                :spellcheck="false"
                maxlength="512"
                :required="!status.hasKey || status.provider !== provider"
                :placeholder="
                  status.hasKey && status.provider === provider
                    ? t('Chave salva — deixe vazio para manter')
                    : t('Cole sua chave aqui')
                "
              />
            </label>
          </div>
          <p class="field-hint">
            {{
              t(
                'A chave não é exibida novamente. Cada usuário paga o consumo no próprio provedor. Testar a conexão também pode consumir créditos.',
              )
            }}
          </p>
          <label class="integration-consent"
            ><input v-model="consent" type="checkbox" required />{{
              t(
                'Autorizo enviar minhas mensagens e os nomes das minhas contas, cartões e categorias ao provedor de IA selecionado. As mensagens também passam pelo Telegram.',
              )
            }}</label
          >
          <div class="integration-actions">
            <button class="button primary" type="submit" :disabled="!status.aiAvailable">
              {{ t('Salvar configuração da IA') }}
            </button>
            <button
              class="button secondary"
              type="button"
              :disabled="!status.hasKey || !status.aiAvailable"
              @click="testAi"
            >
              {{ t('Testar configuração salva') }}
            </button>
            <button
              class="button secondary"
              type="button"
              :disabled="!status.hasKey"
              @click="removeAi"
            >
              {{ t('Remover chave') }}
            </button>
          </div>
        </fieldset>
      </form>
      <div class="integration-telegram">
        <h3>{{ t('Insights da IA') }}</h3>
        <label class="integration-consent">
          <input
            type="checkbox"
            :checked="status.insightsEnabled"
            :disabled="busy || (!status.insightsEnabled && (!status.hasKey || !status.aiAvailable))"
            @change="changeInsights"
          />
          {{ t('Permitir análise financeira para insights semanais e mensais.') }}
        </label>
        <p class="field-hint">
          {{
            t(
              'Compartilhamos totais, comparações, saldo registrado, previsões e progresso das metas. Categorias e metas usam códigos; não enviamos nomes, descrições de compras, observações, dados de login ou o histórico individual.',
            )
          }}
        </p>
        <p class="field-hint">
          {{
            t(
              'A análise usa sua chave e pode consumir créditos. É gerada ao abrir cada seção para um novo período fechado, sem agendamento nem envio automático ao Telegram. Desativar impede novas análises e preserva o histórico.',
            )
          }}
        </p>
        <p v-if="!status.hasKey" class="field-hint">
          {{ t('Salve uma chave de IA para habilitar os insights.') }}
        </p>
        <RouterLink to="/insights" class="button secondary">{{
          t('Abrir insights da IA')
        }}</RouterLink>
      </div>
      <div class="integration-telegram">
        <h3>Telegram</h3>
        <p class="field-hint">
          {{
            t(
              'Para despesas de outra pessoa, cite um responsável cadastrado: nome, item, valor e conta/cartão. Ele aparece na prévia e entra nos acertos, sem marcar reembolso como recebido. Só enviamos à IA referências aos nomes citados, não a lista completa de responsáveis nem seus saldos.',
            )
          }}
        </p>
        <p v-if="!status.telegramAvailable" class="notice">
          {{ t('O administrador precisa configurar o bot central no servidor.') }}
        </p>
        <template v-else>
          <p v-if="status.telegram">
            {{ t('Conectado a') }}: {{ status.telegram.name }} ({{ status.telegram.id }})
          </p>
          <div v-else>
            <p>
              {{
                t(
                  'Este link é pessoal: não compartilhe. A confirmação identifica uma conta do Telegram, não um dispositivo. Outras pessoas que apenas iniciam o bot não aparecem aqui.',
                )
              }}
            </p>
            <p>
              {{
                t(
                  'Gere um link, abra o bot, toque em Iniciar e volte aqui para atualizar e confirmar sua identidade. O link expira em 10 minutos.',
                )
              }}
            </p>
            <div class="integration-actions">
              <button class="button secondary" :disabled="busy" @click="connectTelegram">
                {{ t('Gerar link de conexão') }}
              </button>
              <a
                v-if="link"
                class="button primary"
                :href="link"
                target="_blank"
                rel="noopener noreferrer"
                referrerpolicy="no-referrer"
                >{{ t('Abrir bot no Telegram') }}</a
              >
              <button class="button secondary" :disabled="busy" @click="run(refresh)">
                {{ t('Atualizar vínculo') }}
              </button>
            </div>
            <div v-if="status.candidate" class="notice">
              <p>
                {{ t('Confirme somente se esta é sua conta do Telegram:') }}
                {{ status.candidate.name }} ({{ status.candidate.id }})
              </p>
              <button class="button primary" :disabled="busy" @click="confirmTelegram">
                {{ t('Confirmar minha conta do Telegram') }}
              </button>
            </div>
          </div>
          <button class="button secondary" :disabled="busy" @click="disconnectTelegram">
            {{ status.telegram ? t('Desconectar Telegram') : t('Cancelar vínculo pendente') }}
          </button>
          <p class="field-hint">
            {{
              t(
                'Envie despesas, parcelamentos, assinaturas mensais ou receitas por texto. Ex.: "Streaming 30 recorrente no cartão ML, dia 10" ou "20 reais pela venda, receita na conta Corrente". Receitas precisam de conta, não cartão. Recorrências criam previsões mensais, sem marcar pagamento ou recebimento. Confira o tipo na prévia. Para corrigir, cancele e reenvie a mensagem completa. Sem áudios, fotos, transferências ou reembolsos.',
              )
            }}
          </p>
          <p class="field-hint">
            {{
              t(
                'Confira data e competência antes de confirmar. Sem indicação, usamos hoje em São Paulo e a competência da compra, não o vencimento do cartão. O bot pode demorar enquanto o servidor acorda.',
              )
            }}
          </p>
        </template>
      </div>
    </template>
  </section>
</template>
