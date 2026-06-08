<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import type { FileNameImportMode } from "../types";
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
const startRow = defineModel<number>("startRow", { required: true });
const titleColumn = defineModel<string>("titleColumn", { required: true });
const originalColumn = defineModel<string>("originalColumn", { required: true });
const translatedColumn = defineModel<string>("translatedColumn", { required: true });
const noteColumn = defineModel<string>("noteColumn", { required: true });
const aiOutputColumn = defineModel<string>("aiOutputColumn", { required: true });
const stateColumn = defineModel<string>("stateColumn", { required: true });
const fileNameMode = defineModel<FileNameImportMode>("fileNameMode", {
  required: true,
});
const fileNameColumn = defineModel<string>("fileNameColumn", { required: true });
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
      aria-labelledby="import-excel-dialog-title"
      @submit.prevent="emit('confirm')"
    >
      <h2 id="import-excel-dialog-title">{{ t("dialog.importExcel") }}</h2>
      <p class="dialog-hint">{{ t("dialog.rowsColumnsStartAtOne") }}</p>
      <p
        class="dialog-inline-message"
        :class="{ 'dialog-inline-error': isError, empty: !message }"
      >
        {{ message || "\u00a0" }}
      </p>
      <label for="import-excel-path">{{ t("common.path") }}</label>
      <div class="path-picker-row">
        <input
          id="import-excel-path"
          ref="input"
          v-model="path"
          type="text"
          @keydown.escape="emit('close')"
        />
        <button type="button" @click="emit('browse')">{{ t("common.browse") }}</button>
      </div>

      <div class="excel-import-grid">
        <label>
          <span>{{ t("dialog.startRow") }}</span>
          <input
            v-model.number="startRow"
            type="number"
            min="1"
            inputmode="numeric"
          />
        </label>
        <label>
          <span>title_addr column ({{ t("dialog.optional") }})</span>
          <input
            v-model="titleColumn"
            type="text"
            inputmode="numeric"
            :placeholder="t('dialog.optional')"
          />
        </label>
        <label>
          <span>original_text column ({{ t("dialog.optional") }})</span>
          <input
            v-model="originalColumn"
            type="text"
            inputmode="numeric"
            :placeholder="t('dialog.optional')"
          />
        </label>
        <label>
          <span>translated_text column ({{ t("dialog.optional") }})</span>
          <input
            v-model="translatedColumn"
            type="text"
            inputmode="numeric"
            :placeholder="t('dialog.optional')"
          />
        </label>
        <label>
          <span>note column ({{ t("dialog.optional") }})</span>
          <input
            v-model="noteColumn"
            type="text"
            inputmode="numeric"
            :placeholder="t('dialog.optional')"
          />
        </label>
        <label>
          <span>ai_output column ({{ t("dialog.optional") }})</span>
          <input
            v-model="aiOutputColumn"
            type="text"
            inputmode="numeric"
            :placeholder="t('dialog.optional')"
          />
        </label>
        <label>
          <span>state column ({{ t("dialog.optional") }})</span>
          <input
            v-model="stateColumn"
            type="text"
            inputmode="numeric"
            :placeholder="t('dialog.defaultUnmarked')"
          />
        </label>
        <div class="file-name-import-row">
          <label>
            <span>{{ t("dialog.fileNameSource") }} ({{ t("dialog.optional") }})</span>
            <select v-model="fileNameMode">
              <option value="none">{{ t("dialog.none") }}</option>
              <option value="column">{{ t("dialog.column") }}</option>
              <option value="sheet">{{ t("dialog.sheetName") }}</option>
            </select>
          </label>
          <label>
            <span>file_name column</span>
            <input
              v-model="fileNameColumn"
              type="text"
              inputmode="numeric"
              :disabled="fileNameMode !== 'column'"
              :placeholder="t('dialog.optional')"
            />
          </label>
        </div>
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

<style scoped>
.file-name-import-row {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(150px, 0.8fr);
  gap: 10px;
}

.file-name-import-row label {
  min-width: 0;
}

@media (max-width: 560px) {
  .file-name-import-row {
    grid-template-columns: 1fr;
  }
}
</style>
