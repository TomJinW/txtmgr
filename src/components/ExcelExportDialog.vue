<script setup lang="ts">
import { nextTick, ref, watch } from "vue";

defineProps<{
  canExport: boolean;
  isExporting: boolean;
  rowCount: number;
}>();

const emit = defineEmits<{
  browse: [];
  close: [];
  confirm: [];
}>();

const path = defineModel<string>("path", { required: true });
const filteredOnly = defineModel<boolean>("filteredOnly", { required: true });
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
      <h2 id="export-excel-dialog-title">Export Excel</h2>
      <label for="export-excel-path">Path</label>
      <div class="path-picker-row">
        <input
          id="export-excel-path"
          ref="input"
          v-model="path"
          type="text"
          @keydown.escape="emit('close')"
        />
        <button type="button" @click="emit('browse')">Browse</button>
      </div>

      <div class="export-options">
        <label class="checkbox-label">
          <input v-model="filteredOnly" type="checkbox" />
          <span>Export current filtered results</span>
        </label>
        <label class="checkbox-label">
          <input v-model="splitByFileName" type="checkbox" />
          <span>Use file_name as separate sheets</span>
        </label>
        <label class="checkbox-label">
          <input v-model="includeRowNumber" type="checkbox" />
          <span>Keep row number column</span>
        </label>
      </div>

      <div class="dialog-actions">
        <button type="button" @click="emit('close')">Cancel</button>
        <button type="submit" :disabled="!canExport || rowCount === 0">
          {{ isExporting ? "Saving..." : "Save" }}
        </button>
      </div>
    </form>
  </div>
</template>
