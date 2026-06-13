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
  stateOptions: string[];
}>();

const emit = defineEmits<{
  browse: [];
  close: [];
  confirm: [];
}>();

const path = defineModel<string>("path", { required: true });
const scope = defineModel<ExportScope>("scope", { required: true });
const activeStates = defineModel<string[]>("activeStates", { required: true });
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

function toggleState(state: string) {
  const states = new Set(activeStates.value);
  if (states.has(state)) {
    if (states.size <= 1) return;
    states.delete(state);
  } else {
    states.add(state);
  }
  activeStates.value = Array.from(states);
}

function isStateActive(state: string) {
  return activeStates.value.includes(state);
}
</script>

<template>
  <div class="dialog-backdrop" role="presentation">
    <form
      class="encoding-excel-export-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="encoding-excel-export-dialog-title"
      @submit.prevent="emit('confirm')"
    >
      <h2 id="encoding-excel-export-dialog-title">{{ t("dialog.exportExcel") }}</h2>
      <p
        class="dialog-inline-message"
        :class="{ 'dialog-inline-error': isError, empty: !message }"
      >
        {{ message || "\u00a0" }}
      </p>
      <label for="encoding-excel-export-path">{{ t("common.path") }}</label>
      <div class="path-picker-row">
        <input
          id="encoding-excel-export-path"
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
      </div>
      <fieldset class="state-options">
        <legend>{{ t("dialog.exportStateUsage") }}</legend>
        <div class="choice-button-group">
          <button
            v-for="state in stateOptions"
            :key="state"
            type="button"
            class="choice-button"
            :class="{ active: isStateActive(state) }"
            :aria-pressed="isStateActive(state)"
            @click="toggleState(state)"
          >
            {{ state }}
          </button>
        </div>
      </fieldset>
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

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(15 23 42 / 45%);
}

.encoding-excel-export-dialog {
  width: min(420px, 100%);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  color: var(--text);
  background: var(--panel-bg);
  box-shadow: 0 18px 45px rgb(15 23 42 / 22%);
}

.encoding-excel-export-dialog h2 {
  margin: 0 0 10px;
  font-size: 16px;
  line-height: 1.2;
}

.dialog-inline-message {
  margin: 0 0 10px;
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

.encoding-excel-export-dialog label {
  display: grid;
  gap: 5px;
  color: var(--text-soft);
  font-size: 12px;
}

.path-picker-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.encoding-excel-export-dialog input[type="text"],
.encoding-excel-export-dialog select {
  width: 100%;
  min-height: 34px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-size: 14px;
}

.encoding-excel-export-dialog input:focus,
.encoding-excel-export-dialog select:focus {
  outline: 2px solid var(--primary);
  outline-offset: -1px;
}

.path-picker-row button,
.dialog-actions button {
  min-height: 30px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 5px 12px;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 13px;
}

.export-options {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.state-options {
  margin: 10px 0 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px 9px;
}

.state-options legend {
  padding: 0 4px;
  color: var(--text-soft);
  font-size: 12px;
  font-weight: 700;
}

.choice-button-group {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
}

.choice-button {
  min-height: 28px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 4px 10px;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 13px;
}

.choice-button.active {
  border-color: var(--primary-hover);
  color: var(--on-accent);
  background: var(--primary);
}

.export-summary {
  margin: 10px 0 0;
  color: var(--text-soft);
  font-size: 12px;
}

.encoding-excel-export-dialog .checkbox-label {
  display: inline-flex;
  flex-direction: row;
  gap: 6px;
  align-items: center;
  white-space: nowrap;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.dialog-actions button[type="submit"] {
  border-color: var(--primary-hover);
  color: var(--on-accent);
  background: var(--primary);
}

.dialog-actions button:disabled {
  border-color: var(--control-border);
  color: var(--muted);
  background: var(--disabled-bg);
  cursor: not-allowed;
}
</style>
