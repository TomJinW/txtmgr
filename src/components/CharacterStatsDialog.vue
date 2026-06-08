<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { t } from "../i18n";

// Shared result dialog for character counts and encoding coverage checks. The
// parent owns all computation so this component stays reusable and predictable.
const props = withDefaults(defineProps<{
  canCopy: boolean;
  alwaysShowProgress?: boolean;
  isRunning?: boolean;
  message: string;
  progressValue?: number;
  result: string;
  rowCount: number;
  rowCountLabel?: string;
  runLabel?: string;
  showIgnoreWhitespace?: boolean;
  showTextScope?: boolean;
  textRowCount?: number;
  title?: string;
}>(), {
  alwaysShowProgress: false,
  isRunning: false,
  progressValue: 0,
  showIgnoreWhitespace: false,
  showTextScope: false,
  textRowCount: 0,
});

const emit = defineEmits<{
  close: [];
  copy: [];
  run: [];
}>();

const scope = defineModel<"all" | "filtered" | "selected">("scope", {
  required: true,
});
const textScope = defineModel<"all" | "filtered" | "selected">("textScope", {
  default: "all",
});
const includeAllCharacters = defineModel<boolean>("includeAllCharacters", {
  required: true,
});
type CharacterType =
  | "western"
  | "han"
  | "kana"
  | "hangul"
  | "fullwidth_letters"
  | "fullwidth"
  | "halfwidth"
  | "token"
  | "other";

const characterTypes = defineModel<CharacterType[]>("characterTypes", { required: true });
const sortOrder = defineModel<"desc" | "asc">("sortOrder", { required: true });
const bracketTokenTypes = defineModel<("square" | "curly" | "angle")[]>(
  "bracketTokenTypes",
  { required: true },
);
const ignoreWhitespace = defineModel<boolean>("ignoreWhitespace", { default: true });
const resultBox = ref<HTMLTextAreaElement | null>(null);
const displayTitle = computed(() => props.title ?? t("stats.characterCount"));
const displayRowCountLabel = computed(() => props.rowCountLabel ?? t("stats.rowsCounted"));
const displayRunLabel = computed(() => props.runLabel ?? t("stats.run"));
const isAllCharactersActive = computed(
  () => includeAllCharacters.value || characterTypes.value.length === 0,
);
const characterTypeOptions: { labelKey: Parameters<typeof t>[0]; value: CharacterType }[] = [
  { labelKey: "stats.western", value: "western" },
  { labelKey: "encoding.han", value: "han" },
  { labelKey: "encoding.kana", value: "kana" },
  { labelKey: "encoding.hangul", value: "hangul" },
  { labelKey: "stats.fullwidthLetters", value: "fullwidth_letters" },
  { labelKey: "stats.fullwidth", value: "fullwidth" },
  { labelKey: "stats.halfwidth", value: "halfwidth" },
  { labelKey: "stats.token", value: "token" },
  { labelKey: "stats.other", value: "other" },
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
  if (event.key !== "Escape" || props.isRunning) return;
  event.preventDefault();
  emit("close");
}

function selectAllCharacterTypes() {
  includeAllCharacters.value = true;
  characterTypes.value = [];
}

function setCharacterType(type: CharacterType, checked: boolean) {
  const selectedTypes = new Set(characterTypes.value);
  if (checked) {
    selectedTypes.add(type);
  } else {
    selectedTypes.delete(type);
  }

  characterTypes.value = Array.from(selectedTypes);
  includeAllCharacters.value = selectedTypes.size === 0;
}

function isCharacterTypeActive(type: CharacterType) {
  return !isAllCharactersActive.value && characterTypes.value.includes(type);
}
</script>

<template>
  <div class="dialog-backdrop" role="presentation">
    <form
      class="character-stats-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="character-stats-dialog-title"
      @submit.prevent="emit('run')"
    >
      <h2 id="character-stats-dialog-title">{{ displayTitle }}</h2>

      <div class="character-stats-options">
        <label>
          <span>{{ showTextScope ? t("stats.encodingRows") : t("stats.rows") }}</span>
          <select v-model="scope">
            <option value="all">{{ t("stats.allRows") }}</option>
            <option value="filtered">{{ t("stats.filteredRows") }}</option>
            <option value="selected">{{ t("stats.selectedRows") }}</option>
          </select>
        </label>
        <label v-if="showTextScope">
          <span>{{ t("stats.textRows") }}</span>
          <select v-model="textScope">
            <option value="all">{{ t("stats.allRows") }}</option>
            <option value="filtered">{{ t("stats.filteredRows") }}</option>
            <option value="selected">{{ t("stats.selectedRows") }}</option>
          </select>
        </label>
        <label>
          <span>{{ t("stats.sort") }}</span>
          <select v-model="sortOrder">
            <option value="desc">{{ t("stats.desc") }}</option>
            <option value="asc">{{ t("stats.asc") }}</option>
          </select>
        </label>
      </div>

      <div class="character-stats-summary">
        <span>{{ displayRowCountLabel }}: {{ rowCount }}</span>
        <span v-if="showTextScope">{{ t("stats.textRows") }}: {{ textRowCount }}</span>
      </div>

      <fieldset class="option-group">
        <legend>{{ t("stats.characterTypes") }}</legend>
        <div class="choice-button-group">
          <button
            type="button"
            class="choice-button"
            :class="{ active: isAllCharactersActive }"
            :aria-pressed="isAllCharactersActive"
            @click="selectAllCharacterTypes"
          >
            {{ t("common.all") }}
          </button>
          <label
            v-for="option in characterTypeOptions"
            :key="option.value"
            class="choice-button"
            :class="{ active: isCharacterTypeActive(option.value) }"
          >
            <input
              type="checkbox"
              :checked="isCharacterTypeActive(option.value)"
              @change="setCharacterType(option.value, ($event.target as HTMLInputElement).checked)"
            />
            {{ t(option.labelKey) }}
          </label>
        </div>
      </fieldset>

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

      <fieldset v-if="showIgnoreWhitespace" class="option-group">
        <legend>{{ t("stats.cleanup") }}</legend>
        <label class="checkbox-line">
          <input v-model="ignoreWhitespace" type="checkbox" />
          <span>{{ t("stats.ignoreWhitespace") }}</span>
        </label>
      </fieldset>

      <div class="dialog-actions">
        <button type="button" :disabled="isRunning" @click="emit('close')">{{ t("common.close") }}</button>
        <button type="button" :disabled="!canCopy || isRunning" @click="emit('copy')">
          {{ t("stats.copyResult") }}
        </button>
        <button type="submit" :disabled="isRunning">
          {{ isRunning ? `${t("stats.running")}...` : displayRunLabel }}
        </button>
      </div>

      <div
        v-if="alwaysShowProgress || isRunning"
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

      <label class="result-label" for="character-stats-result">{{ t("stats.result") }}</label>
      <textarea
        id="character-stats-result"
        ref="resultBox"
        :value="result"
        readonly
        rows="12"
      />
    </form>
  </div>
</template>

<style scoped>
.character-stats-dialog {
  width: min(680px, calc(100vw - 28px));
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  color: var(--text);
  background: var(--panel-bg);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
  font-family:
    -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", "Noto Sans CJK SC", "Segoe UI", sans-serif;
}

.character-stats-dialog h2 {
  margin: 0 0 12px;
  font-size: 18px;
}

.character-stats-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.character-stats-options label,
.result-label {
  display: grid;
  gap: 5px;
  color: var(--text-soft);
  font-size: 12px;
}

.character-stats-options select {
  min-width: 0;
  min-height: 34px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-size: 13px;
}

.character-stats-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 18px;
  align-items: center;
  margin-top: 12px;
  color: var(--text-soft);
  font-size: 12px;
}

.checkbox-line {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin: 4px 14px 4px 0;
  white-space: nowrap;
  color: var(--text);
  font-family:
    -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", "Noto Sans CJK SC", "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1.35;
}

.checkbox-line input {
  flex: 0 0 auto;
  accent-color: var(--primary);
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
  font-family:
    -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", "Noto Sans CJK SC", "Segoe UI", sans-serif;
  font-size: 13px;
  line-height: 1.25;
  cursor: pointer;
  user-select: none;
}

.choice-button input {
  position: absolute;
  inline-size: 1px;
  block-size: 1px;
  opacity: 0;
  pointer-events: none;
}

.choice-button:hover {
  border-color: var(--primary-hover);
}

.choice-button.active {
  border-color: var(--primary-hover);
  color: var(--on-accent);
  background: var(--primary);
}

.option-group {
  display: block;
  margin: 12px 0 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px 9px;
}

.option-group legend {
  padding: 0 4px;
  color: var(--text-soft);
  font-family:
    -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB",
    "Microsoft YaHei", "Noto Sans CJK SC", "Segoe UI", sans-serif;
  font-size: 12px;
  line-height: 1.35;
}

.option-group input:disabled + span {
  color: var(--muted);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
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

.progress-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
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
  margin: 12px 0 0;
  border: 1px solid var(--info-border);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--info-text);
  background: var(--info-bg);
  font-size: 12px;
  line-height: 1.25;
}

.result-label {
  margin-top: 12px;
}

.character-stats-dialog textarea {
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
  line-height: 1.45;
  resize: vertical;
}

@media (max-width: 620px) {
  .character-stats-options {
    grid-template-columns: 1fr;
  }
}
</style>
