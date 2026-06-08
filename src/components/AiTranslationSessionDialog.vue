<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { t } from "../i18n";

export type AiTranslationTaskStatus =
  | "pending"
  | "running"
  | "done"
  | "warning"
  | "error"
  | "cancelled"
  | "skipped"
  | "applied"
  | "rejected";

// This "session" is a review buffer for generated candidates. Applying selected
// rows is explicit so failed/stopped translations never silently modify data.
export type AiTranslationTask = {
  id: string;
  rowIndex: number;
  titleAddr: string;
  fileName: string;
  originalText: string;
  existingTranslation: string;
  candidateTranslation: string;
  candidateNote: string;
  status: AiTranslationTaskStatus;
  message: string;
};

export type AiTranslationSession = {
  id: string;
  createdAt: string;
  sourceLanguage: string;
  targetLanguage: string;
  promptTemplate: string;
  attachmentPath: string;
  tasks: AiTranslationTask[];
};

const props = defineProps<{
  selectedTaskIds: string[];
  message: string;
  session: AiTranslationSession;
  updateStateOnApply: boolean;
}>();

const emit = defineEmits<{
  applySelected: [];
  applySelectedToAiOutput: [];
  close: [];
  discard: [];
  selectAll: [];
  toggleTask: [taskId: string];
  updateStateOnApply: [value: boolean];
}>();

const statusCounts = computed(() => {
  const counts: Record<AiTranslationTaskStatus, number> = {
    applied: 0,
    cancelled: 0,
    done: 0,
    error: 0,
    pending: 0,
    rejected: 0,
    running: 0,
    skipped: 0,
    warning: 0,
  };

  props.session.tasks.forEach((task) => {
    counts[task.status] += 1;
  });
  return counts;
});
const renderedTaskCount = ref(0);
const visibleTasks = computed(() => props.session.tasks.slice(0, renderedTaskCount.value));
const isLoadingTaskRows = computed(
  () => renderedTaskCount.value < props.session.tasks.length,
);
const selectedTaskIdSet = computed(() => new Set(props.selectedTaskIds));
const selectableTasks = computed(() =>
  props.session.tasks.filter((task) => task.status === "done" || task.status === "warning"),
);
let taskRenderFrame: number | undefined;

onMounted(() => {
  window.addEventListener("keydown", handleDialogKeydown);
  startTaskRendering();
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleDialogKeydown);
  if (taskRenderFrame !== undefined) {
    window.cancelAnimationFrame(taskRenderFrame);
  }
});

watch(
  () => props.session.id,
  () => {
    startTaskRendering();
  },
);

function handleDialogKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  event.preventDefault();
  emit("close");
}

async function startTaskRendering() {
  if (taskRenderFrame !== undefined) {
    window.cancelAnimationFrame(taskRenderFrame);
  }

  renderedTaskCount.value = Math.min(100, props.session.tasks.length);
  await nextTick();
  renderMoreTasks();
}

function renderMoreTasks() {
  if (renderedTaskCount.value >= props.session.tasks.length) return;

  taskRenderFrame = window.requestAnimationFrame(() => {
    renderedTaskCount.value = Math.min(
      renderedTaskCount.value + 250,
      props.session.tasks.length,
    );
    renderMoreTasks();
  });
}

function newlineHintParts(value: string) {
  return value.split("\n");
}
</script>

<template>
  <div class="dialog-backdrop" role="presentation">
    <section
      class="translation-session-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="translation-session-title"
    >
      <header class="dialog-header">
        <h2 id="translation-session-title">{{ t("ai.translationResult") }}</h2>
        <p>{{ session.sourceLanguage }} → {{ session.targetLanguage }}</p>
      </header>

      <p class="dialog-message">{{ message || t("common.ready") }}</p>

      <div v-if="isLoadingTaskRows" class="loading-row" role="status">
        <div class="loading-track">
          <div class="loading-fill" />
        </div>
        <span>{{ t("ai.loadingTaskRows") }} {{ renderedTaskCount }} / {{ session.tasks.length }}</span>
      </div>

      <div class="summary-grid" aria-label="Translation result summary">
        <div>
          <span>{{ t("ai.total") }}</span>
          <strong>{{ session.tasks.length }}</strong>
        </div>
        <div>
          <span>{{ t("ai.done") }}</span>
          <strong>{{ statusCounts.done }}</strong>
        </div>
        <div>
          <span>{{ t("ai.errors") }}</span>
          <strong>{{ statusCounts.error }}</strong>
        </div>
        <div>
          <span>{{ t("ai.applied") }}</span>
          <strong>{{ statusCounts.applied }}</strong>
        </div>
      </div>

      <div class="session-actions">
        <button type="button" :disabled="selectableTasks.length === 0" @click="emit('selectAll')">
          {{ t("ai.selectAll") }}
        </button>
        <label class="state-apply-toggle">
          <input
            type="checkbox"
            :checked="updateStateOnApply"
            @change="emit('updateStateOnApply', ($event.currentTarget as HTMLInputElement).checked)"
          />
          <span>{{ t("ai.setStateToTemp") }}</span>
        </label>
        <button
          type="button"
          :disabled="selectedTaskIds.length === 0"
          @click="emit('applySelected')"
        >
          {{ t("ai.applySelected") }} {{ selectedTaskIds.length > 0 ? selectedTaskIds.length : "" }}
        </button>
        <button
          type="button"
          :disabled="selectedTaskIds.length === 0"
          @click="emit('applySelectedToAiOutput')"
        >
          {{ t("ai.applySelectedToAiOutput") }} {{ selectedTaskIds.length > 0 ? selectedTaskIds.length : "" }}
        </button>
        <button class="danger-btn" type="button" @click="emit('discard')">
          {{ t("ai.discardResult") }}
        </button>
        <button type="button" @click="emit('close')">{{ t("common.close") }}</button>
      </div>

      <div class="task-table" role="table" aria-label="Translation tasks">
        <div class="task-row task-header" role="row">
          <span role="columnheader">{{ t("common.selected") }}</span>
          <span role="columnheader">{{ t("main.rows") }}</span>
          <span role="columnheader">{{ t("ai.status") }}</span>
          <span role="columnheader">{{ t("ai.label") }}</span>
          <span role="columnheader">{{ t("ai.original") }}</span>
          <span role="columnheader">{{ t("ai.candidate") }}</span>
        </div>
        <div v-for="task in visibleTasks" :key="task.id" class="task-row" role="row">
          <span role="cell">
            <input
              type="checkbox"
              :checked="selectedTaskIdSet.has(task.id)"
              :disabled="task.status !== 'done' && task.status !== 'warning'"
              :aria-label="`Select result row ${task.rowIndex + 1}`"
              @change="emit('toggleTask', task.id)"
            />
          </span>
          <span role="cell">{{ task.rowIndex + 1 }}</span>
          <span role="cell">{{ task.status }}</span>
          <span role="cell">{{ task.titleAddr || task.fileName || "-" }}</span>
          <span class="multiline-cell" role="cell">
            <template
              v-for="(line, lineIndex) in newlineHintParts(task.originalText)"
              :key="lineIndex"
            >
              <span class="cell-line">{{ line || " " }}</span>
              <span
                v-if="lineIndex < newlineHintParts(task.originalText).length - 1"
                class="newline-marker"
              >
                ↵
              </span>
              <br v-if="lineIndex < newlineHintParts(task.originalText).length - 1" />
            </template>
          </span>
          <span class="multiline-cell" role="cell">
            <template
              v-for="(line, lineIndex) in newlineHintParts(task.candidateTranslation || task.message || '-')"
              :key="lineIndex"
            >
              <span class="cell-line">{{ line || " " }}</span>
              <span
                v-if="lineIndex < newlineHintParts(task.candidateTranslation || task.message || '-').length - 1"
                class="newline-marker"
              >
                ↵
              </span>
              <br
                v-if="lineIndex < newlineHintParts(task.candidateTranslation || task.message || '-').length - 1"
              />
            </template>
          </span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.translation-session-dialog {
  width: min(1040px, calc(100vw - 28px));
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

.dialog-header p {
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

.loading-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0 0 12px;
  color: var(--text-soft);
  font-size: 12px;
}

.loading-track {
  flex: 1 1 auto;
  height: 8px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--disabled-bg);
}

.loading-fill {
  width: 45%;
  height: 100%;
  border-radius: inherit;
  background: var(--primary);
  animation: loading-pulse 900ms ease-in-out infinite alternate;
}

@keyframes loading-pulse {
  from {
    transform: translateX(-30%);
  }

  to {
    transform: translateX(150%);
  }
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

.summary-grid span {
  color: var(--text-soft);
  font-size: 11px;
}

.summary-grid strong {
  font-size: 18px;
}

.session-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.session-actions button {
  min-height: 30px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 5px 10px;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 13px;
}

.state-apply-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 30px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 5px 9px;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 13px;
  white-space: nowrap;
}

.state-apply-toggle input {
  margin: 0;
}

.session-actions .danger-btn {
  border-color: var(--danger-hover);
  color: var(--on-danger);
  background: var(--danger);
}

.session-actions button:disabled {
  color: var(--muted);
  background: var(--disabled-bg);
  cursor: not-allowed;
}

.task-table {
  margin-top: 12px;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 6px;
}

.task-row {
  display: grid;
  grid-template-columns: 64px 64px 96px minmax(120px, 180px) minmax(220px, 1fr) minmax(220px, 1fr);
  min-width: 884px;
  border-top: 1px solid var(--border);
}

.task-row:first-child {
  border-top: 0;
}

.task-row span {
  min-width: 0;
  overflow: hidden;
  padding: 7px 8px;
  border-left: 1px solid var(--border);
  font-size: 12px;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-row .multiline-cell {
  max-height: 96px;
  overflow: auto;
  text-overflow: clip;
  white-space: normal;
}

.task-row .multiline-cell .cell-line,
.task-row .multiline-cell .newline-marker {
  display: inline;
  overflow: visible;
  padding: 0;
  border-left: 0;
  text-overflow: clip;
  white-space: pre-wrap;
}

.newline-marker {
  margin-left: 3px;
  color: var(--muted);
  font-size: 11px;
  user-select: none;
}

.task-row span:first-child {
  border-left: 0;
}

.task-header {
  position: sticky;
  top: 0;
  z-index: 1;
  color: var(--text-soft);
  background: var(--header-bg);
  font-weight: 700;
}

@media (max-width: 760px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
