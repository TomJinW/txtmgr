<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { t } from "../i18n";

export type AiTranslationScope = "all" | "selected" | "filtered";

export type AiTranslationSettings = {
  scope: AiTranslationScope;
  sourceLanguage: string;
  targetLanguage: string;
  promptTemplate: string;
  minOriginalCharacters: number;
  timeoutSeconds: number;
  temperature: number;
  attachmentPath: string;
};

const props = defineProps<{
  hasResult: boolean;
  isFakeMode: boolean;
  isTranslating: boolean;
  message: string;
  rowCount: number;
  settings: AiTranslationSettings;
}>();

const emit = defineEmits<{
  browseAttachment: [];
  clearAttachment: [];
  close: [];
  openResult: [];
  resetPrompt: [];
  resetVideoPrompt: [];
  translate: [];
  update: [settings: AiTranslationSettings];
}>();

onMounted(() => {
  window.addEventListener("keydown", handleDialogKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleDialogKeydown);
});

function updateField<Key extends keyof AiTranslationSettings>(
  key: Key,
  value: AiTranslationSettings[Key],
) {
  emit("update", {
    ...props.settings,
    [key]: value,
  });
}

function updateNumberField<Key extends "minOriginalCharacters" | "timeoutSeconds" | "temperature">(
  key: Key,
  value: string,
) {
  const parsed = Number(value);
  updateField(key, Number.isFinite(parsed) ? parsed : 0);
}

function handleDialogKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape" || props.isTranslating) return;
  event.preventDefault();
  emit("close");
}
</script>

<template>
  <div class="dialog-backdrop" role="presentation">
    <form
      class="ai-translation-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-translation-title"
      @submit.prevent="emit('translate')"
    >
      <header class="dialog-header">
        <h2 id="ai-translation-title">{{ t("ai.title") }}</h2>
        <p>{{ t("ai.subtitle") }}</p>
      </header>

      <p class="dialog-message">{{ message || t("common.ready") }}</p>

      <section class="settings-section" aria-label="Translation range">
        <label>
          <span>{{ t("ai.rows") }}</span>
          <select
            :value="settings.scope"
            @change="updateField('scope', ($event.target as HTMLSelectElement).value as AiTranslationScope)"
          >
            <option value="all">{{ t("ai.scope.all") }}</option>
            <option value="selected">{{ t("ai.scope.selected") }}</option>
            <option value="filtered">{{ t("ai.scope.filtered") }}</option>
          </select>
        </label>

        <div class="row-count-box">
          <span>{{ t("ai.rowsToTranslate") }}</span>
          <strong>{{ rowCount }}</strong>
        </div>
      </section>

      <section class="settings-section" aria-label="Languages">
        <label>
          <span>{{ t("ai.sourceLanguage") }}</span>
          <input
            :value="settings.sourceLanguage"
            type="text"
            @input="updateField('sourceLanguage', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <label>
          <span>{{ t("ai.targetLanguage") }}</span>
          <input
            :value="settings.targetLanguage"
            type="text"
            @input="updateField('targetLanguage', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </section>

      <section class="settings-section compact-section" aria-label="Minimum text length">
        <label>
          <span>{{ t("ai.minimumOriginalCharacters") }}</span>
          <input
            :value="settings.minOriginalCharacters"
            min="0"
            step="1"
            type="number"
            @input="updateNumberField('minOriginalCharacters', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </section>

      <section class="prompt-section" aria-label="Prompt template">
        <div class="section-title-row">
          <label for="ai-prompt-template">{{ t("ai.promptTemplate") }}</label>
          <div class="prompt-preset-actions">
            <button type="button" @click="emit('resetPrompt')">{{ t("ai.defaultGamePrompt") }}</button>
            <button type="button" @click="emit('resetVideoPrompt')">{{ t("ai.defaultVideoPrompt") }}</button>
          </div>
        </div>
        <textarea
          id="ai-prompt-template"
          :value="settings.promptTemplate"
          rows="13"
          spellcheck="false"
          @input="updateField('promptTemplate', ($event.target as HTMLTextAreaElement).value)"
        />
      </section>

      <section class="settings-section compact-section" aria-label="Request settings">
        <label>
          <span>{{ t("ai.timeoutSeconds") }}</span>
          <input
            :value="settings.timeoutSeconds"
            min="1"
            max="600"
            step="1"
            type="number"
            @input="updateNumberField('timeoutSeconds', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <label>
          <span>{{ t("ai.temperature") }}</span>
          <input
            :value="settings.temperature"
            min="0"
            max="2"
            step="0.1"
            type="number"
            @input="updateNumberField('temperature', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </section>

      <section class="attachment-section" aria-label="Attachment">
        <label>
          <span>{{ t("ai.attachmentTxtFile") }}</span>
          <input
            :value="settings.attachmentPath"
            readonly
            type="text"
            :placeholder="t('ai.attachmentPlaceholder')"
          />
        </label>
        <div class="attachment-actions">
          <button type="button" @click="emit('browseAttachment')">{{ t("common.browse") }}...</button>
          <button
            type="button"
            :disabled="settings.attachmentPath.trim() === ''"
            @click="emit('clearAttachment')"
          >
            {{ t("common.clear") }}
          </button>
        </div>
      </section>

      <div class="dialog-actions">
        <button
          type="button"
          :disabled="!hasResult || isTranslating"
          @click="emit('openResult')"
        >
          {{ t("ai.viewResult") }}
        </button>
        <button type="button" :disabled="isTranslating" @click="emit('close')">{{ t("common.close") }}</button>
        <button type="submit" :disabled="isTranslating || rowCount === 0">
          {{ isTranslating ? t("ai.translating") : isFakeMode ? t("ai.fakeTranslate") : t("ai.translate") }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.ai-translation-dialog {
  width: min(860px, calc(100vw - 28px));
  max-height: calc(100vh - 28px);
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  color: var(--text);
  background: var(--panel-bg);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
}

.dialog-header {
  display: grid;
  gap: 4px;
  margin-bottom: 12px;
}

.dialog-header h2,
.dialog-header p {
  margin: 0;
}

.dialog-header h2 {
  font-size: 18px;
}

.dialog-header p,
.prompt-section label,
.settings-section label,
.attachment-section label {
  color: var(--text-soft);
  font-size: 12px;
}

.dialog-message {
  min-height: 30px;
  margin: 0 0 12px;
  border: 1px solid var(--info-border);
  border-radius: 6px;
  padding: 7px 8px;
  color: var(--info-text);
  background: var(--info-bg);
  font-size: 12px;
  line-height: 1.25;
}

.settings-section {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.settings-section label,
.attachment-section label {
  display: grid;
  gap: 5px;
}

.settings-section input,
.settings-section select,
.prompt-section textarea,
.attachment-section input {
  min-width: 0;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-size: 13px;
}

.settings-section input,
.settings-section select,
.attachment-section input {
  min-height: 34px;
  padding: 6px 8px;
}

.row-count-box {
  display: grid;
  gap: 5px;
  align-content: center;
  min-height: 34px;
  color: var(--text-soft);
  font-size: 12px;
}

.row-count-box strong {
  color: var(--text);
  font-size: 18px;
  font-weight: 700;
}

.prompt-section {
  display: grid;
  gap: 6px;
  margin-top: 12px;
}

.section-title-row {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.prompt-preset-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  justify-content: flex-end;
}

.section-title-row button,
.attachment-actions button,
.dialog-actions button {
  min-height: 30px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 5px 12px;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 13px;
}

.prompt-section textarea {
  width: 100%;
  padding: 8px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  line-height: 1.35;
  resize: vertical;
}

.compact-section {
  grid-template-columns: repeat(2, minmax(120px, 180px));
}

.attachment-section {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: end;
  margin-top: 12px;
}

.attachment-actions {
  display: flex;
  gap: 8px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.dialog-actions button[type="submit"] {
  border-color: var(--primary-hover);
  color: var(--on-accent);
  background: var(--primary);
}

button:disabled {
  color: var(--muted);
  background: var(--disabled-bg);
  cursor: not-allowed;
}

@media (max-width: 680px) {
  .settings-section,
  .compact-section,
  .attachment-section {
    grid-template-columns: 1fr;
  }
}
</style>
