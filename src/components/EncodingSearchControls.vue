<script setup lang="ts">
import { nextTick, ref } from "vue";
import { t } from "../i18n";
import type { EncodingRow } from "../types";

type EncodingFilter =
  | "duplicate_character"
  | "duplicate_code"
  | "empty_character"
  | "empty_code"
  | "punctuation"
  | "han"
  | "kana"
  | "hangul"
  | "latin"
  | "special";

defineProps<{
  activeFilters: EncodingFilter[];
  displayedMessage: string;
  errorMessage: string;
  filterCounts: Record<EncodingFilter, number>;
  filterLabel: (filter: EncodingFilter) => string;
  filterOptions: EncodingFilter[];
  filteredRowsLength: number;
  goToMaxRow?: number;
  hasActiveRowFilter: boolean;
  rowsLength: number;
  searchableColumns: (keyof EncodingRow)[];
}>();

const emit = defineEmits<{
  clearFilters: [];
  clearRowFilter: [];
  goToRow: [];
  toggleFilter: [filter: EncodingFilter];
}>();

const searchText = defineModel<string>("searchText", { required: true });
const isCaseSensitiveSearch = defineModel<boolean>("isCaseSensitiveSearch", {
  required: true,
});
const selectedSearchColumns = defineModel<(keyof EncodingRow)[]>("selectedSearchColumns", {
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
        <label class="checkbox-label case-checkbox">
          <input v-model="isCaseSensitiveSearch" type="checkbox" />
          <span>{{ t("main.caseSensitive") }}</span>
        </label>
      </div>
      <span class="result-count">
        {{ filteredRowsLength }} / {{ rowsLength }}
      </span>
    </div>

    <div class="search-columns" aria-label="Search columns">
      <label
        v-for="column in searchableColumns"
        :key="column"
        class="checkbox-label"
      >
        <input
          v-model="selectedSearchColumns"
          type="checkbox"
          :value="column"
        />
        <span>{{ column }}</span>
      </label>
    </div>

    <div class="stats-panel">
      <div class="stats-list">
        <button
          type="button"
          :class="{ active: activeFilters.length === 0 }"
          @click="emit('clearFilters')"
        >
          {{ t("common.all") }} {{ rowsLength }}
        </button>
        <button
          v-for="filter in filterOptions"
          :key="filter"
          type="button"
          :class="{ active: activeFilters.includes(filter) }"
          @click="emit('toggleFilter', filter)"
        >
          {{ filterLabel(filter) }} {{ filterCounts[filter] }}
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
        <label for="encoding-go-to-row">{{ t("main.goToRow") }}</label>
        <input
          id="encoding-go-to-row"
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
