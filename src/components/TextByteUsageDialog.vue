<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { t } from "../i18n";

export type TextByteUsageScope = "all" | "filtered" | "selected";
export type TextByteUsageColumn = "original" | "translated";
export type TextByteUsageOutput =
  | "summary"
  | "row_summary"
  | "cell_details"
  | "failures";

withDefaults(defineProps<{
  canCopy: boolean;
  isRunning: boolean;
  message: string;
  progressValue: number;
  result: string;
  rowCount: number;
}>(), {
  progressValue: 0,
});

const emit = defineEmits<{
  close: [];
  copy: [];
  run: [];
}>();

const scope = defineModel<TextByteUsageScope>("scope", { required: true });
const columns = defineModel<TextByteUsageColumn[]>("columns", { required: true });
const cellOverBytes = defineModel<number>("cellOverBytes", { required: true });
const translatedOverOriginalBytes = defineModel<number>(
  "translatedOverOriginalBytes",
  { required: true },
);
const translatedOverOriginalPercent = defineModel<number>(
  "translatedOverOriginalPercent",
  { required: true },
);
const outputSections = defineModel<TextByteUsageOutput[]>("outputSections", {
  required: true,
});
const resultBox = ref<HTMLTextAreaElement | null>(null);
const outputOptions: { labelKey: Parameters<typeof t>[0]; value: TextByteUsageOutput }[] = [
  { labelKey: "textByteUsage.outputSummary", value: "summary" },
  { labelKey: "textByteUsage.outputRowSummary", value: "row_summary" },
  { labelKey: "textByteUsage.outputCellDetails", value: "cell_details" },
  { labelKey: "textByteUsage.outputFailures", value: "failures" },
];

onMounted(() => {
  window.addEventListener("keydown", handleDialogKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleDialogKeydown);
});

watch(
  resultBox,
  async () => {
    await nextTick();
    resultBox.value?.focus();
  },
  { immediate: true },
);

function handleDialogKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  event.preventDefault();
  emit("close");
}

function toggleColumn(column: TextByteUsageColumn) {
  const selectedColumns = new Set(columns.value);
  if (selectedColumns.has(column)) {
    if (selectedColumns.size <= 1) return;
    selectedColumns.delete(column);
  } else {
    selectedColumns.add(column);
  }
  columns.value = Array.from(selectedColumns);
}

function isColumnActive(column: TextByteUsageColumn) {
  return columns.value.includes(column);
}

function toggleOutputSection(section: TextByteUsageOutput) {
  const selectedSections = new Set(outputSections.value);
  if (selectedSections.has(section)) {
    if (selectedSections.size <= 1) return;
    selectedSections.delete(section);
  } else {
    selectedSections.add(section);
  }
  outputSections.value = Array.from(selectedSections);
}

function isOutputSectionActive(section: TextByteUsageOutput) {
  return outputSections.value.includes(section);
}
</script>

<template>
  <div class="dialog-backdrop" role="presentation">
    <form
      class="text-byte-usage-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="text-byte-usage-title"
      @submit.prevent="emit('run')"
    >
      <h2 id="text-byte-usage-title">{{ t("textByteUsage.title") }}</h2>

      <div class="top-options">
        <label>
          <span>{{ t("stats.rows") }}</span>
          <select v-model="scope">
            <option value="all">{{ t("stats.allRows") }}</option>
            <option value="filtered">{{ t("stats.filteredRows") }}</option>
            <option value="selected">{{ t("stats.selectedRows") }}</option>
          </select>
        </label>
      </div>

      <div class="summary">
        <span>{{ t("stats.textRows") }}: {{ rowCount }}</span>
      </div>

      <p class="help-text">{{ t("textByteUsage.help") }}</p>

      <fieldset class="option-group">
        <legend>{{ t("textByteUsage.columns") }}</legend>
        <div class="choice-button-group">
          <button
            type="button"
            class="choice-button"
            :class="{ active: isColumnActive('original') }"
            :aria-pressed="isColumnActive('original')"
            @click="toggleColumn('original')"
          >
            {{ t("textByteUsage.original") }}
          </button>
          <button
            type="button"
            class="choice-button"
            :class="{ active: isColumnActive('translated') }"
            :aria-pressed="isColumnActive('translated')"
            @click="toggleColumn('translated')"
          >
            {{ t("textByteUsage.translated") }}
          </button>
        </div>
      </fieldset>

      <fieldset class="thresholds">
        <legend>{{ t("textByteUsage.thresholds") }}</legend>
        <label>
          <span>{{ t("textByteUsage.cellOverBytes") }}</span>
          <input v-model.number="cellOverBytes" type="number" min="0" step="1" />
        </label>
        <label>
          <span>{{ t("textByteUsage.translatedOverOriginalBytes") }}</span>
          <input
            v-model.number="translatedOverOriginalBytes"
            type="number"
            min="0"
            step="1"
          />
        </label>
        <label>
          <span>{{ t("textByteUsage.translatedOverOriginalPercent") }}</span>
          <input
            v-model.number="translatedOverOriginalPercent"
            type="number"
            min="0"
            step="1"
          />
        </label>
        <p>{{ t("textByteUsage.zeroDisables") }}</p>
      </fieldset>

      <fieldset class="option-group">
        <legend>{{ t("textByteUsage.outputContent") }}</legend>
        <div class="choice-button-group">
          <button
            v-for="option in outputOptions"
            :key="option.value"
            type="button"
            class="choice-button"
            :class="{ active: isOutputSectionActive(option.value) }"
            :aria-pressed="isOutputSectionActive(option.value)"
            @click="toggleOutputSection(option.value)"
          >
            {{ t(option.labelKey) }}
          </button>
        </div>
      </fieldset>

      <div class="dialog-actions">
        <button type="button" :disabled="isRunning" @click="emit('close')">
          {{ t("common.close") }}
        </button>
        <button type="button" :disabled="!canCopy || isRunning" @click="emit('copy')">
          {{ t("stats.copyResult") }}
        </button>
        <button type="submit" :disabled="isRunning">
          {{ isRunning ? `${t("stats.running")}...` : t("stats.run") }}
        </button>
      </div>

      <div
        class="progress-row"
        role="progressbar"
        aria-label="Running"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="Math.round(progressValue)"
      >
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${progressValue}%` }" />
        </div>
        <span>{{ Math.round(progressValue) }}%</span>
      </div>

      <p class="result-message">{{ message || t("stats.notCountedYet") }}</p>

      <label class="result-label" for="text-byte-usage-result">
        {{ t("stats.result") }}
      </label>
      <textarea
        id="text-byte-usage-result"
        ref="resultBox"
        :value="result"
        readonly
        rows="13"
      />
    </form>
  </div>
</template>

<style scoped>
.text-byte-usage-dialog {
  width: min(720px, calc(100vw - 28px));
  max-height: calc(100vh - 28px);
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  color: var(--text);
  background: var(--panel-bg);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
  font-family:
    -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", "Noto Sans CJK SC", "Segoe UI", sans-serif;
}

.text-byte-usage-dialog h2 {
  margin: 0 0 8px;
  font-size: 17px;
}

.top-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.top-options label,
.thresholds label,
.result-label {
  display: grid;
  gap: 4px;
  color: var(--text-soft);
  font-size: 12px;
}

.top-options select,
.thresholds input {
  min-width: 0;
  min-height: 30px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 4px 7px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-size: 13px;
}

.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  align-items: center;
  margin: 7px 0 0;
  color: var(--text-soft);
  font-size: 12px;
}

.help-text {
  margin: 6px 0 0;
  border: 1px solid var(--info-border);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--info-text);
  background: var(--info-bg);
  font-size: 12px;
  line-height: 1.25;
}

.option-group,
.thresholds {
  margin: 8px 0 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px 9px;
}

.option-group legend,
.thresholds legend {
  padding: 0 4px;
  color: var(--text);
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
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 4px 10px;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 13px;
  line-height: 1.25;
  cursor: pointer;
  user-select: none;
}

.choice-button.active {
  border-color: var(--primary-hover);
  color: var(--on-accent);
  background: var(--primary);
}

.thresholds {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
}

.thresholds p {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--text-soft);
  font-size: 12px;
  line-height: 1.25;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.dialog-actions button {
  min-height: 28px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 4px 10px;
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

.progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  color: var(--text-soft);
  font-size: 12px;
}

.progress-track {
  flex: 1 1 auto;
  height: 8px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--disabled-bg);
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--primary);
  transition: width 120ms ease;
}

.result-message {
  margin: 10px 0 0;
  border: 1px solid var(--info-border);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--info-text);
  background: var(--info-bg);
  font-size: 12px;
  line-height: 1.25;
}

.result-label {
  margin-top: 10px;
}

.text-byte-usage-dialog textarea {
  width: 100%;
  margin-top: 5px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 8px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-family:
    ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  font-size: 12px;
  line-height: 1.35;
  resize: vertical;
}

@media (max-width: 620px) {
  .top-options,
  .thresholds {
    grid-template-columns: 1fr;
  }
}
</style>
