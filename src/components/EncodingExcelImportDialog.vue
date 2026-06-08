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
const startRow = defineModel<number>("startRow", { required: true });
const charColumn = defineModel<string>("charColumn", { required: true });
const codeColumn = defineModel<string>("codeColumn", { required: true });
const widthColumn = defineModel<string>("widthColumn", { required: true });
const noteColumn = defineModel<string>("noteColumn", { required: true });
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
      class="encoding-excel-import-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="encoding-import-excel-dialog-title"
      @submit.prevent="emit('confirm')"
    >
      <h2 id="encoding-import-excel-dialog-title">{{ t("dialog.importExcel") }}</h2>
      <p class="dialog-hint">{{ t("dialog.rowsColumnsStartAtOne") }}</p>
      <p
        class="dialog-inline-message"
        :class="{ 'dialog-inline-error': isError, empty: !message }"
      >
        {{ message || "\u00a0" }}
      </p>
      <label for="encoding-import-excel-path">{{ t("common.path") }}</label>
      <div class="path-picker-row">
        <input
          id="encoding-import-excel-path"
          ref="input"
          v-model="path"
          type="text"
          @keydown.escape="emit('close')"
        />
        <button type="button" @click="emit('browse')">{{ t("common.browse") }}</button>
      </div>

      <div class="encoding-excel-import-grid">
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
          <span>{{ t("dialog.charColumnOptional") }}</span>
          <input
            v-model="charColumn"
            type="text"
            inputmode="numeric"
            :placeholder="t('dialog.optional')"
          />
        </label>
        <label>
          <span>{{ t("dialog.codeColumnOptional") }}</span>
          <input
            v-model="codeColumn"
            type="text"
            inputmode="numeric"
            :placeholder="t('dialog.optional')"
          />
        </label>
        <label>
          <span>{{ t("dialog.widthColumnOptional") }}</span>
          <input
            v-model="widthColumn"
            type="text"
            inputmode="numeric"
            :placeholder="t('dialog.optional')"
          />
        </label>
        <label>
          <span>{{ t("dialog.noteColumnOptional") }}</span>
          <input
            v-model="noteColumn"
            type="text"
            inputmode="numeric"
            :placeholder="t('dialog.optional')"
          />
        </label>
      </div>

      <label class="append-option">
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
.encoding-excel-import-dialog {
  width: min(520px, calc(100vw - 28px));
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  color: var(--text);
  background: var(--panel-bg);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
}

.encoding-excel-import-dialog h2 {
  margin: 0 0 6px;
  font-size: 18px;
}

.encoding-excel-import-dialog label {
  display: grid;
  gap: 5px;
  color: var(--text-soft);
  font-size: 12px;
}

.dialog-hint {
  margin: 0 0 12px;
  color: var(--muted);
  font-size: 12px;
}

.dialog-inline-message {
  margin: 0 0 12px;
  border: 1px solid var(--info-border);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--info-text);
  background: var(--info-bg);
  font-size: 12px;
  line-height: 1.35;
}

.dialog-inline-message.dialog-inline-error {
  border-color: var(--danger-border-soft);
  color: var(--danger-text-soft);
  background: var(--danger-bg-soft);
}

.dialog-inline-message.empty {
  border-color: var(--info-border);
  color: transparent;
  background: var(--info-bg);
}

.path-picker-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  margin-bottom: 12px;
}

.encoding-excel-import-dialog input[type="text"],
.encoding-excel-import-dialog input[type="number"] {
  min-width: 0;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 7px 8px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-size: 13px;
}

.encoding-excel-import-dialog input:focus {
  border-color: var(--primary);
  outline: none;
  box-shadow: 0 0 0 2px var(--focus-ring);
}

.encoding-excel-import-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.encoding-excel-import-dialog .append-option {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 12px;
  color: var(--text-soft);
  font-size: 12px;
  white-space: nowrap;
}

.encoding-excel-import-dialog .append-option input {
  flex: 0 0 auto;
  accent-color: var(--primary);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}

.dialog-actions button,
.path-picker-row button {
  border: 1px solid var(--primary-hover);
  border-radius: 6px;
  padding: 7px 10px;
  color: var(--on-accent);
  background: var(--primary);
  font-weight: 650;
}

.dialog-actions button:disabled {
  border-color: var(--control-border);
  color: var(--muted);
  background: var(--disabled-bg);
}

@media (max-width: 520px) {
  .encoding-excel-import-grid {
    grid-template-columns: 1fr;
  }
}
</style>
