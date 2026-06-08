<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { t } from "../i18n";

export type LineLengthScope = "all" | "filtered" | "selected";
export type LineLengthCharacterType =
  | "western"
  | "han"
  | "kana"
  | "hangul"
  | "fullwidth_letters"
  | "fullwidth"
  | "halfwidth"
  | "token"
  | "other";
export type LineLengthBracketTokenType = "square" | "curly" | "angle";
export type LineLengthWidthMode = "encoding" | "fixed";
export type LineLengthWidthRule = {
  fixed: number;
  mode: LineLengthWidthMode;
};

// Each character class can use Encoding Manager width metadata or a fixed value.
// The fixed value also acts as fallback when encoding width is missing.
const characterTypeOptions: { labelKey: Parameters<typeof t>[0]; value: LineLengthCharacterType }[] = [
  { labelKey: "stats.western", value: "western" },
  { labelKey: "encoding.han", value: "han" },
  { labelKey: "encoding.kana", value: "kana" },
  { labelKey: "encoding.hangul", value: "hangul" },
  { labelKey: "stats.fullwidthLetters", value: "fullwidth_letters" },
  { labelKey: "stats.fullwidth", value: "fullwidth" },
  { labelKey: "stats.halfwidth", value: "halfwidth" },
  { labelKey: "stats.token", value: "token" },
  { labelKey: "lineLength.other", value: "other" },
];

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

const scope = defineModel<LineLengthScope>("scope", { required: true });
const maxLength = defineModel<number>("maxLength", { required: true });
const bracketTokenTypes = defineModel<LineLengthBracketTokenType[]>(
  "bracketTokenTypes",
  { required: true },
);
const widthRules = defineModel<Record<LineLengthCharacterType, LineLengthWidthRule>>(
  "widthRules",
  { required: true },
);
const resultBox = ref<HTMLTextAreaElement | null>(null);

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

function updateRuleMode(type: LineLengthCharacterType, mode: LineLengthWidthMode) {
  widthRules.value = {
    ...widthRules.value,
    [type]: {
      ...widthRules.value[type],
      mode,
    },
  };
}

function updateRuleFixed(type: LineLengthCharacterType, value: string) {
  const parsed = Number(value);
  widthRules.value = {
    ...widthRules.value,
    [type]: {
      ...widthRules.value[type],
      fixed: Number.isFinite(parsed) ? Math.max(0, parsed) : 0,
    },
  };
}
</script>

<template>
  <div class="dialog-backdrop" role="presentation">
    <form
      class="line-length-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="line-length-title"
      @submit.prevent="emit('run')"
    >
      <h2 id="line-length-title">{{ t("lineLength.title") }}</h2>

      <div class="top-options">
        <label>
          <span>{{ t("stats.rows") }}</span>
          <select v-model="scope">
            <option value="all">{{ t("stats.allRows") }}</option>
            <option value="filtered">{{ t("stats.filteredRows") }}</option>
            <option value="selected">{{ t("stats.selectedRows") }}</option>
          </select>
        </label>
        <label>
          <span>{{ t("lineLength.maxLength") }}</span>
          <input v-model.number="maxLength" type="number" min="0" step="1" />
        </label>
      </div>

      <p class="summary">{{ t("stats.rows") }}: {{ rowCount }}</p>

      <p class="help-text">
        {{ t("lineLength.help") }}
      </p>

      <fieldset class="option-group">
        <legend>{{ t("stats.bracketTokens") }}</legend>
        <label class="checkbox-line">
          <input v-model="bracketTokenTypes" type="checkbox" value="square" />
          <span>[]</span>
        </label>
        <label class="checkbox-line">
          <input v-model="bracketTokenTypes" type="checkbox" value="curly" />
          <span>{}</span>
        </label>
        <label class="checkbox-line">
          <input v-model="bracketTokenTypes" type="checkbox" value="angle" />
          <span>&lt;&gt;</span>
        </label>
      </fieldset>

      <fieldset class="width-rules">
        <legend>{{ t("lineLength.widthRules") }}</legend>
        <div class="width-rule header" aria-hidden="true">
          <span>{{ t("lineLength.type") }}</span>
          <span>{{ t("lineLength.source") }}</span>
          <span>{{ t("lineLength.fixedFallback") }}</span>
        </div>
        <div
          v-for="option in characterTypeOptions"
          :key="option.value"
          class="width-rule"
        >
          <span>{{ t(option.labelKey) }}</span>
          <select
            :value="widthRules[option.value].mode"
            @change="updateRuleMode(option.value, ($event.target as HTMLSelectElement).value as LineLengthWidthMode)"
          >
            <option value="encoding">{{ t("lineLength.encodingWidth") }}</option>
            <option value="fixed">{{ t("lineLength.fixedValue") }}</option>
          </select>
          <input
            type="number"
            min="0"
            step="1"
            :value="widthRules[option.value].fixed"
            @input="updateRuleFixed(option.value, ($event.target as HTMLInputElement).value)"
          />
        </div>
      </fieldset>

      <div class="dialog-actions">
        <button type="button" :disabled="isRunning" @click="emit('close')">{{ t("common.close") }}</button>
        <button type="button" :disabled="!canCopy || isRunning" @click="emit('copy')">
          {{ t("stats.copyResult") }}
        </button>
        <button type="submit" :disabled="isRunning || maxLength < 0">
          {{ isRunning ? `${t("stats.running")}...` : t("common.check") }}
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

      <p class="result-message">{{ message || t("message.notCheckedYet") }}</p>

      <label class="result-label" for="line-length-result">{{ t("stats.result") }}</label>
      <textarea id="line-length-result" ref="resultBox" :value="result" readonly rows="12" />
    </form>
  </div>
</template>

<style scoped>
.line-length-dialog {
  width: min(700px, calc(100vw - 28px));
  max-height: calc(100vh - 28px);
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  color: var(--text);
  background: var(--panel-bg);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
}

.line-length-dialog h2 {
  margin: 0 0 8px;
  font-size: 17px;
}

.top-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.top-options label,
.option-group,
.width-rules {
  color: var(--text-soft);
  font-size: 12px;
}

.top-options label {
  display: grid;
  gap: 4px;
}

.top-options select,
.top-options input,
.width-rule select,
.width-rule input {
  min-height: 30px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 4px 7px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-size: 13px;
}

.summary {
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
.width-rules {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 10px;
  margin: 8px 0 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 7px 9px;
}

.width-rules {
  display: grid;
  grid-template-columns: 1fr;
}

.option-group legend,
.width-rules legend {
  padding: 0 4px;
  color: var(--text);
  font-weight: 700;
}

.checkbox-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.width-rule {
  display: grid;
  grid-template-columns: minmax(170px, 1fr) minmax(130px, 160px) 96px;
  gap: 6px;
  align-items: center;
}

.width-rule.header {
  color: var(--muted);
  font-weight: 700;
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
  gap: 8px;
  margin-top: 8px;
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
}

.result-message {
  min-height: 26px;
  margin: 8px 0 6px;
  border: 1px solid var(--info-border);
  border-radius: 6px;
  padding: 5px 8px;
  color: var(--info-text);
  background: var(--info-bg);
  font-size: 12px;
  line-height: 1.25;
}

.result-label {
  display: block;
  margin-bottom: 4px;
  color: var(--text-soft);
  font-size: 12px;
}

textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 130px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 7px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  resize: vertical;
}

@media (max-width: 620px) {
  .top-options,
  .width-rule {
    grid-template-columns: 1fr;
  }
}
</style>
