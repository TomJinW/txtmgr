<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { confirm } from "@tauri-apps/plugin-dialog";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cjkFallbackOptions, themeOptions } from "./constants";
import GoToRowDialog from "./components/GoToRowDialog.vue";
import type { CjkFallbackMode, EncodingRow, ThemeMode } from "./types";

type EncodingFilter =
  | "duplicate_code"
  | "empty_character"
  | "empty_code"
  | "punctuation"
  | "han"
  | "kana"
  | "hangul"
  | "latin"
  | "special";

const draftStorageKey = "txtmgr.encodingRows.v1";
const columnWidthStorageKey = "txtmgr.encodingColumnWidths.v3";
const fallbackStorageKey = "txtmgr.encodingFallback.v2";
const themeStorageKey = "txtmgr.theme.v1";
const defaultColumnWidths = [112, 105, 112, 76, 200];
const minColumnWidths = [108, 64, 72, 56, 100];
const estimatedRowHeight = 42;
const virtualOverscanRows = 12;
const filterOptions: { label: string; value: EncodingFilter }[] = [
  { label: "Duplicate code", value: "duplicate_code" },
  { label: "Empty character", value: "empty_character" },
  { label: "Empty code", value: "empty_code" },
  { label: "Punctuation", value: "punctuation" },
  { label: "Han", value: "han" },
  { label: "Kana", value: "kana" },
  { label: "Hangul", value: "hangul" },
  { label: "Latin", value: "latin" },
  { label: "Special", value: "special" },
];
const columns = [
  { key: "row_number", label: "#" },
  { key: "original_char", label: "original_char" },
  { key: "code", label: "code" },
  { key: "width", label: "width" },
  { key: "note", label: "note" },
] as const;
const searchableColumns: (keyof EncodingRow)[] = [
  "original_char",
  "code",
  "width",
  "note",
];

const rows = ref<EncodingRow[]>(restoreRows());
const columnWidths = ref(restoreColumnWidths());
const fallbackPrefs = ref(restoreFallbackPrefs());
const themeMode = ref<ThemeMode>(restoreThemeMode());
const searchText = ref("");
const selectedSearchColumns = ref<(keyof EncodingRow)[]>([...searchableColumns]);
const activeFilters = ref<EncodingFilter[]>([]);
const selectedRowIds = ref<Set<number>>(new Set());
const pendingDeleteIndex = ref<number | null>(null);
const goToRowValue = ref("");
const isGoToRowDialogOpen = ref(false);
const statusMessage = ref("");
const errorMessage = ref("");
const tableWrap = ref<HTMLElement | null>(null);
const tableScrollTop = ref(0);
const tableViewportHeight = ref(600);
const rowHeights = ref<Record<number, number>>({});
let nextRowIdentity = 1;
let autoSaveTimer: number | undefined;
let columnWidthSaveTimer: number | undefined;
let unlistenEncodingImport: UnlistenFn | undefined;
let unlistenEncodingExport: UnlistenFn | undefined;
let unlistenEncodingOpenGoToRow: UnlistenFn | undefined;
let unlistenEncodingClearList: UnlistenFn | undefined;
let unlistenEncodingDeleteSelected: UnlistenFn | undefined;
const rowResizeObservers = new Map<number, ResizeObserver>();
const rowElements = new Map<number, HTMLElement>();
const rowIdentities = new WeakMap<EncodingRow, number>();
const appWindow = getCurrentWindow();

const appShellClasses = computed(() => [
  `theme-${themeMode.value}`,
  { "platform-linux": isLinuxPlatform() },
]);

const gridTemplateColumns = computed(() =>
  columnWidths.value.map((width) => `${width}px`).join(" "),
);

const duplicateCodeIds = computed(() => {
  const groups = new Map<string, number[]>();
  rows.value.forEach((row) => {
    const code = normalizeCode(row.code);
    if (code === "") return;
    groups.set(code, [...(groups.get(code) ?? []), getRowIdentity(row)]);
  });

  return new Set(
    Array.from(groups.values())
      .filter((ids) => ids.length > 1)
      .flat(),
  );
});

const filteredRows = computed(() => {
  const query = searchText.value.trim().toLowerCase();

  return rows.value
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      const textMatches = rowMatchesSearch(row, query);
      const filterMatches =
        activeFilters.value.length === 0 ||
        activeFilters.value.some((filter) => rowMatchesFilter(row, filter));

      return textMatches && filterMatches;
    });
});

const virtualRange = computed(() => {
  const items = filteredRows.value;
  const scrollTop = tableScrollTop.value;
  const viewportBottom = scrollTop + tableViewportHeight.value;
  let offset = 0;
  let start = 0;

  while (start < items.length) {
    const height = rowHeight(items[start].row);
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
    renderedHeight += rowHeight(items[end].row);
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

const textFilteredRows = computed(() => {
  const query = searchText.value.trim().toLowerCase();
  return rows.value
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => rowMatchesSearch(row, query));
});

const filterCounts = computed(() => {
  const counts = {} as Record<EncodingFilter, number>;

  for (const filter of filterOptions) {
    counts[filter.value] = textFilteredRows.value.filter(({ row }) =>
      rowMatchesFilter(row, filter.value),
    ).length;
  }

  return counts;
});

const filteredRowIds = computed(() =>
  filteredRows.value.map(({ row }) => getRowIdentity(row)),
);

const isEveryFilteredRowSelected = computed(
  () =>
    filteredRowIds.value.length > 0 &&
    filteredRowIds.value.every((rowId) => selectedRowIds.value.has(rowId)),
);

const isSomeFilteredRowSelected = computed(() =>
  filteredRowIds.value.some((rowId) => selectedRowIds.value.has(rowId)),
);

const selectedRowCount = computed(() => selectedRowIds.value.size);

watch(
  rows,
  () => {
    queuePersistRows();
    pruneSelectedRows();
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
  fallbackPrefs,
  () => {
    window.localStorage.setItem(fallbackStorageKey, JSON.stringify(fallbackPrefs.value));
    resetVirtualRowState();
    updateTableViewport();
  },
  { deep: true },
);

watch(themeMode, () => {
  window.localStorage.setItem(themeStorageKey, themeMode.value);
  syncWindowTheme();
});

watch(
  () => [
    searchText.value,
    activeFilters.value.join("|"),
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

watch(renderedRows, () => {
  const renderedRowIds = new Set(
    renderedRows.value.map(({ row }) => getRowIdentity(row)),
  );

  rowElements.forEach((_element, rowId) => {
    if (!renderedRowIds.has(rowId)) {
      rowElements.delete(rowId);
    }
  });
});

syncWindowTheme();
registerMenuListeners();

onBeforeUnmount(() => {
  window.clearTimeout(autoSaveTimer);
  window.clearTimeout(columnWidthSaveTimer);
  unlistenEncodingImport?.();
  unlistenEncodingExport?.();
  unlistenEncodingOpenGoToRow?.();
  unlistenEncodingClearList?.();
  unlistenEncodingDeleteSelected?.();
  rowResizeObservers.forEach((observer) => observer.disconnect());
  rowResizeObservers.clear();
  rowElements.clear();
});

function registerMenuListeners() {
  listen("encoding-import", () => {
    placeholderAction("Import");
  })
    .then((unlisten) => {
      unlistenEncodingImport = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding import menu listener.", error);
    });

  listen("encoding-export", () => {
    placeholderAction("Export");
  })
    .then((unlisten) => {
      unlistenEncodingExport = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding export menu listener.", error);
    });

  listen("encoding-open-go-to-row", () => {
    openGoToRowDialog();
  })
    .then((unlisten) => {
      unlistenEncodingOpenGoToRow = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding go to row menu listener.", error);
    });

  listen("encoding-clear-list", () => {
    void clearRows();
  })
    .then((unlisten) => {
      unlistenEncodingClearList = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding clear list menu listener.", error);
    });

  listen("encoding-delete-selected", () => {
    void deleteSelectedRows();
  })
    .then((unlisten) => {
      unlistenEncodingDeleteSelected = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding delete selected menu listener.", error);
    });
}

function createEmptyRow(): EncodingRow {
  return {
    original_char: "",
    code: "",
    width: "",
    note: "",
  };
}

function addRowAtEnd() {
  rows.value.push(createEmptyRow());
  statusMessage.value = "Row added.";
}

function addRowAfter(rowIndex: number) {
  rows.value.splice(rowIndex + 1, 0, createEmptyRow());
  if (pendingDeleteIndex.value !== null && pendingDeleteIndex.value > rowIndex) {
    pendingDeleteIndex.value += 1;
  }
}

function requestDeleteRow(rowIndex: number) {
  pendingDeleteIndex.value = rowIndex;
}

function cancelDeleteRow() {
  pendingDeleteIndex.value = null;
}

function confirmDeleteRow(rowIndex: number) {
  const row = rows.value[rowIndex];
  if (row) {
    selectedRowIds.value.delete(getRowIdentity(row));
    selectedRowIds.value = new Set(selectedRowIds.value);
  }
  rows.value.splice(rowIndex, 1);
  pendingDeleteIndex.value = null;
  pruneVirtualRowState();
}

async function clearRows() {
  if (rows.value.length === 0) return;

  const confirmed = await confirm(
    "Clear the entire encoding list? This cannot be undone.",
    {
      title: "Clear Encoding List",
      kind: "warning",
    },
  );

  if (!confirmed) return;
  rows.value = [];
  selectedRowIds.value = new Set();
  pendingDeleteIndex.value = null;
  resetVirtualRowState();
  statusMessage.value = "Encoding list cleared.";
}

async function deleteSelectedRows() {
  if (selectedRowIds.value.size === 0) return;

  const deleteCount = selectedRowIds.value.size;
  const confirmed = await confirm(
    `Delete ${deleteCount} selected row${deleteCount === 1 ? "" : "s"}? This cannot be undone.`,
    {
      title: "Delete Selected Encoding Rows",
      kind: "warning",
    },
  );

  if (!confirmed) return;

  const idsToDelete = selectedRowIds.value;
  rows.value = rows.value.filter((row) => !idsToDelete.has(getRowIdentity(row)));
  selectedRowIds.value = new Set();
  pendingDeleteIndex.value = null;
  pruneVirtualRowState();
  statusMessage.value = `Deleted ${deleteCount} selected row${deleteCount === 1 ? "" : "s"}.`;
}

function toggleRowSelection(row: EncodingRow, checked: boolean) {
  const nextSelectedIds = new Set(selectedRowIds.value);
  const rowId = getRowIdentity(row);
  if (checked) {
    nextSelectedIds.add(rowId);
  } else {
    nextSelectedIds.delete(rowId);
  }
  selectedRowIds.value = nextSelectedIds;
}

function toggleFilteredRowSelection(checked: boolean) {
  const nextSelectedIds = new Set(selectedRowIds.value);
  for (const rowId of filteredRowIds.value) {
    if (checked) {
      nextSelectedIds.add(rowId);
    } else {
      nextSelectedIds.delete(rowId);
    }
  }
  selectedRowIds.value = nextSelectedIds;
}

function handleFilteredSelectionChange(event: Event) {
  toggleFilteredRowSelection((event.currentTarget as HTMLInputElement).checked);
}

function handleRowSelectionChange(row: EncodingRow, event: Event) {
  toggleRowSelection(row, (event.currentTarget as HTMLInputElement).checked);
}

function pruneSelectedRows() {
  const existingRowIds = new Set(rows.value.map((row) => getRowIdentity(row)));
  const nextSelectedIds = new Set(
    Array.from(selectedRowIds.value).filter((rowId) => existingRowIds.has(rowId)),
  );
  if (nextSelectedIds.size !== selectedRowIds.value.size) {
    selectedRowIds.value = nextSelectedIds;
  }
}

function openGoToRowDialog() {
  isGoToRowDialogOpen.value = true;
}

function closeGoToRowDialog() {
  isGoToRowDialogOpen.value = false;
}

async function confirmGoToRowDialog() {
  if (goToRow()) {
    closeGoToRowDialog();
  }
}

function goToRow() {
  const targetRowNumber = Number.parseInt(goToRowValue.value, 10);

  if (
    Number.isNaN(targetRowNumber) ||
    targetRowNumber < 1 ||
    targetRowNumber > rows.value.length
  ) {
    statusMessage.value = "";
    errorMessage.value =
      rows.value.length === 0
        ? "There are no rows to jump to."
        : `Enter a row number from 1 to ${rows.value.length}.`;
    return false;
  }

  const targetRowIndex = targetRowNumber - 1;
  const visibleIndex = filteredRows.value.findIndex(
    (item) => item.index === targetRowIndex,
  );

  if (visibleIndex === -1) {
    statusMessage.value = "";
    errorMessage.value = `Row ${targetRowNumber} is hidden by the current filters.`;
    return false;
  }

  errorMessage.value = "";
  statusMessage.value = `Jumped to row ${targetRowNumber}.`;

  const nextScrollTop = sumRowHeights(filteredRows.value, 0, visibleIndex);
  tableScrollTop.value = nextScrollTop;
  if (tableWrap.value) {
    tableWrap.value.scrollTop = nextScrollTop;
  }
  updateTableViewport();
  nextTick(() => {
    alignRenderedRow(filteredRows.value[visibleIndex].row);
  });

  return true;
}

function rowHeight(row: EncodingRow) {
  return rowHeights.value[getRowIdentity(row)] ?? estimatedRowHeight;
}

function sumRowHeights(
  items: { row: EncodingRow; index: number }[],
  start: number,
  end: number,
) {
  let total = 0;
  for (let index = start; index < end; index += 1) {
    total += rowHeight(items[index].row);
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

function alignRenderedRow(row: EncodingRow) {
  const wrapper = tableWrap.value;
  const element = rowElements.get(getRowIdentity(row));
  if (!wrapper || !element) return;

  const header = wrapper.querySelector<HTMLElement>(".header-row");
  const headerHeight = header?.getBoundingClientRect().height ?? 0;
  const wrapperTop = wrapper.getBoundingClientRect().top;
  const rowTop = element.getBoundingClientRect().top;

  wrapper.scrollTop += rowTop - wrapperTop - headerHeight;
  updateTableViewport();
}

function setVirtualRowElement(element: unknown, row: EncodingRow) {
  const rowId = getRowIdentity(row);
  const existingObserver = rowResizeObservers.get(rowId);
  if (existingObserver) {
    existingObserver.disconnect();
    rowResizeObservers.delete(rowId);
  }
  rowElements.delete(rowId);

  if (!(element instanceof HTMLElement)) return;
  rowElements.set(rowId, element);

  const updateHeight = () => {
    const nextHeight = Math.ceil(element.getBoundingClientRect().height);
    if (nextHeight <= 0 || rowHeights.value[rowId] === nextHeight) return;

    rowHeights.value = {
      ...rowHeights.value,
      [rowId]: nextHeight,
    };
  };

  updateHeight();

  const observer = new ResizeObserver(updateHeight);
  observer.observe(element);
  rowResizeObservers.set(rowId, observer);
}

function resetVirtualRowState() {
  rowResizeObservers.forEach((observer) => observer.disconnect());
  rowResizeObservers.clear();
  rowElements.clear();
  rowHeights.value = {};
}

function pruneVirtualRowState() {
  const existingRowIds = new Set(rows.value.map((row) => getRowIdentity(row)));

  rowElements.forEach((_element, rowId) => {
    if (!existingRowIds.has(rowId)) {
      rowElements.delete(rowId);
    }
  });

  rowResizeObservers.forEach((observer, rowId) => {
    if (!existingRowIds.has(rowId)) {
      observer.disconnect();
      rowResizeObservers.delete(rowId);
    }
  });

  const nextRowHeights = { ...rowHeights.value };
  for (const rowId of Object.keys(nextRowHeights)) {
    if (!existingRowIds.has(Number(rowId))) {
      delete nextRowHeights[Number(rowId)];
    }
  }
  rowHeights.value = nextRowHeights;
}

function normalizeEditedCode(row: EncodingRow) {
  row.code = normalizeCode(row.code);
}

function normalizeCode(value: string) {
  const hex = value.replace(/[^0-9a-f]/gi, "").toUpperCase();
  if (hex === "") return "";
  return hex.length % 2 === 0 ? hex : `0${hex}`;
}

function toggleFilter(filter: EncodingFilter) {
  activeFilters.value = activeFilters.value.includes(filter)
    ? activeFilters.value.filter((item) => item !== filter)
    : [...activeFilters.value, filter];
}

function rowMatchesFilter(row: EncodingRow, filter: EncodingFilter) {
  const text = row.original_char;
  switch (filter) {
    case "duplicate_code":
      return duplicateCodeIds.value.has(getRowIdentity(row));
    case "empty_character":
      return row.original_char.trim() === "";
    case "empty_code":
      return row.code.trim() === "";
    case "punctuation":
      return /[\p{P}\p{S}]/u.test(text) && !isSpecialToken(text);
    case "han":
      return /\p{Script=Han}/u.test(text);
    case "kana":
      return /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);
    case "hangul":
      return /\p{Script=Hangul}/u.test(text);
    case "latin":
      return /\p{Script=Latin}/u.test(text);
    case "special":
      return isSpecialToken(text);
  }
}

function rowMatchesSearch(row: EncodingRow, query: string) {
  return (
    query === "" ||
    selectedSearchColumns.value.some((key) =>
      row[key].toLowerCase().includes(query),
    )
  );
}

function isSpecialToken(value: string) {
  return /^<[^<>]+>$/.test(value) || /^\[[^\[\]]+\]$/.test(value) || /^\{[^{}]+\}$/.test(value);
}

function getRowIdentity(row: EncodingRow) {
  const currentId = rowIdentities.get(row);
  if (currentId) return currentId;

  const nextId = nextRowIdentity;
  nextRowIdentity += 1;
  rowIdentities.set(row, nextId);
  return nextId;
}

function queuePersistRows() {
  window.clearTimeout(autoSaveTimer);
  autoSaveTimer = window.setTimeout(() => {
    window.localStorage.setItem(draftStorageKey, JSON.stringify(rows.value));
    statusMessage.value = "Auto-saved locally.";
  }, 250);
}

function queuePersistColumnWidths() {
  window.clearTimeout(columnWidthSaveTimer);
  columnWidthSaveTimer = window.setTimeout(() => {
    window.localStorage.setItem(
      columnWidthStorageKey,
      JSON.stringify(columnWidths.value.map((width) => Math.round(width))),
    );
  }, 150);
}

function restoreRows() {
  try {
    const rawRows = window.localStorage.getItem(draftStorageKey);
    if (!rawRows) return [];
    const parsed = JSON.parse(rawRows) as Partial<EncodingRow>[];
    if (!Array.isArray(parsed)) return [];

    return parsed.map((row) => ({
      original_char: typeof row.original_char === "string" ? row.original_char : "",
      code: typeof row.code === "string" ? normalizeCode(row.code) : "",
      width: typeof row.width === "string" ? row.width : "",
      note: typeof row.note === "string" ? row.note : "",
    }));
  } catch {
    window.localStorage.removeItem(draftStorageKey);
    return [];
  }
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
        ? Math.max(minColumnWidths[index] ?? 80, Math.round(value))
        : defaultWidth;
    });
  } catch {
    window.localStorage.removeItem(columnWidthStorageKey);
    return [...defaultColumnWidths];
  }
}

function restoreFallbackPrefs() {
  const defaults: Record<"character" | "note", CjkFallbackMode> = {
    character: "default",
    note: "default",
  };

  try {
    const rawPrefs = window.localStorage.getItem(fallbackStorageKey);
    if (!rawPrefs) return defaults;
    const parsed = JSON.parse(rawPrefs) as Partial<
      Record<"character" | "note", unknown>
    >;

    return {
      character: normalizeFallbackMode(parsed.character),
      note: normalizeFallbackMode(parsed.note),
    };
  } catch {
    window.localStorage.removeItem(fallbackStorageKey);
    return defaults;
  }
}

function normalizeFallbackMode(value: unknown): CjkFallbackMode {
  return cjkFallbackOptions.some((option) => option.value === value)
    ? (value as CjkFallbackMode)
    : "default";
}

function restoreThemeMode(): ThemeMode {
  const storedTheme = window.localStorage.getItem(themeStorageKey);
  return storedTheme === "dark" || storedTheme === "light"
    ? storedTheme
    : "light";
}

function cjkFontFamily(mode: CjkFallbackMode) {
  if (mode === "default") return undefined;

  const fallback = "Inter, ui-sans-serif, system-ui, sans-serif";
  const fontFamilies: Record<Exclude<CjkFallbackMode, "default">, string> = {
    sc: `"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC", "WenQuanYi Micro Hei", ${fallback}`,
    tc: `"PingFang TC", "Microsoft JhengHei", "Noto Sans CJK TC", "Source Han Sans TC", ${fallback}`,
    jp: `"Hiragino Sans", "Yu Gothic", "Meiryo", "Noto Sans CJK JP", "Source Han Sans JP", ${fallback}`,
    kr: `"Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", "Source Han Sans KR", ${fallback}`,
  };

  return fontFamilies[mode];
}

function textCellStyle(column: "character" | "note") {
  return {
    fontFamily: cjkFontFamily(fallbackPrefs.value[column]),
  };
}

function startResize(columnIndex: number, event: PointerEvent) {
  const startX = event.clientX;
  const startWidth = columnWidths.value[columnIndex];

  const resize = (moveEvent: PointerEvent) => {
    columnWidths.value[columnIndex] = Math.max(
      minColumnWidths[columnIndex] ?? 80,
      startWidth + moveEvent.clientX - startX,
    );
  };

  const stopResize = () => {
    window.removeEventListener("pointermove", resize);
    window.removeEventListener("pointerup", stopResize);
  };

  window.addEventListener("pointermove", resize);
  window.addEventListener("pointerup", stopResize);
}

function isLinuxPlatform() {
  return /Linux/i.test(window.navigator.userAgent);
}

function syncWindowTheme() {
  appWindow.setTheme(themeMode.value).catch((error) => {
    console.warn("Failed to sync native window theme.", error);
  });
}

function placeholderAction(action: string) {
  statusMessage.value = `${action} is not implemented yet.`;
}
</script>

<template>
  <main class="encoding-shell" :class="appShellClasses">
    <section class="encoding-top-panel">
      <header class="encoding-toolbar">
        <div class="encoding-toolbar-controls">
          <select v-model="themeMode" class="theme-select" aria-label="Theme">
            <option
              v-for="theme in themeOptions"
              :key="theme.value"
              :value="theme.value"
            >
              {{ theme.label }}
            </option>
          </select>
          <label class="fallback-setting">
            <span>Character</span>
            <select
              v-model="fallbackPrefs.character"
              aria-label="original_char fallback font preference"
            >
              <option
                v-for="option in cjkFallbackOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
          <label class="fallback-setting">
            <span>Note</span>
            <select
              v-model="fallbackPrefs.note"
              aria-label="note fallback font preference"
            >
              <option
                v-for="option in cjkFallbackOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
          <button type="button" @click="placeholderAction('Import')">Import</button>
          <button type="button" @click="placeholderAction('Export')">Export</button>
          <button
            class="danger-btn"
            type="button"
            :disabled="rows.length === 0"
            @click="clearRows"
          >
            Clear List
          </button>
          <button
            class="danger-btn"
            type="button"
            :disabled="selectedRowCount === 0"
            @click="deleteSelectedRows"
          >
            Delete Selected {{ selectedRowCount > 0 ? selectedRowCount : "" }}
          </button>
        </div>
      </header>

      <div class="encoding-search-panel">
        <div class="search-main">
          <input
            v-model="searchText"
            type="search"
            placeholder="Search text..."
            aria-label="Search text"
          />
          <span class="result-count">
            {{ filteredRows.length }} / {{ rows.length }}
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
              @click="activeFilters = []"
            >
              Total {{ rows.length }}
            </button>
            <button
              v-for="filter in filterOptions"
              :key="filter.value"
              type="button"
              :class="{ active: activeFilters.includes(filter.value) }"
              @click="toggleFilter(filter.value)"
            >
              {{ filter.label }} {{ filterCounts[filter.value] }}
            </button>
          </div>

          <form class="go-to-row" aria-label="Go to row" @submit.prevent="goToRow">
            <label for="encoding-go-to-row">Go to row</label>
            <input
              id="encoding-go-to-row"
              v-model="goToRowValue"
              type="number"
              min="1"
              :max="rows.length || undefined"
              inputmode="numeric"
            />
            <button type="submit" :disabled="rows.length === 0">Go</button>
          </form>
        </div>
      </div>

      <p v-if="errorMessage" class="error-message">{{ errorMessage }}</p>
      <p v-else-if="statusMessage" class="status-message">{{ statusMessage }}</p>
    </section>

    <section
      ref="tableWrap"
      class="encoding-table-wrap"
      aria-label="Encoding list"
      @scroll="handleTableScroll"
    >
      <div class="encoding-grid header-row" :style="{ gridTemplateColumns }">
        <div
          v-for="(column, index) in columns"
          :key="column.key"
          class="header-cell"
        >
          <div class="header-content">
            <span>{{ column.label }}</span>
            <div v-if="index === 0" class="header-row-actions">
              <input
                class="row-select-checkbox"
                type="checkbox"
                aria-label="Select filtered rows"
                :checked="isEveryFilteredRowSelected"
                :indeterminate="
                  isSomeFilteredRowSelected && !isEveryFilteredRowSelected
                "
                :disabled="filteredRows.length === 0"
                @change="handleFilteredSelectionChange"
              />
              <button
                class="row-action-btn add-row-btn"
                type="button"
                aria-label="Add row at end"
                @click="addRowAtEnd"
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
        Add encoding rows to start.
      </div>
      <div v-else-if="filteredRows.length === 0" class="empty-state">
        No matching encoding rows.
      </div>

      <div v-else class="encoding-rows-scroll">
        <div
          class="virtual-spacer"
          :style="{ height: `${virtualRange.topPadding}px` }"
        />

        <div
          v-for="{ row, index: rowIndex } in renderedRows"
          :key="getRowIdentity(row)"
          :ref="(element) => setVirtualRowElement(element, row)"
          class="encoding-grid data-row"
          :data-encoding-row="rowIndex + 1"
          :style="{ gridTemplateColumns }"
        >
          <div class="row-number-cell">
            <input
              class="row-select-checkbox"
              type="checkbox"
              :aria-label="`Select row ${rowIndex + 1}`"
              :checked="selectedRowIds.has(getRowIdentity(row))"
              @change="handleRowSelectionChange(row, $event)"
            />
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
          <div class="textarea-cell" :style="textCellStyle('character')">
            <textarea v-model="row.original_char" aria-label="original_char" />
            <div class="textarea-measure">{{ row.original_char || " " }}</div>
          </div>
          <div class="textarea-cell">
            <textarea
              v-model="row.code"
              aria-label="code"
              @blur="normalizeEditedCode(row)"
            />
            <div class="textarea-measure">{{ row.code || " " }}</div>
          </div>
          <div class="textarea-cell">
            <textarea v-model="row.width" aria-label="width" />
            <div class="textarea-measure">{{ row.width || " " }}</div>
          </div>
          <div class="textarea-cell" :style="textCellStyle('note')">
            <textarea v-model="row.note" aria-label="note" />
            <div class="textarea-measure">{{ row.note || " " }}</div>
          </div>
        </div>

        <div
          class="virtual-spacer"
          :style="{ height: `${virtualRange.bottomPadding}px` }"
        />
      </div>
    </section>

    <GoToRowDialog
      v-if="isGoToRowDialogOpen"
      v-model="goToRowValue"
      :max-row="rows.length"
      @close="closeGoToRowDialog"
      @confirm="confirmGoToRowDialog"
    />
  </main>
</template>

<style scoped>
:root {
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
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

.encoding-shell {
  --border: #d9dee7;
  --border-soft: #edf0f5;
  --control-border: #cbd5e1;
  --control-hover-bg: #f8fafc;
  --control-text: #334155;
  --danger: #ef4444;
  --danger-bg-soft: #fef2f2;
  --danger-border-soft: #fecaca;
  --danger-hover: #dc2626;
  --danger-text-soft: #991b1b;
  --disabled-bg: #e2e8f0;
  --header-bg: #eef2f7;
  --hint: #94a3b8;
  --info-bg: #eff6ff;
  --info-border: #bfdbfe;
  --info-text: #1e40af;
  --input-text: #1f2937;
  --muted: #64748b;
  --on-accent: #ffffff;
  --page-bg: #f4f6f8;
  --panel-bg: #ffffff;
  --primary: #2563eb;
  --primary-hover: #1d4ed8;
  --success: #22c55e;
  --success-hover: #16a34a;
  --text: #202124;
  --text-soft: #374151;

  height: 100vh;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  color: var(--text);
  background: var(--page-bg);
}

.theme-dark {
  --border: #334155;
  --border-soft: #243244;
  --control-border: #475569;
  --control-hover-bg: #1e293b;
  --control-text: #dbe4ef;
  --danger: #dc2626;
  --danger-bg-soft: #3b1218;
  --danger-border-soft: #7f1d1d;
  --danger-hover: #b91c1c;
  --danger-text-soft: #fecaca;
  --disabled-bg: #263244;
  --header-bg: #172033;
  --hint: #94a3b8;
  --info-bg: #10233f;
  --info-border: #1d4ed8;
  --info-text: #bfdbfe;
  --input-text: #e5edf6;
  --muted: #94a3b8;
  --on-accent: #ffffff;
  --page-bg: #0b1120;
  --panel-bg: #111827;
  --primary: #3b82f6;
  --primary-hover: #2563eb;
  --success: #16a34a;
  --success-hover: #15803d;
  --text: #e5edf6;
  --text-soft: #cbd5e1;
}

.platform-linux.theme-dark select,
.platform-linux.theme-dark option {
  color: var(--input-text);
  background-color: var(--panel-bg);
  color-scheme: dark;
}

.encoding-top-panel {
  display: grid;
  grid-template-columns: minmax(260px, 0.7fr) minmax(420px, 1.3fr);
  gap: 6px 12px;
  align-items: start;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 8px;
  background: var(--panel-bg);
}

.encoding-toolbar-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 6px;
}

.encoding-toolbar button,
.encoding-toolbar select {
  min-height: 29px;
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 12px;
}

.encoding-toolbar button {
  border: 1px solid var(--primary-hover);
  color: var(--on-accent);
  background: var(--primary);
  font-weight: 650;
  white-space: nowrap;
}

.encoding-toolbar button:disabled {
  border-color: var(--control-border);
  color: var(--muted);
  background: var(--disabled-bg);
  cursor: not-allowed;
}

.encoding-toolbar select,
.search-main input,
.go-to-row input {
  border: 1px solid var(--control-border);
  color: var(--input-text);
  background: var(--panel-bg);
}

.fallback-setting {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  color: var(--text-soft);
  font-size: 12px;
  white-space: nowrap;
}

.encoding-toolbar .danger-btn {
  border-color: var(--danger-hover);
  background: var(--danger);
}

.encoding-toolbar .danger-btn:hover {
  background: var(--danger-hover);
}

.encoding-search-panel {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.search-main {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.search-main input {
  min-height: 30px;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 13px;
}

.result-count,
.checkbox-label,
.go-to-row {
  color: var(--text-soft);
  font-size: 12px;
}

.search-columns,
.stats-list,
.stats-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 10px;
  align-items: center;
}

.stats-panel {
  justify-content: space-between;
}

.stats-list {
  flex: 1;
  min-width: 240px;
}

.stats-list button,
.go-to-row button {
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 3px 7px;
  color: var(--text-soft);
  background: var(--panel-bg);
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
}

.stats-list button:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.stats-list button.active {
  border-color: var(--primary);
  color: var(--on-accent);
  background: var(--primary);
}

.go-to-row {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  white-space: nowrap;
}

.go-to-row input {
  width: 72px;
  min-height: 28px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 4px 6px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-size: 12px;
}

.go-to-row input:focus {
  outline: 2px solid var(--primary);
  outline-offset: -1px;
}

.go-to-row button {
  min-height: 28px;
  padding: 4px 10px;
  font-size: 12px;
}

.checkbox-label {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.error-message,
.status-message {
  margin: 0;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 12px;
  line-height: 1.25;
  grid-column: 1 / -1;
}

.error-message {
  border: 1px solid var(--danger-border-soft);
  color: var(--danger-text-soft);
  background: var(--danger-bg-soft);
}

.status-message {
  border: 1px solid var(--info-border);
  color: var(--info-text);
  background: var(--info-bg);
}

.encoding-table-wrap {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
}

.encoding-grid {
  display: grid;
  min-width: max-content;
}

.header-row {
  position: sticky;
  top: 0;
  z-index: 20;
  background: var(--header-bg);
  border-bottom: 1px solid var(--border);
  box-shadow: 0 1px 0 var(--border);
}

.header-cell {
  position: relative;
  min-height: 58px;
  display: flex;
  align-items: stretch;
  padding: 7px 12px;
  border-right: 1px solid var(--border);
  color: var(--text-soft);
  background: var(--header-bg);
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

.header-row-actions {
  display: flex;
  gap: 6px;
  align-items: center;
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

.data-row {
  border-bottom: 1px solid var(--border-soft);
}

.data-row:last-child {
  border-bottom: none;
}

.data-row > div {
  border-right: 1px solid var(--border-soft);
}

.data-row > div:last-child {
  border-right: none;
}

.encoding-rows-scroll {
  min-width: max-content;
}

.virtual-spacer {
  min-width: 1px;
  pointer-events: none;
}

.row-number-cell,
.textarea-cell {
  position: relative;
  min-height: 42px;
  background: var(--panel-bg);
}

.row-number-cell {
  display: grid;
  grid-template-columns: auto auto 1fr;
  align-items: flex-start;
  gap: 6px;
  padding: 9px 10px;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
}

.row-select-checkbox {
  width: 14px;
  height: 14px;
  margin: 3px 0 0;
  accent-color: var(--primary);
}

.row-actions {
  display: flex;
  gap: 4px;
}

.row-action-btn {
  width: 20px;
  height: 20px;
  border: 1px solid transparent;
  border-radius: 5px;
  padding: 0;
  color: var(--on-accent);
  font-size: 12px;
  font-weight: 800;
  line-height: 18px;
}

.add-row-btn,
.confirm-delete-btn {
  border-color: var(--success-hover);
  background: var(--success);
}

.add-row-btn:hover,
.confirm-delete-btn:hover {
  background: var(--success-hover);
}

.request-delete-btn,
.cancel-delete-btn {
  border-color: var(--danger-hover);
  background: var(--danger);
}

.request-delete-btn:hover,
.cancel-delete-btn:hover {
  background: var(--danger-hover);
}

.row-number {
  justify-self: end;
}

.textarea-cell > textarea,
.textarea-measure {
  width: 100%;
  padding: 9px 10px;
  font-size: 14px;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.textarea-cell > textarea {
  position: absolute;
  inset: 0;
  height: 100%;
  border: 0;
  border-radius: 0;
  resize: none;
  overflow: hidden;
  color: var(--input-text);
  background: transparent;
}

.textarea-cell > textarea:focus {
  z-index: 3;
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

.textarea-measure {
  min-height: 42px;
  visibility: hidden;
  pointer-events: none;
}

.empty-state {
  flex: 1;
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}

:deep(.dialog-backdrop) {
  position: fixed;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(15 23 42 / 45%);
}

:deep(.go-to-row-dialog) {
  width: min(320px, 100%);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  color: var(--text);
  background: var(--panel-bg);
  box-shadow: 0 18px 45px rgb(15 23 42 / 22%);
}

:deep(.go-to-row-dialog h2) {
  margin: 0 0 10px;
  font-size: 16px;
  line-height: 1.2;
}

:deep(.go-to-row-dialog label) {
  display: block;
  margin-bottom: 5px;
  color: var(--text-soft);
  font-size: 12px;
}

:deep(.go-to-row-dialog input) {
  width: 100%;
  min-height: 34px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-size: 14px;
}

:deep(.go-to-row-dialog input:focus) {
  outline: 2px solid var(--primary);
  outline-offset: -1px;
}

:deep(.dialog-actions) {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

:deep(.dialog-actions button) {
  min-height: 30px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 5px 12px;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 13px;
}

:deep(.dialog-actions button[type="submit"]) {
  border-color: var(--primary-hover);
  color: var(--on-accent);
  background: var(--primary);
}

:deep(.dialog-actions button:disabled) {
  border-color: var(--control-border);
  color: var(--muted);
  background: var(--disabled-bg);
  cursor: not-allowed;
}

@media (max-width: 980px) {
  .encoding-top-panel {
    grid-template-columns: 1fr;
  }
}
</style>
