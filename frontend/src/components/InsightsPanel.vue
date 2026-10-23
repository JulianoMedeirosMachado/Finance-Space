<script setup lang="ts">
import { computed } from 'vue';
import { Sparkles, Settings, RefreshCw } from 'lucide-vue-next';
import { t, language } from '../i18n';
import { dateLabel } from '../utils/format';
import type { InsightKind, InsightsOverview } from '../types/insights';

const props = defineProps<{
  overview: InsightsOverview;
  kind: InsightKind;
  selectedId?: string;
  busy?: boolean;
  waiting?: boolean;
  error?: string;
}>();
const emit = defineEmits<{ generate: []; refresh: []; select: [id: string] }>();
const currentPeriod = computed(() => props.overview.periods[props.kind]);
const selected = computed(() =>
  props.overview.reports.find((report) =>
    props.selectedId
      ? report.id === props.selectedId
      : report.kind === props.kind && report.period_start === currentPeriod.value.start,
  ),
);
const history = computed(() =>
  props.overview.reports.filter((report) => report.kind === props.kind && report.state === 'ready'),
);
const timestamp = (value: string) => new Date(value).toLocaleString(language.value);
</script>

<template>
  <section v-if="!overview.enabled" class="panel insight-state">
    <Settings :size="26" />
    <h2>{{ t('Seus insights estão desabilitados') }}</h2>
    <p>
      {{
        t(
          'Ative a análise financeira na Integração IA para receber resumos semanais e mensais. Seus relatórios anteriores continuam disponíveis.',
        )
      }}
    </p>
    <RouterLink to="/integrations" class="button primary">{{
      t('Configurar integração')
    }}</RouterLink>
  </section>
  <section v-else-if="!overview.ready" class="panel insight-state">
    <h2>{{ t('Vamos configurar sua IA') }}</h2>
    <p>
      {{
        t(
          'Confira sua chave e a configuração do servidor na Integração IA para gerar novos insights.',
        )
      }}
    </p>
    <RouterLink to="/integrations" class="button primary">{{
      t('Configurar integração')
    }}</RouterLink>
  </section>
  <p v-if="error" class="notice error" role="alert">{{ error }}</p>
  <section class="panel insight-period" :aria-busy="busy || waiting">
    <div>
      <h2>{{ selectedId ? t('Relatório do histórico') : t('Último período completo') }}</h2>
      <p>
        {{ dateLabel(selected?.period_start || currentPeriod.start) }} —
        {{ dateLabel(selected?.period_end || currentPeriod.end) }}
      </p>
    </div>
    <div
      v-if="overview.enabled && overview.ready && !selectedId && selected?.state !== 'ready'"
      class="integration-actions"
    >
      <button class="button secondary" :disabled="busy || waiting" @click="emit('generate')">
        <Sparkles :size="17" />{{
          selected?.state === 'failed' ? t('Tentar novamente') : t('Gerar análise')
        }}
      </button>
      <button class="button secondary" :disabled="busy" @click="emit('refresh')">
        <RefreshCw :size="17" />{{ t('Atualizar') }}
      </button>
    </div>
    <p v-if="waiting" role="status" class="field-hint">
      {{ t('Aguardando o intervalo entre análises para proteger seu consumo...') }}
    </p>
    <p v-else-if="busy || selected?.state === 'generating'" role="status" class="field-hint">
      {{
        t('Sua IA está analisando os resumos. Isso pode levar um minuto. Você pode voltar depois.')
      }}
    </p>
    <p v-else-if="selected?.state === 'failed'" class="field-hint">
      {{
        t(
          'Esta análise não foi concluída. Confira sua configuração e tente novamente quando quiser. A tentativa pode ter consumido créditos.',
        )
      }}
    </p>
    <p v-else-if="!selected" class="field-hint">
      {{ t('Ainda não há análise salva para este período.') }}
    </p>
  </section>
  <article v-if="selected?.state === 'ready' && selected.report" class="panel insight-report">
    <span class="eyebrow">{{ t('ANÁLISE FINANCEIRA') }}</span>
    <h2>{{ selected.report.title }}</h2>
    <p class="insight-prose">{{ selected.report.summary }}</p>
    <div class="insight-findings">
      <section v-for="(finding, index) in selected.report.findings" :key="index">
        <h3>{{ finding.title }}</h3>
        <p class="insight-prose">{{ finding.detail }}</p>
        <p v-if="finding.suggestion" class="insight-prose">
          <strong>{{ t('Sugestão') }}:</strong> {{ finding.suggestion }}
        </p>
      </section>
    </div>
    <footer class="field-hint">
      <p v-if="selected.generated_at">
        {{ t('Gerado em') }}: {{ timestamp(selected.generated_at) }}
      </p>
      <p>
        {{ t('Modelo') }}: {{ selected.model }} · {{ t('Idioma do relatório') }}:
        {{ selected.language === 'en-US' ? 'English' : 'Português (Brasil)' }}
      </p>
      <p>
        {{
          t(
            'Esta análise usa os dados registrados e pode conter erros ou lacunas. Não altera seus lançamentos e não substitui orientação financeira profissional.',
          )
        }}
      </p>
    </footer>
  </article>
  <section v-if="history.length" class="panel insight-history">
    <h2>{{ t('Histórico de análises') }}</h2>
    <p class="field-hint">
      {{
        t(
          'Relatórios salvos não são gerados novamente ao abrir. O texto mantém o idioma utilizado na geração.',
        )
      }}
    </p>
    <div class="integration-actions">
      <button class="button secondary" @click="emit('select', '')">
        {{ t('Ver período mais recente') }}
      </button>
      <button
        v-for="report in history"
        :key="report.id"
        class="button secondary"
        :aria-pressed="selected?.id === report.id"
        @click="emit('select', report.id)"
      >
        {{ dateLabel(report.period_start) }} — {{ dateLabel(report.period_end) }}
      </button>
    </div>
  </section>
</template>
