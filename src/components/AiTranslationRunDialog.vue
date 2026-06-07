<script setup lang="ts">
import { computed } from "vue";
import { t } from "../i18n";

const props = defineProps<{
  completedCount: number;
  currentOriginalText: string;
  currentTranslatedText: string;
  errorCount: number;
  isStopping: boolean;
  message: string;
  totalCount: number;
}>();

const emit = defineEmits<{
  stop: [];
}>();

const pendingCount = computed(() =>
  Math.max(0, props.totalCount - props.completedCount),
);
</script>

<template>
  <div class="dialog-backdrop" role="presentation">
    <section
      class="translation-run-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="translation-run-title"
    >
      <header class="dialog-header">
        <h2 id="translation-run-title">{{ t("ai.translating") }}</h2>
        <p>{{ message || t("ai.runningTranslation") }}</p>
      </header>

      <div class="summary-grid" aria-label="Translation progress summary">
        <div>
          <span>{{ t("ai.total") }}</span>
          <strong>{{ totalCount }}</strong>
        </div>
        <div>
          <span>{{ t("ai.done") }}</span>
          <strong>{{ completedCount }}</strong>
        </div>
        <div>
          <span>{{ t("ai.pending") }}</span>
          <strong>{{ pendingCount }}</strong>
        </div>
        <div>
          <span>{{ t("ai.errors") }}</span>
          <strong>{{ errorCount }}</strong>
        </div>
      </div>

      <div class="progress-row" role="progressbar" aria-label="Translation progress">
        <div class="progress-track">
          <div
            class="progress-fill"
            :style="{ width: totalCount === 0 ? '0%' : `${(completedCount / totalCount) * 100}%` }"
          />
        </div>
        <span>{{ completedCount }} / {{ totalCount }}</span>
      </div>

      <section class="text-preview-grid" aria-label="Current translation preview">
        <div>
          <span>{{ t("ai.original") }}</span>
          <p>{{ currentOriginalText || t("ai.waitingForRow") }}</p>
        </div>
        <div>
          <span>{{ t("ai.translatedPreview") }}</span>
          <p>{{ currentTranslatedText || t("ai.waitingForPreview") }}</p>
        </div>
      </section>

      <div class="dialog-actions">
        <button type="button" :disabled="isStopping" @click="emit('stop')">
          {{ isStopping ? t("common.stopping") : t("common.stop") }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.translation-run-dialog {
  width: min(900px, calc(100vw - 28px));
  height: min(560px, calc(100vh - 28px));
  overflow: hidden;
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

.dialog-header p {
  color: var(--text-soft);
  font-size: 12px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.summary-grid div {
  display: grid;
  gap: 4px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px;
  background: var(--panel-bg);
}

.summary-grid span,
.text-preview-grid span {
  color: var(--text-soft);
  font-size: 12px;
}

.summary-grid strong {
  font-size: 18px;
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

.text-preview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.text-preview-grid div {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 6px;
  height: 260px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px;
  background: var(--panel-bg);
}

.text-preview-grid p {
  margin: 0;
  overflow: auto;
  font-size: 13px;
  line-height: 1.35;
  white-space: pre-wrap;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.dialog-actions button {
  min-height: 30px;
  border: 1px solid var(--danger-hover);
  border-radius: 6px;
  padding: 5px 12px;
  color: var(--on-danger);
  background: var(--danger);
  font-size: 13px;
}

.dialog-actions button:disabled {
  color: var(--muted);
  background: var(--disabled-bg);
  cursor: not-allowed;
}

@media (max-width: 700px) {
  .summary-grid,
  .text-preview-grid {
    grid-template-columns: 1fr;
  }
}
</style>
