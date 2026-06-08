<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { t } from "../i18n";
import type { TextMatchMode } from "../types";

export type FindReplaceColumn = {
  key: string;
  label: string;
};

export type FindReplaceScope = "filtered" | "selectedRows" | "selectedCells";

defineProps<{
  columns: FindReplaceColumn[];
  currentMatchIndex: number;
  matchCount: number;
}>();

const emit = defineEmits<{
  close: [];
  findNext: [];
  findPrevious: [];
  replace: [];
  replaceAll: [];
}>();

const query = defineModel<string>("query", { required: true });
const replacement = defineModel<string>("replacement", { required: true });
const selectedColumns = defineModel<string[]>("selectedColumns", { required: true });
const matchMode = defineModel<TextMatchMode>("matchMode", { required: true });
const caseSensitive = defineModel<boolean>("caseSensitive", { required: true });
const scope = defineModel<FindReplaceScope>("scope", { required: true });
const findInput = ref<HTMLInputElement | null>(null);

watch(
  findInput,
  async () => {
    await nextTick();
    findInput.value?.focus();
  },
  { immediate: true },
);

function toggleColumn(columnKey: string) {
  selectedColumns.value = selectedColumns.value.includes(columnKey)
    ? selectedColumns.value.filter((key) => key !== columnKey)
    : [...selectedColumns.value, columnKey];
}
</script>

<template>
  <section class="find-replace-bar" :aria-label="t('find.title')">
    <div class="find-replace-main">
      <label class="find-input">
        <span>{{ t("find.find") }}</span>
        <input
          ref="findInput"
          v-model="query"
          type="search"
          :placeholder="t('find.findPlaceholder')"
          @keydown.enter.prevent="emit('findNext')"
        />
      </label>
      <label class="find-input">
        <span>{{ t("find.replace") }}</span>
        <input
          v-model="replacement"
          type="text"
          :placeholder="t('find.replacePlaceholder')"
          @keydown.enter.prevent="emit('replace')"
        />
      </label>
      <label class="compact-control">
        <span>{{ t("find.match") }}</span>
        <select v-model="matchMode">
          <option value="contains">{{ t("match.contains") }}</option>
          <option value="exact">{{ t("match.exact") }}</option>
        </select>
      </label>
      <label class="compact-control">
        <span>{{ t("find.scope") }}</span>
        <select v-model="scope">
          <option value="filtered">{{ t("find.scopeFiltered") }}</option>
          <option value="selectedRows">{{ t("find.scopeSelectedRows") }}</option>
          <option value="selectedCells">{{ t("find.scopeSelectedCells") }}</option>
        </select>
      </label>
      <label class="case-control">
        <input v-model="caseSensitive" type="checkbox" />
        <span>{{ t("main.caseSensitive") }}</span>
      </label>
      <p class="match-count" aria-live="polite">
        {{ t("find.matches") }}:
        <strong>{{ matchCount }}</strong>
        <span v-if="matchCount > 0">({{ currentMatchIndex + 1 }} / {{ matchCount }})</span>
      </p>
      <button type="button" class="icon-close-btn" :aria-label="t('common.close')" @click="emit('close')">
        ×
      </button>
    </div>

    <div class="find-replace-columns">
      <span class="columns-label">{{ t("find.searchColumns") }}</span>
      <button
        v-for="column in columns"
        :key="column.key"
        type="button"
        class="column-chip"
        :class="{ active: selectedColumns.includes(column.key) }"
        :aria-pressed="selectedColumns.includes(column.key)"
        @click="toggleColumn(column.key)"
      >
        {{ column.label }}
      </button>
    </div>

    <div class="find-replace-actions">
      <button type="button" :disabled="matchCount === 0" @click="emit('findPrevious')">
        {{ t("find.previous") }}
      </button>
      <button type="button" :disabled="matchCount === 0" @click="emit('findNext')">
        {{ t("find.next") }}
      </button>
      <button type="button" :disabled="matchCount === 0" @click="emit('replace')">
        {{ t("find.replace") }}
      </button>
      <button type="button" class="danger-action" :disabled="matchCount === 0" @click="emit('replaceAll')">
        {{ t("find.replaceAll") }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.find-replace-bar {
  display: grid;
  gap: 5px;
  border-block: 1px solid var(--border);
  padding: 5px 8px;
  color: var(--text);
  background: var(--panel-bg);
}

.find-replace-main,
.find-replace-actions,
.find-replace-columns {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: end;
}

.find-input,
.compact-control {
  display: grid;
  gap: 2px;
  color: var(--text-soft);
  font-size: 11px;
}

.find-input {
  flex: 1 1 150px;
  min-width: 140px;
}

.compact-control {
  flex: 0 0 112px;
}

.find-input input,
.compact-control select {
  min-height: 24px;
  border: 1px solid var(--control-border);
  border-radius: 5px;
  padding: 3px 7px;
  color: var(--input-text);
  background: var(--input-bg);
  font-size: 12px;
}

.case-control {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  min-height: 24px;
  color: var(--text);
  font-size: 12px;
}

.case-control input {
  accent-color: var(--primary);
}

.match-count {
  min-width: 104px;
  margin: 0;
  color: var(--text-soft);
  font-size: 12px;
  line-height: 24px;
}

.icon-close-btn {
  width: 24px;
  min-height: 24px;
  border: 1px solid var(--control-border);
  border-radius: 5px;
  margin-left: auto;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 16px;
  line-height: 1;
}

.columns-label {
  color: var(--text-soft);
  font-size: 11px;
  line-height: 24px;
}

.column-chip {
  min-height: 24px;
  border: 1px solid var(--control-border);
  border-radius: 5px;
  padding: 3px 8px;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 11px;
}

.column-chip.active {
  border-color: var(--primary-hover);
  color: var(--on-accent);
  background: var(--primary);
}

.find-replace-actions button {
  min-height: 24px;
  border: 1px solid var(--control-border);
  border-radius: 5px;
  padding: 3px 8px;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 12px;
}

.find-replace-actions button:not(:disabled):hover,
.column-chip:hover,
.icon-close-btn:hover {
  border-color: var(--primary-hover);
}

.find-replace-actions .danger-action {
  border-color: var(--danger);
  color: var(--danger);
}

.find-replace-actions button:disabled {
  color: var(--muted);
  background: var(--disabled-bg);
  cursor: not-allowed;
}
</style>
