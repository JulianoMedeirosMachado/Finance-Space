<script setup lang="ts">
import { money } from '../utils/format';
defineProps<{ label: string; value: number; detail?: string; tone?: string }>();
</script>
<template>
  <article class="stat-card" :class="tone">
    <div class="stat-label">{{ label }}<span class="stat-dot" /></div>
    <strong>{{ money(value) }}</strong
    ><small>{{ detail }}</small>
  </article>
</template>
