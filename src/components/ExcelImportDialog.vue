<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import type { FileNameImportMode } from "../types";

defineProps<{
  canImport: boolean;
  isImporting: boolean;
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
const stateColumn = defineModel<string>("stateColumn", { required: true });
const fileNameMode = defineModel<FileNameImportMode>("fileNameMode", {
  required: true,
});
const fileNameColumn = defineModel<string>("fileNameColumn", { required: true });
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
      <h2 id="import-excel-dialog-title">Import Excel</h2>
      <p class="dialog-hint">Rows and columns start from 1, matching Excel.</p>
      <label for="import-excel-path">Path</label>
      <div class="path-picker-row">
        <input
          id="import-excel-path"
          ref="input"
          v-model="path"
          type="text"
          @keydown.escape="emit('close')"
        />
        <button type="button" @click="emit('browse')">Browse</button>
      </div>

      <div class="excel-import-grid">
        <label>
          <span>Start row</span>
          <input
            v-model.number="startRow"
            type="number"
            min="1"
            inputmode="numeric"
          />
        </label>
        <label>
          <span>title_addr column (optional, leave blank to skip)</span>
          <input
            v-model="titleColumn"
            type="text"
            inputmode="numeric"
            placeholder="Optional"
          />
        </label>
        <label>
          <span>original_text column (required)</span>
          <input
            v-model="originalColumn"
            type="text"
            inputmode="numeric"
            required
          />
        </label>
        <label>
          <span>translated_text column (required)</span>
          <input
            v-model="translatedColumn"
            type="text"
            inputmode="numeric"
            required
          />
        </label>
        <label>
          <span>note column (optional, leave blank to skip)</span>
          <input
            v-model="noteColumn"
            type="text"
            inputmode="numeric"
            placeholder="Optional"
          />
        </label>
        <label>
          <span>state column (optional, blank means unmarked)</span>
          <input
            v-model="stateColumn"
            type="text"
            inputmode="numeric"
            placeholder="Default unmarked"
          />
        </label>
        <label>
          <span>file_name source (optional)</span>
          <select v-model="fileNameMode">
            <option value="none">None</option>
            <option value="column">Column</option>
            <option value="sheet">Sheet name</option>
          </select>
        </label>
        <label>
          <span>file_name column (required only when source is Column)</span>
          <input
            v-model="fileNameColumn"
            type="text"
            inputmode="numeric"
            :disabled="fileNameMode !== 'column'"
            placeholder="Required for Column"
          />
        </label>
      </div>

      <div class="dialog-actions">
        <button type="button" @click="emit('close')">Cancel</button>
        <button type="submit" :disabled="!canImport">
          {{ isImporting ? "Importing..." : "Import" }}
        </button>
      </div>
    </form>
  </div>
</template>
