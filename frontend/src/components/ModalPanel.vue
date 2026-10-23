<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { X } from 'lucide-vue-next';
defineProps<{ title: string }>();
const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement>();
onMounted(() => dialog.value?.showModal());
</script>
<template>
  <dialog
    ref="dialog"
    class="form-dialog"
    aria-labelledby="modal-panel-title"
    @cancel.prevent="emit('close')"
  >
    <div class="dialog-header">
      <h2 id="modal-panel-title">{{ title }}</h2>
      <button class="icon-button" aria-label="Fechar janela" @click="emit('close')">
        <X :size="20" />
      </button>
    </div>
    <div class="dialog-body"><slot /></div>
    <div v-if="$slots.footer" class="dialog-footer"><slot name="footer" /></div>
  </dialog>
</template>
