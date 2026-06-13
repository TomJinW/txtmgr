<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { t } from "../i18n";

export type TextByteCharacterType =
  | "western"
  | "han"
  | "kana"
  | "hangul"
  | "fullwidth_letters"
  | "fullwidth"
  | "halfwidth"
  | "newline"
  | "token"
  | "other";
export type TextByteBracketTokenType = "square" | "curly" | "angle";
export type TextByteRuleMode = "encoding" | "fixed";
export type TextByteRule = {
  fixed: number;
  mode: TextByteRuleMode;
};
export type TextByteUsageSettings = {
  activeStates: string[];
  bracketTokenTypes: TextByteBracketTokenType[];
  byteRules: Record<TextByteCharacterType, TextByteRule>;
  useFixedFallback: boolean;
};

// Original and translated text can use different byte rules because old games
// often store source and translated strings in different tables or banks.
const characterTypeOptions: { labelKey: Parameters<typeof t>[0]; value: TextByteCharacterType }[] = [
  { labelKey: "stats.western", value: "western" },
  { labelKey: "encoding.han", value: "han" },
  { labelKey: "encoding.kana", value: "kana" },
  { labelKey: "encoding.hangul", value: "hangul" },
  { labelKey: "stats.fullwidthLetters", value: "fullwidth_letters" },
  { labelKey: "stats.fullwidth", value: "fullwidth" },
  { labelKey: "stats.halfwidth", value: "halfwidth" },
  { labelKey: "textByte.newline", value: "newline" },
  { labelKey: "stats.token", value: "token" },
  { labelKey: "lineLength.other", value: "other" },
];

withDefaults(defineProps<{
  stateOptions?: string[];
}>(), {
  stateOptions: () => [],
});

const emit = defineEmits<{
  close: [];
}>();

const originalSettings = defineModel<TextByteUsageSettings>("originalSettings", {
  required: true,
});
const translatedSettings = defineModel<TextByteUsageSettings>("translatedSettings", {
  required: true,
});

onMounted(() => {
  window.addEventListener("keydown", handleDialogKeydown);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleDialogKeydown);
});

function handleDialogKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  event.preventDefault();
  emit("close");
}

function settingsForSide(side: "original" | "translated") {
  return side === "original" ? originalSettings.value : translatedSettings.value;
}

function updateSettings(side: "original" | "translated", settings: TextByteUsageSettings) {
  if (side === "original") {
    originalSettings.value = settings;
  } else {
    translatedSettings.value = settings;
  }
}

function toggleState(side: "original" | "translated", state: string) {
  const settings = settingsForSide(side);
  const activeStates = new Set(settings.activeStates);
  if (activeStates.has(state)) {
    if (activeStates.size <= 1) return;
    activeStates.delete(state);
  } else {
    activeStates.add(state);
  }
  updateSettings(side, { ...settings, activeStates: Array.from(activeStates) });
}

function isStateActive(side: "original" | "translated", state: string) {
  return settingsForSide(side).activeStates.includes(state);
}

function toggleBracketToken(
  side: "original" | "translated",
  tokenType: TextByteBracketTokenType,
  checked: boolean,
) {
  const settings = settingsForSide(side);
  const nextTokens = new Set(settings.bracketTokenTypes);
  if (checked) {
    nextTokens.add(tokenType);
  } else {
    nextTokens.delete(tokenType);
  }
  updateSettings(side, { ...settings, bracketTokenTypes: Array.from(nextTokens) });
}

function hasBracketToken(side: "original" | "translated", tokenType: TextByteBracketTokenType) {
  return settingsForSide(side).bracketTokenTypes.includes(tokenType);
}

function updateFallback(side: "original" | "translated", checked: boolean) {
  const settings = settingsForSide(side);
  updateSettings(side, { ...settings, useFixedFallback: checked });
}

function updateRuleMode(
  side: "original" | "translated",
  type: TextByteCharacterType,
  mode: TextByteRuleMode,
) {
  const settings = settingsForSide(side);
  updateSettings(side, {
    ...settings,
    byteRules: {
      ...settings.byteRules,
      [type]: {
        ...settings.byteRules[type],
        mode,
      },
    },
  });
}

function updateRuleFixed(
  side: "original" | "translated",
  type: TextByteCharacterType,
  value: string,
) {
  const parsed = Number(value);
  const settings = settingsForSide(side);
  updateSettings(side, {
    ...settings,
    byteRules: {
      ...settings.byteRules,
      [type]: {
        ...settings.byteRules[type],
        fixed: Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0,
      },
    },
  });
}
</script>

<template>
  <div class="dialog-backdrop" role="presentation">
    <form
      class="text-byte-settings-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="text-byte-settings-title"
      @submit.prevent="emit('close')"
    >
      <h2 id="text-byte-settings-title">{{ t("textByte.title") }}</h2>
      <p class="help-text">{{ t("textByte.help") }}</p>

      <div class="settings-panels">
        <section class="settings-panel" aria-labelledby="text-byte-original-title">
          <h3 id="text-byte-original-title">{{ t("textByte.originalText") }}</h3>
          <p class="target-note">original_text</p>

          <fieldset class="option-group">
            <legend>{{ t("stats.validEncodingStates") }} ({{ t("stats.stateBothShort") }})</legend>
            <div class="choice-button-group">
              <button
                v-for="state in stateOptions"
                :key="state"
                type="button"
                class="choice-button"
                :class="{ active: isStateActive('original', state) }"
                :aria-pressed="isStateActive('original', state)"
                @click="toggleState('original', state)"
              >
                {{ state }}
              </button>
            </div>
          </fieldset>

          <fieldset class="option-group">
            <legend>{{ t("stats.bracketTokens") }}</legend>
            <label class="checkbox-line">
              <input
                type="checkbox"
                :checked="hasBracketToken('original', 'square')"
                @change="toggleBracketToken('original', 'square', ($event.target as HTMLInputElement).checked)"
              />
              <span>[]</span>
            </label>
            <label class="checkbox-line">
              <input
                type="checkbox"
                :checked="hasBracketToken('original', 'curly')"
                @change="toggleBracketToken('original', 'curly', ($event.target as HTMLInputElement).checked)"
              />
              <span>{}</span>
            </label>
            <label class="checkbox-line">
              <input
                type="checkbox"
                :checked="hasBracketToken('original', 'angle')"
                @change="toggleBracketToken('original', 'angle', ($event.target as HTMLInputElement).checked)"
              />
              <span>&lt;&gt;</span>
            </label>
          </fieldset>

          <label class="checkbox-line fallback-toggle">
            <input
              type="checkbox"
              :checked="originalSettings.useFixedFallback"
              @change="updateFallback('original', ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ t("textByte.useFixedFallback") }}</span>
          </label>

          <fieldset class="byte-rules">
            <legend>{{ t("textByte.byteRules") }}</legend>
            <div class="byte-rule header" aria-hidden="true">
              <span>{{ t("lineLength.type") }}</span>
              <span>{{ t("lineLength.source") }}</span>
              <span>{{ t("textByte.fixedFallbackBytes") }}</span>
            </div>
            <div v-for="option in characterTypeOptions" :key="option.value" class="byte-rule">
              <span>{{ t(option.labelKey) }}</span>
              <select
                :value="originalSettings.byteRules[option.value].mode"
                @change="updateRuleMode('original', option.value, ($event.target as HTMLSelectElement).value as TextByteRuleMode)"
              >
                <option value="encoding">{{ t("textByte.encodingCodeBytes") }}</option>
                <option value="fixed">{{ t("textByte.fixedBytes") }}</option>
              </select>
              <input
                type="number"
                min="0"
                step="1"
                :value="originalSettings.byteRules[option.value].fixed"
                @input="updateRuleFixed('original', option.value, ($event.target as HTMLInputElement).value)"
              />
            </div>
          </fieldset>
        </section>

        <section class="settings-panel" aria-labelledby="text-byte-translated-title">
          <h3 id="text-byte-translated-title">{{ t("textByte.translatedText") }}</h3>
          <p class="target-note">translated_text</p>

          <fieldset class="option-group">
            <legend>{{ t("stats.validEncodingStates") }} ({{ t("stats.stateBothShort") }})</legend>
            <div class="choice-button-group">
              <button
                v-for="state in stateOptions"
                :key="state"
                type="button"
                class="choice-button"
                :class="{ active: isStateActive('translated', state) }"
                :aria-pressed="isStateActive('translated', state)"
                @click="toggleState('translated', state)"
              >
                {{ state }}
              </button>
            </div>
          </fieldset>

          <fieldset class="option-group">
            <legend>{{ t("stats.bracketTokens") }}</legend>
            <label class="checkbox-line">
              <input
                type="checkbox"
                :checked="hasBracketToken('translated', 'square')"
                @change="toggleBracketToken('translated', 'square', ($event.target as HTMLInputElement).checked)"
              />
              <span>[]</span>
            </label>
            <label class="checkbox-line">
              <input
                type="checkbox"
                :checked="hasBracketToken('translated', 'curly')"
                @change="toggleBracketToken('translated', 'curly', ($event.target as HTMLInputElement).checked)"
              />
              <span>{}</span>
            </label>
            <label class="checkbox-line">
              <input
                type="checkbox"
                :checked="hasBracketToken('translated', 'angle')"
                @change="toggleBracketToken('translated', 'angle', ($event.target as HTMLInputElement).checked)"
              />
              <span>&lt;&gt;</span>
            </label>
          </fieldset>

          <label class="checkbox-line fallback-toggle">
            <input
              type="checkbox"
              :checked="translatedSettings.useFixedFallback"
              @change="updateFallback('translated', ($event.target as HTMLInputElement).checked)"
            />
            <span>{{ t("textByte.useFixedFallback") }}</span>
          </label>

          <fieldset class="byte-rules">
            <legend>{{ t("textByte.byteRules") }}</legend>
            <div class="byte-rule header" aria-hidden="true">
              <span>{{ t("lineLength.type") }}</span>
              <span>{{ t("lineLength.source") }}</span>
              <span>{{ t("textByte.fixedFallbackBytes") }}</span>
            </div>
            <div v-for="option in characterTypeOptions" :key="option.value" class="byte-rule">
              <span>{{ t(option.labelKey) }}</span>
              <select
                :value="translatedSettings.byteRules[option.value].mode"
                @change="updateRuleMode('translated', option.value, ($event.target as HTMLSelectElement).value as TextByteRuleMode)"
              >
                <option value="encoding">{{ t("textByte.encodingCodeBytes") }}</option>
                <option value="fixed">{{ t("textByte.fixedBytes") }}</option>
              </select>
              <input
                type="number"
                min="0"
                step="1"
                :value="translatedSettings.byteRules[option.value].fixed"
                @input="updateRuleFixed('translated', option.value, ($event.target as HTMLInputElement).value)"
              />
            </div>
          </fieldset>
        </section>
      </div>

      <p class="saved-note">{{ t("textByte.savedAutomatically") }}</p>

      <div class="dialog-actions">
        <button type="submit">{{ t("common.close") }}</button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.text-byte-settings-dialog {
  width: min(1080px, calc(100vw - 28px));
  max-height: calc(100vh - 28px);
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px;
  color: var(--text);
  background: var(--panel-bg);
  box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
}

.text-byte-settings-dialog h2 {
  margin: 0 0 6px;
  font-size: 16px;
}

.help-text {
  margin: 0;
  border: 1px solid var(--info-border);
  border-radius: 6px;
  padding: 5px 7px;
  color: var(--info-text);
  background: var(--info-bg);
  font-size: 12px;
  line-height: 1.25;
}

.settings-panels {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.settings-panel {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px;
}

.settings-panel h3 {
  margin: 0;
  font-size: 13px;
}

.target-note,
.saved-note {
  margin: 4px 0 0;
  color: var(--text-soft);
  font-size: 12px;
  line-height: 1.25;
}

.option-group,
.byte-rules {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  margin: 7px 0 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 8px;
}

.byte-rules {
  display: grid;
  grid-template-columns: 1fr;
}

.option-group legend,
.byte-rules legend {
  padding: 0 4px;
  color: var(--text);
  font-size: 12px;
  font-weight: 700;
}

.choice-button-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.choice-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 26px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 3px 9px;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 12px;
  line-height: 1.25;
  cursor: pointer;
  user-select: none;
}

.choice-button.active {
  border-color: var(--primary-hover);
  color: var(--on-accent);
  background: var(--primary);
}

.checkbox-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
  font-size: 12px;
}

.fallback-toggle {
  margin: 7px 0 0;
  color: var(--text-soft);
  font-size: 12px;
  line-height: 1.25;
}

.byte-rule {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(168px, 180px) minmax(128px, 136px);
  gap: 5px;
  align-items: center;
  font-size: 12px;
}

.byte-rule.header {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.byte-rule select,
.byte-rule input {
  min-width: 0;
  min-height: 26px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 3px 6px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-size: 12px;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}

.dialog-actions button {
  min-height: 26px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 3px 10px;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 12px;
}

@media (max-width: 760px) {
  .settings-panels {
    grid-template-columns: 1fr;
  }
}
</style>
