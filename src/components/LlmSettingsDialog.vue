<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { t } from "../i18n";

export type LlmProviderMode = "local" | "cloud";

export type LlmServerSettings = {
  providerMode: LlmProviderMode;
  providerName: string;
  baseUrl: string;
  model: string;
  organization: string;
  project: string;
  extraRequestJson: string;
};

// API keys are edited here but persisted by the Rust keyring command, not in
// localStorage. The plain input is intentionally session-only.
const props = defineProps<{
  apiKeyInput: string;
  hasStoredApiKey: boolean;
  isTesting: boolean;
  message: string;
  settings: LlmServerSettings;
  timeoutSeconds: number;
}>();

const emit = defineEmits<{
  clearApiKey: [];
  close: [];
  reset: [];
  saveApiKey: [];
  test: [];
  updateApiKeyInput: [value: string];
  updateTimeoutSeconds: [value: number];
  update: [settings: LlmServerSettings];
}>();

const isCompatibilityHelpOpen = ref(false);

onMounted(() => {
  window.addEventListener("keydown", handleDialogKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleDialogKeydown);
});

function updateField<Key extends keyof LlmServerSettings>(
  key: Key,
  value: LlmServerSettings[Key],
) {
  emit("update", {
    ...props.settings,
    [key]: value,
  });
}

function updateTimeoutSeconds(value: string) {
  const parsed = Number(value);
  emit("updateTimeoutSeconds", Number.isFinite(parsed) ? parsed : 0);
}

function handleDialogKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  event.preventDefault();
  if (isCompatibilityHelpOpen.value) {
    isCompatibilityHelpOpen.value = false;
    return;
  }
  emit("close");
}

</script>

<template>
  <div class="dialog-backdrop" role="presentation">
    <form
      class="llm-settings-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="llm-settings-title"
      @submit.prevent="emit('close')"
    >
      <header class="dialog-header">
        <div class="dialog-title-row">
          <h2 id="llm-settings-title">{{ t("llm.title") }}</h2>
          <button
            class="help-icon-button"
            type="button"
            :aria-label="t('llm.compatibilityTitle')"
            @click="isCompatibilityHelpOpen = true"
          >
            ?
          </button>
        </div>
        <p>{{ t("llm.subtitle") }}</p>
      </header>

      <p class="dialog-message">{{ message || t("common.ready") }}</p>

      <section class="settings-section" aria-label="Connection">
        <label>
          <span>{{ t("llm.serverType") }}</span>
          <select
            :value="settings.providerMode"
            @change="updateField('providerMode', ($event.target as HTMLSelectElement).value as LlmProviderMode)"
          >
            <option value="local">{{ t("llm.localServer") }}</option>
            <option value="cloud">{{ t("llm.cloudServer") }}</option>
          </select>
        </label>

        <label>
          <span>{{ t("llm.provider") }}</span>
          <input
            :value="settings.providerName"
            type="text"
            :placeholder="t('llm.providerPlaceholder')"
            @input="updateField('providerName', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <label class="wide-field">
          <span>{{ t("llm.baseUrl") }}</span>
          <input
            :value="settings.baseUrl"
            type="url"
            placeholder="https://api.openai.com/v1, https://api.anthropic.com/v1..."
            @input="updateField('baseUrl', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <label>
          <span>{{ t("llm.model") }}</span>
          <input
            :value="settings.model"
            type="text"
            placeholder="gpt-4.1, claude-sonnet-4-5, gemini-2.5-pro, llama..."
            @input="updateField('model', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </section>

      <section class="credential-section" aria-label="API key">
        <label>
          <span>{{ t("llm.apiKey") }}</span>
          <input
            :value="apiKeyInput"
            autocomplete="off"
            type="password"
            :placeholder="t('llm.apiKeyPlaceholder')"
            @input="emit('updateApiKeyInput', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <div class="credential-actions">
          <!-- <span>{{ credentialStatusText() }}</span> -->
          <!-- <button
            type="button"
            :disabled="apiKeyInput.trim() === ''"
            @click="emit('saveApiKey')"
          >
            {{ t("llm.saveKey") }}
          </button>
          <button
            type="button"
            @click="emit('clearApiKey')"
          >
            {{ t("llm.clearKey") }}
          </button> -->
        </div>
      </section>

      <section class="settings-section" aria-label="Optional headers">
        <label>
          <span>{{ t("llm.organization") }}</span>
          <input
            :value="settings.organization"
            type="text"
            :placeholder="t('llm.optionalPlaceholder')"
            @input="updateField('organization', ($event.target as HTMLInputElement).value)"
          />
        </label>

        <label>
          <span>{{ t("llm.project") }}</span>
          <input
            :value="settings.project"
            type="text"
            :placeholder="t('llm.optionalPlaceholder')"
            @input="updateField('project', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </section>

      <section class="settings-section compact-section" aria-label="Request timeout">
        <label>
          <span>{{ t("ai.timeoutSeconds") }}</span>
          <input
            :value="timeoutSeconds"
            min="1"
            max="600"
            step="1"
            type="number"
            @input="updateTimeoutSeconds(($event.target as HTMLInputElement).value)"
          />
        </label>
      </section>

      <section class="extra-request-section" aria-label="Extra request JSON">
        <label>
          <span>{{ t("llm.extraRequestJson") }}</span>
          <textarea
            :value="settings.extraRequestJson"
            rows="5"
            spellcheck="false"
            placeholder='{ "enable_thinking": false }'
            @input="updateField('extraRequestJson', ($event.target as HTMLTextAreaElement).value)"
          />
        </label>
        <p>
          {{ t("llm.extraRequestHelp") }}
        </p>
      </section>

      <div class="dialog-actions">
        <button type="button" @click="emit('reset')">{{ t("common.reset") }}</button>
        <button type="button" :disabled="isTesting" @click="emit('test')">
          {{ isTesting ? t("llm.testing") : t("llm.testConnection") }}
        </button>
        <button type="submit">{{ t("common.done") }}</button>
      </div>

      <div
        v-if="isCompatibilityHelpOpen"
        class="compatibility-help-backdrop"
        role="presentation"
        @click.self="isCompatibilityHelpOpen = false"
      >
        <section
          class="compatibility-help"
          role="dialog"
          aria-modal="true"
          aria-labelledby="llm-compatibility-title"
        >
          <header>
            <h3 id="llm-compatibility-title">{{ t("llm.compatibilityTitle") }}</h3>
            <button
              type="button"
              :aria-label="t('common.close')"
              @click="isCompatibilityHelpOpen = false"
            >
              ×
            </button>
          </header>
          <p>{{ t("llm.compatibilityHelp") }}</p>
          <ul>
            <li>{{ t("llm.compatibilityOpenAI") }}</li>
            <li>{{ t("llm.compatibilityClaude") }}</li>
            <li>{{ t("llm.compatibilityGemini") }}</li>
            <li>{{ t("llm.compatibilityLocal") }}</li>
          </ul>
          <footer>
            <button type="button" @click="isCompatibilityHelpOpen = false">
              {{ t("common.close") }}
            </button>
          </footer>
        </section>
      </div>
    </form>
  </div>
</template>

<style scoped>
.llm-settings-dialog {
  width: min(760px, calc(100vw - 28px));
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
  margin-bottom: 14px;
}

.dialog-header h2,
.dialog-header p {
  margin: 0;
}

.dialog-header h2 {
  font-size: 18px;
}

.dialog-header p {
  color: var(--text-soft);
  font-size: 12px;
}

.dialog-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.help-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--control-border);
  border-radius: 999px;
  padding: 0;
  color: var(--control-text);
  background: var(--table-header-bg);
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
}

.help-icon-button:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.compatibility-help-backdrop {
  position: fixed;
  inset: 0;
  z-index: 5;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(8, 12, 20, 0.38);
}

.compatibility-help {
  width: min(560px, calc(100vw - 36px));
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  color: var(--text-soft);
  background: var(--panel-bg);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.32);
  font-size: 12px;
}

.compatibility-help header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 8px;
}

.compatibility-help h3 {
  margin: 0;
  color: var(--text);
  font-size: 14px;
}

.compatibility-help header button {
  width: 26px;
  height: 26px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 0;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 18px;
  line-height: 1;
}

.compatibility-help p,
.compatibility-help ul {
  margin: 0;
}

.compatibility-help ul {
  display: grid;
  gap: 4px;
  padding-left: 18px;
}

.compatibility-help p {
  margin-bottom: 8px;
  line-height: 1.35;
}

.compatibility-help footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

.compatibility-help footer button {
  min-height: 28px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 4px 10px;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 12px;
}

.settings-section {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.settings-section label {
  display: grid;
  gap: 5px;
  color: var(--text-soft);
  font-size: 12px;
}

.settings-section input,
.settings-section select,
.credential-section input,
.extra-request-section textarea {
  min-width: 0;
  min-height: 34px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-size: 13px;
}

.extra-request-section {
  display: grid;
  gap: 6px;
  margin-top: 12px;
}

.extra-request-section label {
  display: grid;
  gap: 5px;
  color: var(--text-soft);
  font-size: 12px;
}

.extra-request-section textarea {
  min-height: 84px;
  resize: vertical;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  line-height: 1.35;
}

.extra-request-section p {
  margin: 0;
  color: var(--text-soft);
  font-size: 12px;
  line-height: 1.35;
}

.credential-section {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.credential-section label {
  display: grid;
  gap: 5px;
  color: var(--text-soft);
  font-size: 12px;
}

.credential-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  color: var(--text-soft);
  font-size: 12px;
}

.credential-actions span {
  flex: 1 1 220px;
}

.credential-actions button {
  min-height: 28px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 4px 10px;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 12px;
}

.wide-field {
  grid-column: 1 / -1;
}

.compact-section {
  grid-template-columns: minmax(120px, 180px);
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

.dialog-actions button:disabled,
.credential-actions button:disabled {
  color: var(--muted);
  background: var(--disabled-bg);
  cursor: not-allowed;
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

@media (max-width: 620px) {
  .settings-section,
  .compact-section {
    grid-template-columns: 1fr;
  }
}
</style>
