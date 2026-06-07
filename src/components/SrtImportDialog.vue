<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { t } from "../i18n";

defineProps<{
  canImport: boolean;
  isError?: boolean;
  isImporting: boolean;
  message?: string;
}>();

const emit = defineEmits<{
  browse: [];
  close: [];
  confirm: [];
}>();

const path = defineModel<string>("path", { required: true });
const appendRows = defineModel<boolean>("appendRows", { required: true });
const input = ref<HTMLInputElement | null>(null);

watch(
  input,
  async () => {
    await nextTick();
    input.value?.focus();
    input.value?.select();
  },
  { immediate: true },
);
</script>

<template>
  <div class="dialog-backdrop" role="presentation">
    <form
      class="excel-import-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-srt-dialog-title"
      @submit.prevent="emit('confirm')"
    >
      <h2 id="import-srt-dialog-title">{{ t("dialog.importSrt") }}</h2>
      <p class="dialog-hint">
        {{ t("dialog.srtImportHint") }}
      </p>
      <p
        class="dialog-inline-message"
        :class="{ 'dialog-inline-error': isError, empty: !message }"
      >
        {{ message || "\u00a0" }}
      </p>
      <label for="import-srt-path">{{ t("common.path") }}</label>
      <div class="path-picker-row">
        <input
          id="import-srt-path"
          ref="input"
          v-model="path"
          type="text"
          @keydown.escape="emit('close')"
        />
        <button type="button" @click="emit('browse')">{{ t("common.browse") }}</button>
      </div>

      <label class="checkbox-label append-option">
        <input v-model="appendRows" type="checkbox" />
        <span>{{ t("dialog.appendRows") }}</span>
      </label>

      <div class="dialog-actions">
        <button type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
        <button type="submit" :disabled="!canImport">
          {{ isImporting ? t("common.importing") : t("common.import") }}
        </button>
      </div>
    </form>
  </div>
</template>
