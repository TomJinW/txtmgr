<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { confirm, save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

type StateValue = "❓unmarked" | "✅passed" | "⚠️warning" | "❌error";

type SentenceRow = {
  title_addr: string;
  original_text: string;
  translated_text: string;
  note: string;
  state: StateValue;
  file_name: string;
};

type SentenceInput = {
  Sentence?: Partial<Record<keyof SentenceRow, unknown>>;
};

type StoredDraft = {
  fileName: string;
  rows: SentenceRow[];
};

type TextSearchKey =
  | "title_addr"
  | "original_text"
  | "translated_text"
  | "note"
  | "file_name";

const draftStorageKey = "txtmgr.currentDraft.v1";
const columnFontSizeStorageKey = "txtmgr.columnFontSizes.v1";
const columnWidthStorageKey = "txtmgr.columnWidths.v1";
const defaultColumnFontSizes = [10, 14, 14, 14, 14, 14, 14];
const defaultColumnWidths = [112, 180, 280, 280, 220, 140, 180];
const minColumnWidths = [104, 90, 90, 90, 90, 90, 90];
const estimatedRowHeight = 72;
const virtualOverscanRows = 12;
const stateOptions: StateValue[] = ["❓unmarked", "✅passed", "⚠️warning", "❌error"];

const columns = [
  { key: "row_number", label: "#" },
  { key: "title_addr", label: "title_addr" },
  { key: "original_text", label: "original_text" },
  { key: "translated_text", label: "translated_text" },
  { key: "note", label: "note" },
  { key: "state", label: "state" },
  { key: "file_name", label: "file_name" },
] as const;

const textSearchColumns: { key: TextSearchKey; label: string }[] = [
  { key: "title_addr", label: "title_addr" },
  { key: "original_text", label: "original_text" },
  { key: "translated_text", label: "translated_text" },
  { key: "note", label: "note" },
  { key: "file_name", label: "file_name" },
];

const columnWidths = ref(restoreColumnWidths());
const columnFontSizes = ref(restoreColumnFontSizes());
const rows = ref<SentenceRow[]>([]);
const fileName = ref("");
const errorMessage = ref("");
const statusMessage = ref("");
const isSaving = ref(false);
const searchText = ref("");
const stateFilter = ref<"" | StateValue>("");
const pendingDeleteIndex = ref<number | null>(null);
const tableWrap = ref<HTMLElement | null>(null);
const tableScrollTop = ref(0);
const tableViewportHeight = ref(600);
const rowHeights = ref<Record<number, number>>({});
const selectedSearchColumns = ref<TextSearchKey[]>(
  textSearchColumns.map((column) => column.key),
);
const fileInput = ref<HTMLInputElement | null>(null);
let autoSaveTimer: number | undefined;
let columnWidthSaveTimer: number | undefined;
const rowResizeObservers = new Map<number, ResizeObserver>();

const gridTemplateColumns = computed(() =>
  columnWidths.value.map((width) => `${width}px`).join(" "),
);

const canSaveJson = computed(() => rows.value.length > 0 && !isSaving.value);

const filteredRows = computed(() => {
  const query = searchText.value.trim().toLowerCase();
  const searchableColumns = selectedSearchColumns.value;

  return rows.value
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      const matchesText =
        query === "" ||
        searchableColumns.some((key) =>
          row[key].toLowerCase().includes(query),
        );
      const matchesState =
        stateFilter.value === "" || row.state === stateFilter.value;

      return matchesText && matchesState;
    });
});

const virtualRange = computed(() => {
  const items = filteredRows.value;
  const scrollTop = tableScrollTop.value;
  const viewportBottom = scrollTop + tableViewportHeight.value;
  let offset = 0;
  let start = 0;

  while (start < items.length) {
    const height = rowHeight(items[start].index);
    if (offset + height >= scrollTop) break;
    offset += height;
    start += 1;
  }

  start = Math.max(0, start - virtualOverscanRows);
  const topPadding = sumRowHeights(items, 0, start);

  let end = start;
  let renderedHeight = topPadding;
  const overscanBottom = viewportBottom + estimatedRowHeight * virtualOverscanRows;

  while (end < items.length && renderedHeight < overscanBottom) {
    renderedHeight += rowHeight(items[end].index);
    end += 1;
  }

  const totalHeight = sumRowHeights(items, 0, items.length);
  const bottomPadding = Math.max(0, totalHeight - renderedHeight);

  return {
    bottomPadding,
    end,
    start,
    topPadding,
  };
});

const renderedRows = computed(() =>
  filteredRows.value.slice(virtualRange.value.start, virtualRange.value.end),
);

restoreDraft();

watch(
  () => ({ fileName: fileName.value, rows: rows.value }),
  () => {
    queuePersistDraft();
  },
  { deep: true },
);

watch(
  columnWidths,
  () => {
    queuePersistColumnWidths();
  },
  { deep: true },
);

watch(
  () => [
    searchText.value,
    stateFilter.value,
    selectedSearchColumns.value.join("|"),
    rows.value.length,
  ],
  async () => {
    tableScrollTop.value = 0;
    if (tableWrap.value) {
      tableWrap.value.scrollTop = 0;
    }
    await nextTick();
    updateTableViewport();
  },
);

onBeforeUnmount(() => {
  rowResizeObservers.forEach((observer) => observer.disconnect());
  rowResizeObservers.clear();
});

function openFilePicker() {
  fileInput.value?.click();
}

async function saveJsonFile() {
  if (!canSaveJson.value) return;

  try {
    errorMessage.value = "";
    statusMessage.value = "";
    isSaving.value = true;

    const path = await save({
      title: "Save JSON",
      defaultPath: fileName.value || "sentences.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    });

    if (!path) return;

    await writeTextFile(path, serializeRows());
    statusMessage.value = "JSON saved.";
  } catch (error) {
    errorMessage.value = formatError(error, "Failed to save JSON file.");
  } finally {
    isSaving.value = false;
  }
}

async function loadJsonFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    errorMessage.value = "";
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error("JSON root must be an array.");
    }

    rows.value = parsed.map(normalizeSentence);
    fileName.value = file.name;
    statusMessage.value = "Loaded and auto-saved.";
  } catch (error) {
    rows.value = [];
    fileName.value = "";
    statusMessage.value = "";
    errorMessage.value = formatError(error, "Failed to read JSON file.");
  } finally {
    input.value = "";
  }
}

function normalizeSentence(item: unknown): SentenceRow {
  const sentence = (item as SentenceInput)?.Sentence ?? {};

  return {
    title_addr: toText(sentence.title_addr),
    original_text: toText(sentence.original_text),
    translated_text: toText(sentence.translated_text),
    note: toText(sentence.note),
    state: normalizeState(sentence.state),
    file_name: toText(sentence.file_name),
  };
}

function normalizeStoredRow(item: unknown): SentenceRow {
  const row = item as Partial<Record<keyof SentenceRow, unknown>>;

  if ((item as SentenceInput)?.Sentence) {
    return normalizeSentence(item);
  }

  return {
    title_addr: toText(row.title_addr),
    original_text: toText(row.original_text),
    translated_text: toText(row.translated_text),
    note: toText(row.note),
    state: normalizeState(row.state),
    file_name: toText(row.file_name),
  };
}

function createEmptyRow(): SentenceRow {
  return {
    title_addr: "",
    original_text: "",
    translated_text: "",
    note: "",
    state: "❓unmarked",
    file_name: "",
  };
}

function addRowAfter(rowIndex: number) {
  rows.value.splice(rowIndex + 1, 0, createEmptyRow());
  if (pendingDeleteIndex.value !== null && pendingDeleteIndex.value > rowIndex) {
    pendingDeleteIndex.value += 1;
  }
}

function addRowAtEnd() {
  rows.value.push(createEmptyRow());
}

async function clearRows() {
  if (rows.value.length === 0) return;

  const confirmed = await confirm(
    "Clear the entire list? This cannot be undone.",
    {
      title: "Clear List",
      kind: "warning",
    },
  );

  if (!confirmed) return;

  rows.value = [];
  pendingDeleteIndex.value = null;
  statusMessage.value = "List cleared.";
}

function requestDeleteRow(rowIndex: number) {
  pendingDeleteIndex.value = rowIndex;
}

function cancelDeleteRow() {
  pendingDeleteIndex.value = null;
}

function confirmDeleteRow(rowIndex: number) {
  rows.value.splice(rowIndex, 1);
  pendingDeleteIndex.value = null;
}

function rowHeight(rowIndex: number) {
  return rowHeights.value[rowIndex] ?? estimatedRowHeight;
}

function sumRowHeights(
  items: { row: SentenceRow; index: number }[],
  start: number,
  end: number,
) {
  let total = 0;
  for (let index = start; index < end; index += 1) {
    total += rowHeight(items[index].index);
  }
  return total;
}

function handleTableScroll(event: Event) {
  const target = event.currentTarget as HTMLElement;
  tableScrollTop.value = target.scrollTop;
  tableViewportHeight.value = target.clientHeight;
}

function updateTableViewport() {
  if (!tableWrap.value) return;
  tableScrollTop.value = tableWrap.value.scrollTop;
  tableViewportHeight.value = tableWrap.value.clientHeight;
}

function setVirtualRowElement(element: unknown, rowIndex: number) {
  const existingObserver = rowResizeObservers.get(rowIndex);
  if (existingObserver) {
    existingObserver.disconnect();
    rowResizeObservers.delete(rowIndex);
  }

  if (!(element instanceof HTMLElement)) return;

  const updateHeight = () => {
    const nextHeight = Math.ceil(element.getBoundingClientRect().height);
    if (nextHeight <= 0 || rowHeights.value[rowIndex] === nextHeight) return;

    rowHeights.value = {
      ...rowHeights.value,
      [rowIndex]: nextHeight,
    };
  };

  updateHeight();

  const observer = new ResizeObserver(updateHeight);
  observer.observe(element);
  rowResizeObservers.set(rowIndex, observer);
}

function toText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeState(value: unknown): StateValue {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  const exactState = stateOptions.find((state) => state.toLowerCase() === normalized);
  if (exactState) return exactState;

  const plainState = stateOptions.find((state) =>
    state.toLowerCase().endsWith(normalized),
  );

  return plainState ?? "❓unmarked";
}

function serializeRows() {
  const output = rows.value.map((row) => ({
    Sentence: {
      title_addr: row.title_addr,
      original_text: row.original_text,
      translated_text: row.translated_text,
      note: row.note,
      state: row.state,
      file_name: row.file_name,
    },
  }));

  return `${JSON.stringify(output, null, 2)}\n`;
}

function queuePersistDraft() {
  window.clearTimeout(autoSaveTimer);
  autoSaveTimer = window.setTimeout(() => {
    persistDraft();
  }, 250);
}

function persistDraft() {
  try {
    if (rows.value.length === 0 && fileName.value === "") {
      window.localStorage.removeItem(draftStorageKey);
      return;
    }

    const draft: StoredDraft = {
      fileName: fileName.value,
      rows: rows.value,
    };

    window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    statusMessage.value = "Auto-saved locally.";
  } catch (error) {
    errorMessage.value = formatError(error, "Failed to auto-save locally.");
  }
}

function formatError(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function newlineHintParts(value: string) {
  return value.split("\n");
}

function columnFontStyle(columnIndex: number) {
  return {
    fontSize: `${columnFontSizes.value[columnIndex]}px`,
  };
}

function adjustColumnFontSize(columnIndex: number, delta: number) {
  if (columnIndex === 0) return;

  const currentSize = columnFontSizes.value[columnIndex];
  columnFontSizes.value[columnIndex] = Math.min(
    40,
    Math.max(8, currentSize + delta),
  );
  persistColumnFontSizes();
}

function persistColumnFontSizes() {
  window.localStorage.setItem(
    columnFontSizeStorageKey,
    JSON.stringify(columnFontSizes.value),
  );
}

function persistColumnWidths() {
  window.clearTimeout(columnWidthSaveTimer);
  window.localStorage.setItem(
    columnWidthStorageKey,
    JSON.stringify(columnWidths.value.map((width) => Math.round(width))),
  );
}

function queuePersistColumnWidths() {
  window.clearTimeout(columnWidthSaveTimer);
  columnWidthSaveTimer = window.setTimeout(() => {
    persistColumnWidths();
  }, 150);
}

function restoreColumnWidths() {
  try {
    const rawWidths = window.localStorage.getItem(columnWidthStorageKey);
    if (!rawWidths) return [...defaultColumnWidths];

    const parsed = JSON.parse(rawWidths) as unknown;
    if (!Array.isArray(parsed)) return [...defaultColumnWidths];

    return defaultColumnWidths.map((defaultWidth, index) => {
      const value = parsed[index];
      return typeof value === "number" && Number.isFinite(value)
        ? Math.max(minColumnWidths[index] ?? 90, Math.round(value))
        : defaultWidth;
    });
  } catch {
    window.localStorage.removeItem(columnWidthStorageKey);
    return [...defaultColumnWidths];
  }
}

function restoreColumnFontSizes() {
  try {
    const rawFontSizes = window.localStorage.getItem(columnFontSizeStorageKey);
    if (!rawFontSizes) return [...defaultColumnFontSizes];

    const parsed = JSON.parse(rawFontSizes) as unknown;
    if (!Array.isArray(parsed)) return [...defaultColumnFontSizes];

    return defaultColumnFontSizes.map((defaultSize, index) => {
      const value = parsed[index];
      return typeof value === "number" && Number.isInteger(value)
        ? Math.min(40, Math.max(8, value))
        : defaultSize;
    });
  } catch {
    window.localStorage.removeItem(columnFontSizeStorageKey);
    return [...defaultColumnFontSizes];
  }
}

function restoreDraft() {
  try {
    const rawDraft = window.localStorage.getItem(draftStorageKey);
    if (!rawDraft) return;

    const draft = JSON.parse(rawDraft) as Partial<StoredDraft>;
    if (!Array.isArray(draft.rows)) return;

    rows.value = draft.rows.map(normalizeStoredRow);
    fileName.value = toText(draft.fileName);
    statusMessage.value = "Restored local draft.";
  } catch {
    window.localStorage.removeItem(draftStorageKey);
  }
}

function startResize(columnIndex: number, event: PointerEvent) {
  const startX = event.clientX;
  const startWidth = columnWidths.value[columnIndex];

  function resize(moveEvent: PointerEvent) {
    const nextWidth = Math.max(
      minColumnWidths[columnIndex] ?? 90,
      startWidth + moveEvent.clientX - startX,
    );
    columnWidths.value[columnIndex] = nextWidth;
  }

  function stopResize() {
    window.removeEventListener("pointermove", resize);
    window.removeEventListener("pointerup", stopResize);
    persistColumnWidths();
  }

  window.addEventListener("pointermove", resize);
  window.addEventListener("pointerup", stopResize);
}
</script>

<template>
  <main class="app-shell">
    <section class="top-panel">
      <header class="toolbar">
        <div class="app-title">
        <h1>TXT Manager</h1>
        <p>{{ fileName || "No JSON file loaded" }}</p>
      </div>

      <div class="toolbar-actions">
        <button type="button" @click="openFilePicker">Read JSON</button>
        <button type="button" :disabled="!canSaveJson" @click="saveJsonFile">
          {{ isSaving ? "Saving..." : "Save JSON" }}
        </button>
        <button
          class="clear-list-btn"
          type="button"
          :disabled="rows.length === 0"
          @click="clearRows"
        >
          Clear List
        </button>
      </div>
      <input
        ref="fileInput"
        class="file-input"
        type="file"
        accept=".json,application/json"
        @change="loadJsonFile"
      />
      </header>

      <div class="search-panel" aria-label="Search filters">
        <div class="search-main">
          <input
            v-model="searchText"
            type="search"
            placeholder="Search text..."
            aria-label="Search text"
          />
          <select v-model="stateFilter" aria-label="Search state">
            <option value="">All states</option>
            <option v-for="state in stateOptions" :key="state" :value="state">
              {{ state }}
            </option>
          </select>
          <span class="result-count">
            {{ renderedRows.length }} / {{ filteredRows.length }} / {{ rows.length }}
          </span>
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
      </div>

      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
      <p v-else-if="statusMessage" class="status-message">{{ statusMessage }}</p>
    </section>

    <section
      ref="tableWrap"
      class="table-wrap"
      aria-label="Sentence list"
      @scroll="handleTableScroll"
    >
      <div class="sentence-grid header-row" :style="{ gridTemplateColumns }">
        <div
          v-for="(column, index) in columns"
          :key="column.key"
          class="header-cell"
        >
          <div class="header-content">
            <span class="header-label">{{ column.label }}</span>
            <div v-if="index === 0" class="header-row-actions">
              <button
                class="row-action-btn add-row-btn"
                type="button"
                aria-label="Add row at end"
                @click="addRowAtEnd"
              >
                +
              </button>
              <span class="font-size-readout">
                {{ columnFontSizes[index] }}px
              </span>
            </div>
            <div v-else class="font-size-controls">
              <button
                type="button"
                :aria-label="`Decrease ${column.label} font size`"
                @click="adjustColumnFontSize(index, -1)"
              >
                -
              </button>
              <span>{{ columnFontSizes[index] }}px</span>
              <button
                type="button"
                :aria-label="`Increase ${column.label} font size`"
                @click="adjustColumnFontSize(index, 1)"
              >
                +
              </button>
            </div>
          </div>
          <button
            v-if="index < columns.length - 1"
            class="resize-handle"
            type="button"
            :aria-label="`Resize ${column.label}`"
            @pointerdown="startResize(index, $event)"
          />
        </div>
      </div>

      <div v-if="rows.length === 0" class="empty-state">
        Load a JSON file to display Sentence rows.
      </div>

      <div v-else-if="filteredRows.length === 0" class="empty-state">
        No matching Sentence rows.
      </div>

      <div v-else class="rows-scroll">
        <div
          class="virtual-spacer"
          :style="{ height: `${virtualRange.topPadding}px` }"
        />
        <div
          v-for="{ row, index: rowIndex } in renderedRows"
          :key="rowIndex"
          :ref="(element) => setVirtualRowElement(element, rowIndex)"
          class="sentence-grid data-row"
          :style="{ gridTemplateColumns }"
        >
          <div class="row-number-cell" :style="columnFontStyle(0)">
            <div class="row-actions">
              <template v-if="pendingDeleteIndex === rowIndex">
                <button
                  class="row-action-btn cancel-delete-btn"
                  type="button"
                  aria-label="Cancel delete row"
                  @click="cancelDeleteRow"
                >
                  X
                </button>
                <button
                  class="row-action-btn confirm-delete-btn"
                  type="button"
                  aria-label="Confirm delete row"
                  @click="confirmDeleteRow(rowIndex)"
                >
                  O
                </button>
              </template>
              <template v-else>
                <button
                  class="row-action-btn add-row-btn"
                  type="button"
                  aria-label="Add row below"
                  @click="addRowAfter(rowIndex)"
                >
                  +
                </button>
                <button
                  class="row-action-btn request-delete-btn"
                  type="button"
                  aria-label="Delete row"
                  @click="requestDeleteRow(rowIndex)"
                >
                  ×
                </button>
              </template>
            </div>
            <span class="row-number">{{ rowIndex + 1 }}</span>
          </div>
          <div class="textarea-cell" :style="columnFontStyle(1)">
            <textarea v-model="row.title_addr" aria-label="title_addr" />
            <div class="newline-hints" aria-hidden="true">
              <template
                v-for="(line, lineIndex) in newlineHintParts(row.title_addr)"
                :key="lineIndex"
              >
                <span>{{ line || " " }}</span>
                <span
                  v-if="lineIndex < newlineHintParts(row.title_addr).length - 1"
                  class="newline-marker"
                >
                  ↵
                </span>
                <br
                  v-if="lineIndex < newlineHintParts(row.title_addr).length - 1"
                />
              </template>
            </div>
            <div class="textarea-measure">{{ row.title_addr || " " }}</div>
          </div>
          <div class="textarea-cell" :style="columnFontStyle(2)">
            <textarea v-model="row.original_text" aria-label="original_text" />
            <div class="newline-hints" aria-hidden="true">
              <template
                v-for="(line, lineIndex) in newlineHintParts(row.original_text)"
                :key="lineIndex"
              >
                <span>{{ line || " " }}</span>
                <span
                  v-if="
                    lineIndex < newlineHintParts(row.original_text).length - 1
                  "
                  class="newline-marker"
                >
                  ↵
                </span>
                <br
                  v-if="
                    lineIndex < newlineHintParts(row.original_text).length - 1
                  "
                />
              </template>
            </div>
            <div class="textarea-measure">{{ row.original_text || " " }}</div>
          </div>
          <div class="textarea-cell" :style="columnFontStyle(3)">
            <textarea
              v-model="row.translated_text"
              aria-label="translated_text"
            />
            <div class="newline-hints" aria-hidden="true">
              <template
                v-for="(line, lineIndex) in newlineHintParts(
                  row.translated_text,
                )"
                :key="lineIndex"
              >
                <span>{{ line || " " }}</span>
                <span
                  v-if="
                    lineIndex <
                    newlineHintParts(row.translated_text).length - 1
                  "
                  class="newline-marker"
                >
                  ↵
                </span>
                <br
                  v-if="
                    lineIndex <
                    newlineHintParts(row.translated_text).length - 1
                  "
                />
              </template>
            </div>
            <div class="textarea-measure">
              {{ row.translated_text || " " }}
            </div>
          </div>
          <div class="textarea-cell" :style="columnFontStyle(4)">
            <textarea v-model="row.note" aria-label="note" />
            <div class="newline-hints" aria-hidden="true">
              <template
                v-for="(line, lineIndex) in newlineHintParts(row.note)"
                :key="lineIndex"
              >
                <span>{{ line || " " }}</span>
                <span
                  v-if="lineIndex < newlineHintParts(row.note).length - 1"
                  class="newline-marker"
                >
                  ↵
                </span>
                <br
                  v-if="lineIndex < newlineHintParts(row.note).length - 1"
                />
              </template>
            </div>
            <div class="textarea-measure">{{ row.note || " " }}</div>
          </div>
          <div class="select-cell" :style="columnFontStyle(5)">
            <select v-model="row.state" aria-label="state">
              <option v-for="state in stateOptions" :key="state" :value="state">
                {{ state }}
              </option>
            </select>
          </div>
          <div class="textarea-cell" :style="columnFontStyle(6)">
            <textarea v-model="row.file_name" aria-label="file_name" />
            <div class="newline-hints" aria-hidden="true">
              <template
                v-for="(line, lineIndex) in newlineHintParts(row.file_name)"
                :key="lineIndex"
              >
                <span>{{ line || " " }}</span>
                <span
                  v-if="lineIndex < newlineHintParts(row.file_name).length - 1"
                  class="newline-marker"
                >
                  ↵
                </span>
                <br
                  v-if="lineIndex < newlineHintParts(row.file_name).length - 1"
                />
              </template>
            </div>
            <div class="textarea-measure">{{ row.file_name || " " }}</div>
          </div>
        </div>
        <div
          class="virtual-spacer"
          :style="{ height: `${virtualRange.bottomPadding}px` }"
        />
      </div>
    </section>
  </main>
</template>

<style>
:root {
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  color: #202124;
  background: #f4f6f8;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-text-size-adjust: 100%;
}

* {
  box-sizing: border-box;
}

body {
  min-width: 760px;
  margin: 0;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  cursor: pointer;
}

.app-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
}

.top-panel {
  display: grid;
  grid-template-columns: minmax(240px, 0.7fr) minmax(360px, 1.6fr);
  gap: 8px 12px;
  align-items: start;
  border: 1px solid #d9dee7;
  border-radius: 8px;
  padding: 8px 10px;
  background: #ffffff;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.toolbar h1 {
  margin: 0;
  font-size: 17px;
  line-height: 1.2;
}

.toolbar p {
  margin: 2px 0 0;
  color: #6b7280;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-title {
  min-width: 0;
}

.toolbar button {
  border: 1px solid #1d4ed8;
  border-radius: 6px;
  padding: 6px 10px;
  color: #ffffff;
  background: #2563eb;
  font-size: 13px;
  font-weight: 650;
  white-space: nowrap;
}

.toolbar button:hover {
  background: #1d4ed8;
}

.toolbar button:disabled {
  border-color: #cbd5e1;
  color: #64748b;
  background: #e2e8f0;
  cursor: not-allowed;
}

.toolbar .clear-list-btn {
  border-color: #dc2626;
  background: #ef4444;
}

.toolbar .clear-list-btn:hover {
  background: #dc2626;
}

.toolbar .clear-list-btn:disabled {
  border-color: #cbd5e1;
  color: #64748b;
  background: #e2e8f0;
}

.toolbar-actions {
  display: flex;
  gap: 8px;
}

.file-input {
  display: none;
}

.error-message {
  margin: 0;
  border: 1px solid #fecaca;
  border-radius: 6px;
  padding: 5px 8px;
  color: #991b1b;
  background: #fef2f2;
  font-size: 12px;
  line-height: 1.25;
  grid-column: 1 / -1;
}

.status-message {
  margin: 0;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  padding: 5px 8px;
  color: #1e40af;
  background: #eff6ff;
  font-size: 12px;
  line-height: 1.25;
  grid-column: 1 / -1;
}

.search-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.search-main {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 150px auto;
  gap: 8px;
  align-items: center;
}

.search-main input,
.search-main select {
  min-height: 30px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  padding: 5px 8px;
  color: #1f2937;
  background: #ffffff;
  font-size: 13px;
}

.search-main input:focus,
.search-main select:focus {
  outline: 2px solid #2563eb;
  outline-offset: -1px;
}

.result-count {
  color: #64748b;
  font-size: 12px;
  white-space: nowrap;
}

.search-columns {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 12px;
}

.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: #374151;
  font-size: 12px;
  line-height: 1.2;
}

.checkbox-label input {
  width: 14px;
  height: 14px;
  margin: 0;
}

@media (max-width: 980px) {
  .top-panel {
    grid-template-columns: 1fr;
  }
}

.table-wrap {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: auto;
  border: 1px solid #d9dee7;
  border-radius: 8px;
  background: #ffffff;
}

.sentence-grid {
  display: grid;
  min-width: max-content;
}

.header-row {
  position: sticky;
  top: 0;
  z-index: 20;
  background: #eef2f7;
  border-bottom: 1px solid #d9dee7;
  box-shadow: 0 1px 0 #d9dee7;
}

.header-cell {
  position: relative;
  min-height: 58px;
  display: flex;
  align-items: stretch;
  padding: 7px 12px;
  border-right: 1px solid #d9dee7;
  color: #374151;
  background: #eef2f7;
  font-size: 12px;
  font-weight: 750;
}

.header-cell:last-child {
  border-right: none;
}

.header-content {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
}

.header-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.font-size-controls {
  display: grid;
  grid-template-columns: 22px minmax(34px, 1fr) 22px;
  align-items: center;
  gap: 4px;
  color: #64748b;
  font-size: 11px;
  font-weight: 650;
}

.font-size-readout {
  color: #64748b;
  font-size: 11px;
  font-weight: 650;
  white-space: nowrap;
}

.header-row-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.font-size-controls button {
  width: 22px;
  height: 22px;
  border: 1px solid #cbd5e1;
  border-radius: 5px;
  padding: 0;
  color: #334155;
  background: #ffffff;
  font-size: 13px;
  line-height: 1;
}

.font-size-controls button:hover {
  border-color: #94a3b8;
  background: #f8fafc;
}

.font-size-controls span {
  text-align: center;
  white-space: nowrap;
}

.resize-handle {
  position: absolute;
  top: 0;
  right: -5px;
  width: 10px;
  height: 100%;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: col-resize;
}

.resize-handle:hover {
  background: rgba(37, 99, 235, 0.2);
}

.rows-scroll {
  min-width: max-content;
}

.data-row {
  border-bottom: 1px solid #edf0f5;
}

.data-row:last-child {
  border-bottom: none;
}

.virtual-spacer {
  min-width: 1px;
  pointer-events: none;
}

.row-number-cell,
.textarea-cell,
.select-cell {
  position: relative;
  min-height: 42px;
  border-right: 1px solid #edf0f5;
  background: #ffffff;
}

.textarea-cell:last-child,
.select-cell:last-child {
  border-right: none;
}

.row-number-cell {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: flex-start;
  gap: 6px;
  padding: 9px 10px;
  color: #64748b;
  font-size: 13px;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
}

.row-actions {
  display: flex;
  gap: 4px;
}

.row-number {
  justify-self: end;
}

.row-action-btn {
  width: 20px;
  height: 20px;
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 0;
  color: #ffffff;
  font-size: 12px;
  font-weight: 800;
  line-height: 18px;
}

.add-row-btn,
.confirm-delete-btn {
  border-color: #16a34a;
  background: #22c55e;
}

.add-row-btn:hover,
.confirm-delete-btn:hover {
  background: #16a34a;
}

.request-delete-btn,
.cancel-delete-btn {
  border-color: #dc2626;
  background: #ef4444;
}

.request-delete-btn:hover,
.cancel-delete-btn:hover {
  background: #dc2626;
}

.textarea-cell > textarea,
.select-cell > select,
.newline-hints,
.textarea-measure {
  width: 100%;
  padding: 9px 10px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.textarea-cell > textarea,
.select-cell > select,
.newline-hints {
  position: absolute;
  inset: 0;
  height: 100%;
  border: 0;
  border-radius: 0;
  color: #1f2937;
  background: transparent;
}

.newline-hints {
  z-index: 1;
  overflow: hidden;
  color: transparent;
  pointer-events: none;
  user-select: none;
}

.newline-marker {
  color: #94a3b8;
  font-weight: 700;
}

.textarea-cell > textarea {
  z-index: 2;
  resize: none;
  overflow: hidden;
}

.select-cell > select {
  appearance: auto;
}

.textarea-measure {
  visibility: hidden;
  min-height: 42px;
  pointer-events: none;
}

.textarea-cell > textarea:focus,
.select-cell > select:focus {
  z-index: 3;
  outline: 2px solid #2563eb;
  outline-offset: -2px;
}

.empty-state {
  flex: 1;
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6b7280;
}
</style>
