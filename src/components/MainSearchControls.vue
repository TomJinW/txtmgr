<script setup lang="ts">
import { nextTick, ref } from "vue";
import { t } from "../i18n";
import type { StateValue, StatFilter, TextMatchMode, TextSearchKey } from "../types";

defineProps<{
  displayedMessage: string;
  errorMessage: string;
  filteredRowsLength: number;
  goToMaxRow?: number;
  hasActiveRowFilter: boolean;
  hasActiveStatFilters: () => boolean;
  isStatFilterActive: (filter: StatFilter) => boolean;
  rowStats: {
    duplicateTitleAddresses: number;
    emptyTranslations: number;
    notTranslated: number;
    originalEqualsTranslated: number;
    rowsWithNotes: number;
    stateCounts: Record<StateValue, number>;
    total: number;
  };
  rowsLength: number;
  stateOptions: StateValue[];
  textSearchColumns: { key: TextSearchKey; label: string }[];
}>();

const emit = defineEmits<{
  clearRowFilter: [];
  clearStatFilters: [];
  goToRow: [];
  toggleStatFilter: [filter: StatFilter];
}>();

const searchText = defineModel<string>("searchText", { required: true });
const textMatchMode = defineModel<TextMatchMode>("textMatchMode", { required: true });
const isCaseSensitiveSearch = defineModel<boolean>("isCaseSensitiveSearch", {
  required: true,
});
const searchLengthColumn = defineModel<TextSearchKey>("searchLengthColumn", {
  required: true,
});
const searchLengthMin = defineModel<string>("searchLengthMin", { required: true });
const searchLengthMax = defineModel<string>("searchLengthMax", { required: true });
const selectedSearchColumns = defineModel<TextSearchKey[]>("selectedSearchColumns", {
  required: true,
});
const rowFilterStart = defineModel<string>("rowFilterStart", { required: true });
const rowFilterEnd = defineModel<string>("rowFilterEnd", { required: true });
const goToRowValue = defineModel<string>("goToRowValue", { required: true });

const searchInput = ref<HTMLInputElement | null>(null);

function focusSearchInput() {
  nextTick(() => {
    searchInput.value?.focus();
    searchInput.value?.select();
  });
}

defineExpose({ focusSearchInput });
</script>

<template>
  <div class="search-panel" aria-label="Search filters">
    <div class="search-summary-row">
      <div class="filter-group text-search-group">
        <span class="filter-group-label"></span>
        <input
          ref="searchInput"
          v-model="searchText"
          type="search"
          :placeholder="t('common.searchText')"
          :aria-label="t('common.searchText')"
        />
        <select v-model="textMatchMode" aria-label="Text match mode">
          <option value="contains">{{ t("match.contains") }}</option>
          <option value="exact">{{ t("match.exact") }}</option>
        </select>
        <label class="checkbox-label case-checkbox">
          <input v-model="isCaseSensitiveSearch" type="checkbox" />
          <span>{{ t("main.caseSensitive") }}</span>
        </label>
      </div>

      <div class="filter-group length-filter-group">
        <span class="filter-group-label">{{ t("main.length") }}</span>
        <select v-model="searchLengthColumn" aria-label="String length column">
          <option
            v-for="column in textSearchColumns"
            :key="column.key"
            :value="column.key"
          >
            {{ column.label }}
          </option>
        </select>
        <input
          v-model="searchLengthMin"
          type="text"
          inputmode="numeric"
          aria-label="Minimum string length"
          :placeholder="t('main.min')"
        />
        <span class="range-separator">{{ t("main.to") }}</span>
        <input
          v-model="searchLengthMax"
          type="text"
          inputmode="numeric"
          aria-label="Maximum string length"
          :placeholder="t('main.max')"
        />
      </div>
    </div>

    <div class="search-columns" aria-label="Search columns">
      <label
        v-for="column in textSearchColumns"
        :key="column.key"
        class="checkbox-label"
      >
        <input
          v-model="selectedSearchColumns"
          type="checkbox"
          :value="column.key"
        />
        <span>{{ column.label }}</span>
      </label>
    </div>

    <div class="stats-panel" aria-label="Status filters">
      <span class="filter-group-label">{{ t("main.statusFilters") }}</span>
      <div class="stats-list">
        <button
          type="button"
          :class="{ active: !hasActiveStatFilters() }"
          @click="emit('clearStatFilters')"
        >
          {{ t("common.all") }} {{ rowStats.total }}
        </button>
        <button
          v-for="state in stateOptions"
          :key="state"
          type="button"
          :class="{ active: isStatFilterActive({ type: 'state', state }) }"
          @click="emit('toggleStatFilter', { type: 'state', state })"
        >
          {{ state }} {{ rowStats.stateCounts[state] }}
        </button>
        <button
          type="button"
          :class="{ active: isStatFilterActive({ type: 'empty_translation' }) }"
          @click="emit('toggleStatFilter', { type: 'empty_translation' })"
        >
          {{ t("main.emptyTranslation") }} {{ rowStats.emptyTranslations }}
        </button>
        <button
          type="button"
          :class="{ active: isStatFilterActive({ type: 'not_translated' }) }"
          @click="emit('toggleStatFilter', { type: 'not_translated' })"
        >
          {{ t("main.originalEqualsTranslated") }} {{ rowStats.notTranslated }}
        </button>
        <button
          type="button"
          :class="{ active: isStatFilterActive({ type: 'original_equals_translated' }) }"
          @click="emit('toggleStatFilter', { type: 'original_equals_translated' })"
        >
          {{ t("main.originalNotEqualsTranslated") }} {{ rowStats.originalEqualsTranslated }}
        </button>
        <button
          type="button"
          :class="{ active: isStatFilterActive({ type: 'has_note' }) }"
          @click="emit('toggleStatFilter', { type: 'has_note' })"
        >
          {{ t("main.hasNote") }} {{ rowStats.rowsWithNotes }}
        </button>
        <button
          type="button"
          :class="{ active: isStatFilterActive({ type: 'duplicate_title_addr' }) }"
          @click="emit('toggleStatFilter', { type: 'duplicate_title_addr' })"
        >
          {{ t("main.duplicateTitleAddr") }} {{ rowStats.duplicateTitleAddresses }}
        </button>
      </div>
    </div>
  </div>

  <div class="message-tools-row">
    <p
      class="message-slot"
      :class="{
        'error-message': errorMessage,
        'status-message': !errorMessage && displayedMessage,
        empty: !displayedMessage,
      }"
    >
      {{ displayedMessage || "\u00a0" }}
    </p>
    <div class="secondary-actions">
      <div class="row-range-filter" aria-label="Filter row range">
        <span>{{ t("main.rows") }}</span>
        <input
          v-model="rowFilterStart"
          type="text"
          inputmode="numeric"
          aria-label="Filter from row"
          :placeholder="t('main.min')"
        />
        <span>{{ t("main.to") }}</span>
        <input
          v-model="rowFilterEnd"
          type="text"
          inputmode="numeric"
          aria-label="Filter to row"
          :placeholder="t('main.max')"
        />
        <button type="button" :disabled="!hasActiveRowFilter" @click="emit('clearRowFilter')">
          {{ t("common.clear") }}
        </button>
      </div>
      <form class="go-to-row" aria-label="Go to row" @submit.prevent="emit('goToRow')">
        <label for="go-to-row-input">{{ t("main.goToRow") }}</label>
        <input
          id="go-to-row-input"
          v-model="goToRowValue"
          type="number"
          min="1"
          :max="goToMaxRow || undefined"
          inputmode="numeric"
        />
        <button type="submit" :disabled="rowsLength === 0">{{ t("main.go") }}</button>
      </form>
    </div>
  </div>
</template>
