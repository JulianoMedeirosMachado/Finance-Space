<script setup lang="ts">
import { money } from '../utils/format';
defineProps<{ label: string; value: number; detail?: string; tone?: string; masked?: boolean }>();
</script>
<template>
  <article class="stat-card" :class="tone">
    <div class="stat-label">{{ label }}<span class="stat-dot" /></div>
    <strong>{{ masked ? 'R$ ••••' : money(value) }}</strong
    ><small>{{ detail }}</small>
  </article>
</template>
