<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { t } from "../i18n";

defineProps<{
  canExport: boolean;
  isError?: boolean;
  isExporting: boolean;
  message?: string;
  rowCount: number;
}>();

const emit = defineEmits<{
  browse: [];
  close: [];
  confirm: [];
}>();

const path = defineModel<string>("path", { required: true });
const filteredOnly = defineModel<boolean>("filteredOnly", { required: true });
const extension = defineModel<"txt" | "tbl">("extension", { required: true });
const direction = defineModel<"code_char" | "char_code">("direction", {
  required: true,
});
const newline = defineModel<"crlf" | "lf">("newline", { required: true });
const fileEncoding = defineModel<"utf8" | "utf16le">("fileEncoding", {
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
      class="encoding-export-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="encoding-export-dialog-title"
      @submit.prevent="emit('confirm')"
    >
      <h2 id="encoding-export-dialog-title">{{ t("dialog.exportTbl") }}</h2>
      <p
        class="dialog-inline-message"
        :class="{ 'dialog-inline-error': isError, empty: !message }"
      >
        {{ message || "\u00a0" }}
      </p>
      <label for="encoding-export-path">{{ t("common.path") }}</label>
      <div class="path-picker-row">
        <input
          id="encoding-export-path"
          ref="input"
          v-model="path"
          type="text"
          @keydown.escape="emit('close')"
        />
        <button type="button" @click="emit('browse')">{{ t("common.browse") }}</button>
      </div>

      <p class="export-warning">
        {{ t("dialog.exportTblWarning") }}
      </p>

      <div class="export-options">
        <label class="checkbox-label">
          <input v-model="filteredOnly" type="checkbox" />
          <span>{{ t("dialog.filteredOnly") }}</span>
        </label>

        <label>
          <span>{{ t("dialog.extension") }}</span>
          <select v-model="extension">
            <option value="txt">.txt</option>
            <option value="tbl">.tbl</option>
          </select>
        </label>

        <label>
          <span>{{ t("dialog.lineFormat") }}</span>
          <select v-model="direction">
            <option value="code_char">code=char</option>
            <option value="char_code">char=code</option>
          </select>
        </label>

        <label>
          <span>{{ t("dialog.newline") }}</span>
          <select v-model="newline">
            <option value="crlf">CRLF (Windows)</option>
            <option value="lf">LF (Linux, macOS)</option>
          </select>
        </label>

        <label>
          <span>{{ t("dialog.encoding") }}</span>
          <select v-model="fileEncoding">
            <option value="utf8">UTF-8</option>
            <option value="utf16le">UTF16-LE</option>
          </select>
        </label>
      </div>

      <div class="dialog-actions">
        <button type="button" @click="emit('close')">{{ t("common.cancel") }}</button>
        <button type="submit" :disabled="!canExport || rowCount === 0">
          {{ isExporting ? t("common.saving") : t("common.save") }}
        </button>
      </div>
    </form>
  </div>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(15 23 42 / 45%);
}

.encoding-export-dialog {
  width: min(440px, 100%);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  color: var(--text);
  background: var(--panel-bg);
  box-shadow: 0 18px 45px rgb(15 23 42 / 22%);
}

.encoding-export-dialog h2 {
  margin: 0 0 10px;
  font-size: 16px;
  line-height: 1.2;
}

.dialog-inline-message {
  margin: 0 0 10px;
  border: 1px solid var(--info-border);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--info-text);
  background: var(--info-bg);
  font-size: 12px;
  line-height: 1.35;
}

.dialog-inline-message.dialog-inline-error {
  border-color: var(--danger-border-soft);
  color: var(--danger-text-soft);
  background: var(--danger-bg-soft);
}

.dialog-inline-message.empty {
  border-color: var(--info-border);
  color: transparent;
  background: var(--info-bg);
}

.encoding-export-dialog label {
  display: grid;
  gap: 5px;
  color: var(--text-soft);
  font-size: 12px;
}

.path-picker-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.encoding-export-dialog input[type="text"],
.encoding-export-dialog select {
  width: 100%;
  min-height: 34px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-size: 14px;
}

.encoding-export-dialog input:focus,
.encoding-export-dialog select:focus {
  outline: 2px solid var(--primary);
  outline-offset: -1px;
}

.path-picker-row button,
.dialog-actions button {
  min-height: 30px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 5px 12px;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 13px;
}

.export-warning {
  margin: 10px 0;
  border: 1px solid var(--danger-border-soft);
  border-radius: 6px;
  padding: 7px 8px;
  color: var(--danger-text-soft);
  background: var(--danger-bg-soft);
  font-size: 12px;
  line-height: 1.35;
}

.export-options {
  display: grid;
  gap: 10px;
}

.encoding-export-dialog .checkbox-label {
  display: inline-flex;
  flex-direction: row;
  gap: 6px;
  align-items: center;
  white-space: nowrap;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.dialog-actions button[type="submit"] {
  border-color: var(--primary-hover);
  color: var(--on-accent);
  background: var(--primary);
}

.dialog-actions button:disabled {
  border-color: var(--control-border);
  color: var(--muted);
  background: var(--disabled-bg);
  cursor: not-allowed;
}
</style>
