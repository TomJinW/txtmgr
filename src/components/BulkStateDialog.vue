<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { t } from "../i18n";

defineProps<{
  selectedCount: number;
  stateOptions: string[];
}>();

const state = defineModel<string>({ required: true });

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
      class="bulk-state-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-state-title"
      @submit.prevent="emit('confirm')"
    >
      <h2 id="bulk-state-title">{{ t("bulk.title") }}</h2>
      <p>{{ t("bulk.selectedRows") }}: {{ selectedCount }}</p>

      <label>
        <span>{{ t("bulk.state") }}</span>
        <select v-model="state">
          <option v-for="option in stateOptions" :key="option" :value="option">
            {{ option }}
          </option>
        </select>
      </label>

      <div class="dialog-actions">
        <button type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
        <button type="submit" :disabled="selectedCount === 0">{{ t("common.apply") }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.bulk-state-dialog {
  width: min(420px, calc(100vw - 28px));
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  color: var(--text);
  background: var(--panel-bg);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
}

.bulk-state-dialog h2,
.bulk-state-dialog p {
  margin: 0;
}

.bulk-state-dialog h2 {
  font-size: 18px;
}

.bulk-state-dialog p {
  margin-top: 6px;
  color: var(--text-soft);
  font-size: 12px;
}

.bulk-state-dialog label {
  display: grid;
  gap: 5px;
  margin-top: 14px;
  color: var(--text-soft);
  font-size: 12px;
}

.bulk-state-dialog select {
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
