<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { t } from "../i18n";

defineProps<{
  maxRow: number;
}>();

const targetRow = defineModel<string>("targetRow", { required: true });
const count = defineModel<string>("count", { required: true });

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
      class="insert-rows-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="insert-rows-title"
      @submit.prevent="emit('confirm')"
    >
      <h2 id="insert-rows-title">{{ t("insertRows.title") }}</h2>
      <p>{{ t("insertRows.helpPrefix") }} 1 - {{ maxRow }}.</p>

      <div class="option-row">
        <label>
          <span>{{ t("insertRows.targetRow") }}</span>
          <input v-model="targetRow" type="number" min="1" :max="maxRow" step="1" />
        </label>
        <label>
          <span>{{ t("insertRows.count") }}</span>
          <input v-model="count" type="number" min="1" step="1" />
        </label>
      </div>

      <div class="dialog-actions">
        <button type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
        <button type="submit">{{ t("common.apply") }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.insert-rows-dialog {
  width: min(380px, calc(100vw - 28px));
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  color: var(--text);
  background: var(--panel-bg);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
}

.insert-rows-dialog h2,
.insert-rows-dialog p {
  margin: 0;
}

.insert-rows-dialog h2 {
  font-size: 18px;
}

.insert-rows-dialog p {
  margin-top: 6px;
  color: var(--text-soft);
  font-size: 12px;
}

.option-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 14px;
}

.insert-rows-dialog label {
  display: grid;
  gap: 5px;
  color: var(--text-soft);
  font-size: 12px;
}

.insert-rows-dialog input {
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
</style>
