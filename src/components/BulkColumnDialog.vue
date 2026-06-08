<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { t } from "../i18n";
import type { EncodingRow, SentenceRow } from "../types";

export type BulkEditableColumn = Exclude<keyof SentenceRow, "state"> | keyof EncodingRow;

defineProps<{
  columns: { key: BulkEditableColumn; label: string }[];
  selectedCount: number;
}>();

const column = defineModel<BulkEditableColumn>("column", { required: true });
const value = defineModel<string>("value", { required: true });

const emit = defineEmits<{
  close: [];
  confirm: [];
}>();

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
});

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
  }
}
</script>

<template>
  <div class="dialog-backdrop" role="presentation">
    <form
      class="bulk-column-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-column-title"
      @submit.prevent="emit('confirm')"
    >
      <h2 id="bulk-column-title">{{ t("bulk.columnTitle") }}</h2>
      <p>{{ t("bulk.selectedRows") }}: {{ selectedCount }}</p>

      <label>
        <span>{{ t("bulk.column") }}</span>
        <select v-model="column">
          <option v-for="option in columns" :key="option.key" :value="option.key">
            {{ option.label }}
          </option>
        </select>
      </label>

      <label>
        <span>{{ t("bulk.value") }}</span>
        <textarea v-model="value" rows="5" />
      </label>

      <div class="dialog-actions">
        <button type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
        <button type="submit" :disabled="selectedCount === 0">{{ t("common.apply") }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.bulk-column-dialog {
  width: min(460px, calc(100vw - 28px));
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  color: var(--text);
  background: var(--panel-bg);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
}

.bulk-column-dialog h2,
.bulk-column-dialog p {
  margin: 0;
}

.bulk-column-dialog h2 {
  font-size: 18px;
}

.bulk-column-dialog p {
  margin-top: 6px;
  color: var(--text-soft);
  font-size: 12px;
}

.bulk-column-dialog label {
  display: grid;
  gap: 5px;
  margin-top: 14px;
  color: var(--text-soft);
  font-size: 12px;
}

.bulk-column-dialog select,
.bulk-column-dialog textarea {
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-size: 13px;
}

.bulk-column-dialog select {
  min-height: 34px;
}

.bulk-column-dialog textarea {
  min-height: 110px;
  resize: vertical;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.dialog-actions button {
  min-height: 30px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 5px 12px;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 13px;
}

.dialog-actions button[type="submit"] {
  border-color: var(--primary-hover);
  color: var(--on-accent);
  background: var(--primary);
}

.dialog-actions button:disabled {
  color: var(--muted);
  background: var(--disabled-bg);
  cursor: not-allowed;
}
</style>
