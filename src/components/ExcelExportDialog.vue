<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { t } from "../i18n";
import type { ExportScope } from "../types";

defineProps<{
  canExport: boolean;
  isError?: boolean;
  isExporting: boolean;
  message?: string;
  rowCount: number;
}>();

const emit = defineEmits<{
  browse: [];
  close: [];
  confirm: [];
}>();

const path = defineModel<string>("path", { required: true });
const scope = defineModel<ExportScope>("scope", { required: true });
const splitByFileName = defineModel<boolean>("splitByFileName", { required: true });
const includeRowNumber = defineModel<boolean>("includeRowNumber", {
  required: true,
});
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
      class="export-excel-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-excel-dialog-title"
      @submit.prevent="emit('confirm')"
    >
      <h2 id="export-excel-dialog-title">{{ t("dialog.exportExcel") }}</h2>
      <p
        class="dialog-inline-message"
        :class="{ 'dialog-inline-error': isError, empty: !message }"
      >
        {{ message || "\u00a0" }}
      </p>
      <label for="export-excel-path">{{ t("common.path") }}</label>
      <div class="path-picker-row">
        <input
          id="export-excel-path"
          ref="input"
          v-model="path"
          type="text"
          @keydown.escape="emit('close')"
        />
        <button type="button" @click="emit('browse')">{{ t("common.browse") }}</button>
      </div>

      <div class="export-options">
        <label>
          <span>{{ t("dialog.exportScope") }}</span>
          <select v-model="scope">
            <option value="all">{{ t("dialog.scopeAllRows") }}</option>
            <option value="filtered">{{ t("dialog.scopeFilteredRows") }}</option>
            <option value="selected">{{ t("dialog.scopeSelectedRows") }}</option>
          </select>
        </label>
        <label class="checkbox-label">
          <input v-model="splitByFileName" type="checkbox" />
          <span>{{ t("dialog.splitByFileName") }}</span>
        </label>
        <label class="checkbox-label">
          <input v-model="includeRowNumber" type="checkbox" />
          <span>{{ t("dialog.keepRowNumber") }}</span>
        </label>
      </div>
      <p class="export-summary">{{ t("dialog.rowsToExport") }}: {{ rowCount }}</p>

      <div class="dialog-actions">
        <button type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
        <button type="submit" :disabled="!canExport || rowCount === 0">
          {{ isExporting ? t("common.saving") : t("common.save") }}
        </button>
      </div>
    </form>
  </div>
</template>
