<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { t } from "../i18n";

export type CodeShiftOperation = "add" | "subtract";
export type CodeShiftBase = "hex" | "decimal";

defineProps<{
  columns: { key: string; label: string }[];
  selectedCount: number;
}>();

const column = defineModel<string>("column", { required: true });
const operation = defineModel<CodeShiftOperation>("operation", { required: true });
const base = defineModel<CodeShiftBase>("base", { required: true });
const xValue = defineModel<string>("xValue", { required: true });
const yValue = defineModel<string>("yValue", { required: true });

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
  if (event.key !== "Escape") return;
  event.preventDefault();
  emit("close");
}
</script>

<template>
  <div class="dialog-backdrop" role="presentation">
    <form
      class="code-shift-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="code-shift-title"
      @submit.prevent="emit('confirm')"
    >
      <h2 id="code-shift-title">{{ t("encoding.codeShiftTitle") }}</h2>
      <p>{{ t("bulk.selectedRows") }}: {{ selectedCount }}</p>
      <p class="formula">{{ t("encoding.codeShiftFormula") }}</p>

      <label class="full-row">
        <span>{{ t("bulk.column") }}</span>
        <select v-model="column">
          <option v-for="option in columns" :key="option.key" :value="option.key">
            {{ option.label }}
          </option>
        </select>
      </label>

      <div class="option-row">
        <label>
          <span>{{ t("encoding.codeShiftOperation") }}</span>
          <select v-model="operation">
            <option value="add">{{ t("encoding.codeShiftAdd") }}</option>
            <option value="subtract">{{ t("encoding.codeShiftSubtract") }}</option>
          </select>
        </label>

        <label>
          <span>{{ t("encoding.codeShiftBase") }}</span>
          <select v-model="base">
            <option value="hex">{{ t("encoding.codeShiftHex") }}</option>
            <option value="decimal">{{ t("encoding.codeShiftDecimal") }}</option>
          </select>
        </label>
      </div>

      <div class="option-row">
        <label>
          <span>x</span>
          <input v-model="xValue" type="text" inputmode="text" />
        </label>

        <label>
          <span>y</span>
          <input v-model="yValue" type="text" inputmode="text" />
        </label>
      </div>

      <div class="dialog-actions">
        <button type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
        <button type="submit" :disabled="selectedCount === 0">{{ t("common.apply") }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.code-shift-dialog {
  width: min(420px, calc(100vw - 28px));
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  color: var(--text);
  background: var(--panel-bg);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
}

.code-shift-dialog h2,
.code-shift-dialog p {
  margin: 0;
}

.code-shift-dialog h2 {
  font-size: 18px;
}

.code-shift-dialog p {
  margin-top: 6px;
  color: var(--text-soft);
  font-size: 12px;
}

.code-shift-dialog .formula {
  color: var(--text);
}

.option-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.code-shift-dialog label {
  display: grid;
  gap: 5px;
  color: var(--text-soft);
  font-size: 12px;
}

.code-shift-dialog .full-row {
  margin-top: 14px;
}

.code-shift-dialog input,
.code-shift-dialog select {
  min-height: 34px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-size: 13px;
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
