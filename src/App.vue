<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { confirm, open as openDialog, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readFile, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import ExcelExportDialog from "./components/ExcelExportDialog.vue";
import ExcelImportDialog from "./components/ExcelImportDialog.vue";
import GoToRowDialog from "./components/GoToRowDialog.vue";
import {
  cjkFallbackOptions,
  cjkFallbackStorageKey,
  columnFontSizeStorageKey,
  columns,
  columnWidthStorageKey,
  defaultColumnFontSizes,
  defaultColumnWidths,
  draftStorageKey,
  estimatedRowHeight,
  maxHistorySteps,
  minColumnWidths,
  stateOptions,
  textMatchOptions,
  textSearchColumns,
  themeOptions,
  themeStorageKey,
  virtualOverscanRows,
} from "./constants";
import {
  buildXlsxWorkbook,
  ensureXlsxExtension,
  excelCellText,
  excelSheetsForRows,
  optionalPositiveInteger,
  readXlsxWorkbook,
  requiredPositiveInteger,
} from "./excel";
import type {
  CjkFallbackColumn,
  CjkFallbackMode,
  FileNameImportMode,
  SentenceInput,
  SentenceRow,
  StateValue,
  StatFilter,
  StatSnapshot,
  StoredDraft,
  TableSnapshot,
  TextMatchMode,
  TextSearchKey,
  ThemeMode,
} from "./types";

const columnWidths = ref(restoreColumnWidths());
const columnFontSizes = ref(restoreColumnFontSizes());
const cjkFallbackPrefs = ref(restoreCjkFallbackPrefs());
const rows = ref<SentenceRow[]>([]);
const fileName = ref("");
const errorMessage = ref("");
const statusMessage = ref("");
const isSaving = ref(false);
const isExportingExcel = ref(false);
const isImportingExcel = ref(false);
const searchText = ref("");
const textMatchMode = ref<TextMatchMode>("contains");
const isCaseSensitiveSearch = ref(false);
const activeStatFilters = ref<StatFilter[]>([]);
const statSnapshot = ref<StatSnapshot>(createEmptyStatSnapshot());
const isStatSnapshotDirty = ref(false);
const goToRowValue = ref("");
const isGoToRowDialogOpen = ref(false);
const isExcelImportDialogOpen = ref(false);
const isExcelExportDialogOpen = ref(false);
const excelImportPath = ref("");
const excelImportStartRow = ref(2);
const excelImportTitleColumn = ref("");
const excelImportOriginalColumn = ref("2");
const excelImportTranslatedColumn = ref("3");
const excelImportNoteColumn = ref("");
const excelImportStateColumn = ref("");
const excelImportFileNameMode = ref<FileNameImportMode>("none");
const excelImportFileNameColumn = ref("");
const excelExportPath = ref("");
const exportFilteredOnly = ref(false);
const exportSplitByFileName = ref(false);
const exportIncludeRowNumber = ref(true);
const selectedRowIds = ref<Set<number>>(new Set());
const pendingDeleteIndex = ref<number | null>(null);
const undoStack = ref<string[]>([]);
const redoStack = ref<string[]>([]);
const themeMode = ref<ThemeMode>(restoreThemeMode());
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
let nextRowIdentity = 1;
let unlistenRefreshFilters: UnlistenFn | undefined;
let unlistenOpenGoToRow: UnlistenFn | undefined;
let unlistenReadJson: UnlistenFn | undefined;
let unlistenSaveJson: UnlistenFn | undefined;
let unlistenImportExcel: UnlistenFn | undefined;
let unlistenExportExcel: UnlistenFn | undefined;
let unlistenUndoTableChange: UnlistenFn | undefined;
let unlistenRedoTableChange: UnlistenFn | undefined;
let unlistenClearList: UnlistenFn | undefined;
let unlistenDeleteSelected: UnlistenFn | undefined;
let pendingEditSnapshot: string | null = null;
const rowResizeObservers = new Map<number, ResizeObserver>();
const rowElements = new Map<number, HTMLElement>();
const rowIdentities = new WeakMap<SentenceRow, number>();
const appWindow = getCurrentWindow();

const gridTemplateColumns = computed(() =>
  columnWidths.value.map((width) => `${width}px`).join(" "),
);

const appShellClasses = computed(() => [
  `theme-${themeMode.value}`,
  { "platform-linux": isLinuxPlatform() },
]);

const canSaveJson = computed(() => rows.value.length > 0 && !isSaving.value);
const canImportExcel = computed(
  () =>
    excelImportPath.value.trim() !== "" &&
    excelImportOriginalColumn.value.trim() !== "" &&
    excelImportTranslatedColumn.value.trim() !== "" &&
    (excelImportFileNameMode.value !== "column" ||
      excelImportFileNameColumn.value.trim() !== "") &&
    excelImportStartRow.value >= 1 &&
    !isImportingExcel.value,
);
const canExportExcel = computed(
  () =>
    rows.value.length > 0 &&
    excelExportPath.value.trim() !== "" &&
    !isExportingExcel.value,
);
const canUndoTableChange = computed(() => undoStack.value.length > 0);
const canRedoTableChange = computed(() => redoStack.value.length > 0);

const selectedRowCount = computed(() => selectedRowIds.value.size);

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

const textFilteredRows = computed(() => {
  const rawQuery = searchText.value.trim();
  const query = normalizeSearchValue(rawQuery);
  const searchableColumns = selectedSearchColumns.value;

  return rows.value
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      return (
        query === "" ||
        searchableColumns.some((key) => textMatches(row[key], query))
      );
    });
});

const filteredRows = computed(() =>
  textFilteredRows.value.filter(({ row }) => rowMatchesStatFilter(row)),
);

const rowStats = computed(() => {
  return {
    duplicateTitleAddresses: statSnapshot.value.duplicateTitleAddresses,
    emptyTranslations: statSnapshot.value.emptyTranslations,
    filtered: filteredRows.value.length,
    notTranslated: statSnapshot.value.notTranslated,
    rowsWithNotes: statSnapshot.value.rowsWithNotes,
    stateCounts: statSnapshot.value.stateCounts,
    total: statSnapshot.value.total,
  };
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

restoreDraft();
syncWindowTheme();
registerMenuListeners();
window.addEventListener("focus", handleWindowFocus);

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
  cjkFallbackPrefs,
  () => {
    persistCjkFallbackPrefs();
    resetVirtualRowState();
    updateTableViewport();
  },
  { deep: true },
);

watch(themeMode, () => {
  persistThemeMode();
  syncWindowTheme();
});

watch(
  () => [canUndoTableChange.value, canRedoTableChange.value],
  () => {
    syncHistoryMenuState();
  },
  { immediate: true },
);

watch(
  () => [
    searchText.value,
    textMatchMode.value,
    String(isCaseSensitiveSearch.value),
    activeStatFilters.value.map(statFilterKey).join("|"),
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

watch(
  () => rows.value.length,
  () => {
    pruneSelectedRows();
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

onBeforeUnmount(() => {
  rowResizeObservers.forEach((observer) => observer.disconnect());
  rowResizeObservers.clear();
  rowElements.clear();
  unlistenRefreshFilters?.();
  unlistenOpenGoToRow?.();
  unlistenReadJson?.();
  unlistenSaveJson?.();
  unlistenImportExcel?.();
  unlistenExportExcel?.();
  unlistenUndoTableChange?.();
  unlistenRedoTableChange?.();
  unlistenClearList?.();
  unlistenDeleteSelected?.();
  window.removeEventListener("focus", handleWindowFocus);
});

function openFilePicker() {
  fileInput.value?.click();
}

function isLinuxPlatform() {
  return /Linux/i.test(window.navigator.userAgent);
}

function handleWindowFocus() {
  syncHistoryMenuState();
}

function registerMenuListeners() {
  listen("refresh-filters", () => {
    refreshStatSnapshot();
  })
    .then((unlisten) => {
      unlistenRefreshFilters = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register menu listeners.", error);
    });

  listen("open-go-to-row", () => {
    openGoToRowDialog();
  })
    .then((unlisten) => {
      unlistenOpenGoToRow = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register go to row menu listener.", error);
    });

  listen("read-json", () => {
    openFilePicker();
  })
    .then((unlisten) => {
      unlistenReadJson = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register read JSON menu listener.", error);
    });

  listen("save-json", () => {
    void saveJsonFile();
  })
    .then((unlisten) => {
      unlistenSaveJson = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register save JSON menu listener.", error);
    });

  listen("import-excel", () => {
    void openExcelImportDialog();
  })
    .then((unlisten) => {
      unlistenImportExcel = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register import Excel menu listener.", error);
    });

  listen("export-excel", () => {
    void openExcelExportDialog();
  })
    .then((unlisten) => {
      unlistenExportExcel = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register export Excel menu listener.", error);
    });

  listen("undo-table-change", () => {
    undoTableChange();
  })
    .then((unlisten) => {
      unlistenUndoTableChange = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register undo table change menu listener.", error);
    });

  listen("redo-table-change", () => {
    redoTableChange();
  })
    .then((unlisten) => {
      unlistenRedoTableChange = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register redo table change menu listener.", error);
    });

  listen("clear-list", () => {
    void clearRows();
  })
    .then((unlisten) => {
      unlistenClearList = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register clear list menu listener.", error);
    });

  listen("delete-selected", () => {
    void deleteSelectedRows();
  })
    .then((unlisten) => {
      unlistenDeleteSelected = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register delete selected menu listener.", error);
    });
}

async function openGoToRowDialog() {
  isGoToRowDialogOpen.value = true;
}

async function openExcelExportDialog() {
  if (excelExportPath.value.trim() === "") {
    excelExportPath.value = defaultExcelExportPath();
  }

  isExcelExportDialogOpen.value = true;
}

function closeExcelExportDialog() {
  isExcelExportDialogOpen.value = false;
}

async function openExcelImportDialog() {
  isExcelImportDialogOpen.value = true;
}

function closeExcelImportDialog() {
  isExcelImportDialogOpen.value = false;
}

function closeGoToRowDialog() {
  isGoToRowDialogOpen.value = false;
}

async function confirmGoToRowDialog() {
  if (await goToRow()) {
    closeGoToRowDialog();
  }
}

function createTableSnapshot() {
  const snapshot: TableSnapshot = {
    fileName: fileName.value,
    rows: rows.value,
  };

  return JSON.stringify(snapshot);
}

function restoreTableSnapshot(snapshot: string) {
  const parsed = JSON.parse(snapshot) as TableSnapshot;

  rows.value = parsed.rows.map(normalizeStoredRow);
  fileName.value = toText(parsed.fileName);
  pendingDeleteIndex.value = null;
  pendingEditSnapshot = null;
  clearSelectedRows();
  resetVirtualRowState();
  refreshStatSnapshot();
  tableScrollTop.value = 0;
  if (tableWrap.value) {
    tableWrap.value.scrollTop = 0;
  }
}

function pushHistorySnapshot(stack: string[], snapshot: string) {
  if (stack[stack.length - 1] === snapshot) return stack;

  return [...stack, snapshot].slice(-maxHistorySteps);
}

function recordHistoryStep(snapshot = createTableSnapshot()) {
  if (snapshot === createTableSnapshot()) return;

  undoStack.value = pushHistorySnapshot(undoStack.value, snapshot);
  redoStack.value = [];
}

function recordCurrentStateForUndo() {
  undoStack.value = pushHistorySnapshot(undoStack.value, createTableSnapshot());
  redoStack.value = [];
}

function flushPendingTableEdit() {
  if (!pendingEditSnapshot) return;

  const snapshot = pendingEditSnapshot;
  pendingEditSnapshot = null;
  recordHistoryStep(snapshot);
}

function undoTableChange() {
  flushPendingTableEdit();
  if (!canUndoTableChange.value) return;

  const currentSnapshot = createTableSnapshot();
  const snapshot = undoStack.value[undoStack.value.length - 1];
  undoStack.value = undoStack.value.slice(0, -1);
  redoStack.value = pushHistorySnapshot(redoStack.value, currentSnapshot);
  restoreTableSnapshot(snapshot);
  statusMessage.value = "Undid table change.";
}

function redoTableChange() {
  flushPendingTableEdit();
  if (!canRedoTableChange.value) return;

  const currentSnapshot = createTableSnapshot();
  const snapshot = redoStack.value[redoStack.value.length - 1];
  redoStack.value = redoStack.value.slice(0, -1);
  undoStack.value = pushHistorySnapshot(undoStack.value, currentSnapshot);
  restoreTableSnapshot(snapshot);
  statusMessage.value = "Redid table change.";
}

function beginTableEdit() {
  pendingEditSnapshot ??= createTableSnapshot();
}

function commitTableEdit() {
  if (!pendingEditSnapshot) return;

  recordHistoryStep(pendingEditSnapshot);
  pendingEditSnapshot = null;
}

function commitSelectEdit() {
  markStatSnapshotDirty();
  commitTableEdit();
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

async function browseExcelImportPath() {
  const path = await openDialog({
    title: "Import Excel",
    multiple: false,
    filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
  });

  if (typeof path === "string") {
    excelImportPath.value = path;
  }
}

async function confirmExcelImport() {
  if (!canImportExcel.value) return;

  try {
    errorMessage.value = "";
    statusMessage.value = "";
    isImportingExcel.value = true;

    const importedRows = await rowsFromExcelImport();
    if (importedRows.length === 0) {
      throw new Error("No valid rows were found in the selected Excel file.");
    }

    recordCurrentStateForUndo();
    rows.value = importedRows;
    fileName.value = excelImportPath.value.split(/[\\/]/).pop() ?? "Imported Excel";
    clearSelectedRows();
    pendingDeleteIndex.value = null;
    resetVirtualRowState();
    refreshStatSnapshot();
    closeExcelImportDialog();
    statusMessage.value = `Excel imported: ${importedRows.length} row${importedRows.length === 1 ? "" : "s"}.`;
  } catch (error) {
    errorMessage.value = formatError(error, "Failed to import Excel file.");
  } finally {
    isImportingExcel.value = false;
  }
}

async function rowsFromExcelImport() {
  const startRow = requiredPositiveInteger(excelImportStartRow.value, "Start row");
  const titleColumn = optionalPositiveInteger(
    excelImportTitleColumn.value,
    "title_addr column",
  );
  const originalColumn = requiredPositiveInteger(
    excelImportOriginalColumn.value,
    "original_text column",
  );
  const translatedColumn = requiredPositiveInteger(
    excelImportTranslatedColumn.value,
    "translated_text column",
  );
  const noteColumn = optionalPositiveInteger(
    excelImportNoteColumn.value,
    "note column",
  );
  const stateColumn = optionalPositiveInteger(
    excelImportStateColumn.value,
    "state column",
  );
  const fileNameColumn =
    excelImportFileNameMode.value === "column"
      ? requiredPositiveInteger(excelImportFileNameColumn.value, "file_name column")
      : null;
  const workbook = await readXlsxWorkbook(await readFile(excelImportPath.value.trim()));
  const outputRows: SentenceRow[] = [];

  for (const sheet of workbook) {
    for (let rowIndex = startRow - 1; rowIndex < sheet.rows.length; rowIndex += 1) {
      const cells = sheet.rows[rowIndex] ?? [];
      const originalText = excelCellText(cells, originalColumn);
      const translatedText = excelCellText(cells, translatedColumn);
      const titleAddr = titleColumn ? excelCellText(cells, titleColumn) : "";
      const note = noteColumn ? excelCellText(cells, noteColumn) : "";
      const state = stateColumn
        ? normalizeState(excelCellText(cells, stateColumn))
        : "❓unmarked";
      const importedFileName =
        excelImportFileNameMode.value === "sheet"
          ? sheet.name
          : fileNameColumn
            ? excelCellText(cells, fileNameColumn)
            : "";

      if (
        titleAddr === "" &&
        originalText === "" &&
        translatedText === "" &&
        note === "" &&
        importedFileName === ""
      ) {
        continue;
      }

      outputRows.push({
        title_addr: titleAddr,
        original_text: originalText,
        translated_text: translatedText,
        note,
        state,
        file_name: importedFileName,
      });
    }
  }

  return outputRows;
}

function defaultExcelExportPath() {
  const baseName = fileName.value.replace(/\.[^.]+$/, "") || "sentences";
  return `${baseName}.xlsx`;
}

async function browseExcelExportPath() {
  const path = await save({
    title: "Export Excel",
    defaultPath: excelExportPath.value.trim() || defaultExcelExportPath(),
    filters: [{ name: "Excel Workbook", extensions: ["xlsx"] }],
  });

  if (path) {
    excelExportPath.value = ensureXlsxExtension(path);
  }
}

async function confirmExcelExport() {
  if (!canExportExcel.value) return;

  try {
    errorMessage.value = "";
    statusMessage.value = "";
    isExportingExcel.value = true;

    const exportRows = rowsForExcelExport();
    if (exportRows.length === 0) {
      throw new Error("There are no rows to export.");
    }

    const path = ensureXlsxExtension(excelExportPath.value.trim());
    const sheets = excelSheetsForRows(
      exportRows,
      exportSplitByFileName.value,
    );
    await writeFile(
      path,
      buildXlsxWorkbook(
        sheets,
        exportIncludeRowNumber.value,
        columnWidths.value,
      ),
    );

    excelExportPath.value = path;
    closeExcelExportDialog();
    statusMessage.value = `Excel exported: ${exportRows.length} row${exportRows.length === 1 ? "" : "s"}.`;
  } catch (error) {
    errorMessage.value = formatError(error, "Failed to export Excel file.");
  } finally {
    isExportingExcel.value = false;
  }
}

function rowsForExcelExport() {
  if (exportFilteredOnly.value) {
    return filteredRows.value.map(({ row, index }) => ({ row, index }));
  }

  return rows.value.map((row, index) => ({ row, index }));
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

    recordCurrentStateForUndo();
    rows.value = parsed.map(normalizeSentence);
    clearSelectedRows();
    fileName.value = file.name;
    refreshStatSnapshot();
    statusMessage.value = "Loaded and auto-saved.";
  } catch (error) {
    recordCurrentStateForUndo();
    rows.value = [];
    clearSelectedRows();
    fileName.value = "";
    refreshStatSnapshot();
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
  recordCurrentStateForUndo();
  rows.value.splice(rowIndex + 1, 0, createEmptyRow());
  if (pendingDeleteIndex.value !== null && pendingDeleteIndex.value > rowIndex) {
    pendingDeleteIndex.value += 1;
  }
  markStatSnapshotDirty();
}

function addRowAtEnd() {
  recordCurrentStateForUndo();
  rows.value.push(createEmptyRow());
  markStatSnapshotDirty();
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

  recordCurrentStateForUndo();
  rows.value = [];
  clearSelectedRows();
  pendingDeleteIndex.value = null;
  refreshStatSnapshot();
  statusMessage.value = "List cleared.";
}

async function deleteSelectedRows() {
  if (selectedRowIds.value.size === 0) return;

  const deleteCount = selectedRowIds.value.size;
  const confirmed = await confirm(
    `Delete ${deleteCount} selected row${deleteCount === 1 ? "" : "s"}? This cannot be undone.`,
    {
      title: "Delete Selected Rows",
      kind: "warning",
    },
  );

  if (!confirmed) return;

  recordCurrentStateForUndo();
  const idsToDelete = selectedRowIds.value;
  rows.value = rows.value.filter((row) => !idsToDelete.has(getRowIdentity(row)));
  clearSelectedRows();
  pendingDeleteIndex.value = null;
  pruneVirtualRowState();
  markStatSnapshotDirty();
  statusMessage.value = `Deleted ${deleteCount} selected row${deleteCount === 1 ? "" : "s"}.`;
}

function requestDeleteRow(rowIndex: number) {
  pendingDeleteIndex.value = rowIndex;
}

function cancelDeleteRow() {
  pendingDeleteIndex.value = null;
}

function confirmDeleteRow(rowIndex: number) {
  recordCurrentStateForUndo();
  const row = rows.value[rowIndex];
  if (row) {
    selectedRowIds.value.delete(getRowIdentity(row));
    selectedRowIds.value = new Set(selectedRowIds.value);
  }
  rows.value.splice(rowIndex, 1);
  pendingDeleteIndex.value = null;
  pruneVirtualRowState();
  markStatSnapshotDirty();
}

function toggleRowSelection(row: SentenceRow, checked: boolean) {
  const nextSelectedIds = new Set(selectedRowIds.value);
  const rowId = getRowIdentity(row);

  if (checked) {
    nextSelectedIds.add(rowId);
  } else {
    nextSelectedIds.delete(rowId);
  }

  selectedRowIds.value = nextSelectedIds;
}

function handleRowSelectionChange(row: SentenceRow, event: Event) {
  toggleRowSelection(row, (event.currentTarget as HTMLInputElement).checked);
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

function clearSelectedRows() {
  selectedRowIds.value = new Set();
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

function resetVirtualRowState() {
  rowResizeObservers.forEach((observer) => observer.disconnect());
  rowResizeObservers.clear();
  rowElements.clear();
  rowHeights.value = {};
}

async function goToRow() {
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
  const filteredIndex = filteredRows.value.findIndex(
    (item) => item.index === targetRowIndex,
  );

  if (filteredIndex === -1) {
    statusMessage.value = "";
    errorMessage.value = `Row ${targetRowNumber} is hidden by the current search filters.`;
    return false;
  }

  errorMessage.value = "";
  statusMessage.value = `Jumped to row ${targetRowNumber}.`;

  const nextScrollTop = sumRowHeights(filteredRows.value, 0, filteredIndex);
  tableScrollTop.value = nextScrollTop;
  if (tableWrap.value) {
    tableWrap.value.scrollTop = nextScrollTop;
  }
  updateTableViewport();
  await nextTick();
  alignRenderedRow(filteredRows.value[filteredIndex].row);
  return true;
}

function rowHeight(row: SentenceRow) {
  return rowHeights.value[getRowIdentity(row)] ?? estimatedRowHeight;
}

function sumRowHeights(
  items: { row: SentenceRow; index: number }[],
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

function alignRenderedRow(row: SentenceRow) {
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

function setVirtualRowElement(element: unknown, row: SentenceRow) {
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

function textColumnStyle(columnIndex: number, column: CjkFallbackColumn) {
  return {
    ...columnFontStyle(columnIndex),
    fontFamily: cjkFontFamily(cjkFallbackPrefs.value[column]),
  };
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

function persistCjkFallbackPrefs() {
  window.localStorage.setItem(
    cjkFallbackStorageKey,
    JSON.stringify(cjkFallbackPrefs.value),
  );
}

function persistThemeMode() {
  window.localStorage.setItem(themeStorageKey, themeMode.value);
}

function syncWindowTheme() {
  appWindow.setTheme(themeMode.value).catch((error) => {
    console.warn("Failed to sync native window theme.", error);
    // The web theme still works if native titlebar theming is unavailable.
  });
}

function syncHistoryMenuState() {
  invoke("set_history_menu_enabled", {
    canUndo: canUndoTableChange.value,
    canRedo: canRedoTableChange.value,
  }).catch((error) => {
    console.warn("Failed to sync history menu state.", error);
  });
}

function refreshStatSnapshot() {
  statSnapshot.value = buildStatSnapshot();
  isStatSnapshotDirty.value = false;
  tableScrollTop.value = 0;
  if (tableWrap.value) {
    tableWrap.value.scrollTop = 0;
  }
}

function markStatSnapshotDirty() {
  isStatSnapshotDirty.value = true;
}

function buildStatSnapshot(): StatSnapshot {
  const snapshot = createEmptyStatSnapshot();
  const titleAddressCounts = new Map<string, number>();

  snapshot.total = rows.value.length;

  for (const row of rows.value) {
    const normalizedTitleAddress = row.title_addr.trim();
    if (normalizedTitleAddress === "") continue;

    titleAddressCounts.set(
      normalizedTitleAddress,
      (titleAddressCounts.get(normalizedTitleAddress) ?? 0) + 1,
    );
  }

  for (const row of rows.value) {
    const rowId = getRowIdentity(row);
    snapshot.stateCounts[row.state] += 1;
    addStatMembership(snapshot, { type: "state", state: row.state }, rowId);

    if (row.translated_text.trim() === "") {
      snapshot.emptyTranslations += 1;
      addStatMembership(snapshot, { type: "empty_translation" }, rowId);
    }

    if (isNotTranslated(row)) {
      snapshot.notTranslated += 1;
      addStatMembership(snapshot, { type: "not_translated" }, rowId);
    }

    if (row.note.trim() !== "") {
      snapshot.rowsWithNotes += 1;
      addStatMembership(snapshot, { type: "has_note" }, rowId);
    }

    if ((titleAddressCounts.get(row.title_addr.trim()) ?? 0) > 1) {
      snapshot.duplicateTitleAddresses += 1;
      addStatMembership(snapshot, { type: "duplicate_title_addr" }, rowId);
    }
  }

  return snapshot;
}

function createEmptyStatSnapshot(): StatSnapshot {
  return {
    duplicateTitleAddresses: 0,
    emptyTranslations: 0,
    memberships: new Map(),
    notTranslated: 0,
    rowsWithNotes: 0,
    stateCounts: Object.fromEntries(
      stateOptions.map((state) => [state, 0]),
    ) as Record<StateValue, number>,
    total: rows.value.length,
  };
}

function addStatMembership(
  snapshot: StatSnapshot,
  filter: StatFilter,
  rowId: number,
) {
  const filterKey = statFilterKey(filter);
  const membership = snapshot.memberships.get(filterKey) ?? new Set<number>();
  membership.add(rowId);
  snapshot.memberships.set(filterKey, membership);
}

function getRowIdentity(row: SentenceRow) {
  const existingIdentity = rowIdentities.get(row);
  if (existingIdentity) return existingIdentity;

  const nextIdentity = nextRowIdentity;
  nextRowIdentity += 1;
  rowIdentities.set(row, nextIdentity);
  return nextIdentity;
}

function isNotTranslated(row: SentenceRow) {
  const originalText = row.original_text.trim();
  return originalText !== "" && originalText === row.translated_text.trim();
}

function clearStatFilters() {
  activeStatFilters.value = [];
}

function toggleStatFilter(filter: StatFilter) {
  const filterKey = statFilterKey(filter);
  const nextFilters = activeStatFilters.value.filter(
    (activeFilter) => statFilterKey(activeFilter) !== filterKey,
  );

  if (nextFilters.length === activeStatFilters.value.length) {
    nextFilters.push(filter);
  }

  activeStatFilters.value = nextFilters;
}

function isStatFilterActive(filter: StatFilter) {
  const filterKey = statFilterKey(filter);
  return activeStatFilters.value.some(
    (activeFilter) => statFilterKey(activeFilter) === filterKey,
  );
}

function hasActiveStatFilters() {
  return activeStatFilters.value.length > 0;
}

function statFilterKey(filter: StatFilter) {
  if (filter.type === "state") return `state:${filter.state}`;
  return filter.type;
}

function rowMatchesStatFilter(row: SentenceRow) {
  if (activeStatFilters.value.length === 0) return true;

  return activeStatFilters.value.some((filter) => rowMatchesSingleStatFilter(row, filter));
}

function rowMatchesSingleStatFilter(row: SentenceRow, filter: StatFilter) {
  const membership = statSnapshot.value.memberships.get(statFilterKey(filter));
  return membership?.has(getRowIdentity(row)) ?? false;
}

function normalizeSearchValue(value: string) {
  return isCaseSensitiveSearch.value ? value : value.toLowerCase();
}

function textMatches(value: string, query: string) {
  const searchableValue = normalizeSearchValue(value);
  if (textMatchMode.value === "exact") {
    return searchableValue === query;
  }

  return searchableValue.includes(query);
}

function restoreThemeMode(): ThemeMode {
  const storedTheme = window.localStorage.getItem(themeStorageKey);
  return storedTheme === "dark" || storedTheme === "light"
    ? storedTheme
    : "light";
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

function restoreCjkFallbackPrefs() {
  const defaults: Record<CjkFallbackColumn, CjkFallbackMode> = {
    original: "default",
    note: "default",
    translated: "default",
  };

  try {
    const rawPrefs = window.localStorage.getItem(cjkFallbackStorageKey);
    if (!rawPrefs) return defaults;

    const parsed = JSON.parse(rawPrefs) as Partial<
      Record<CjkFallbackColumn, unknown>
    >;

    return {
      original: normalizeCjkFallbackMode(parsed.original),
      note: normalizeCjkFallbackMode(parsed.note),
      translated: normalizeCjkFallbackMode(parsed.translated),
    };
  } catch {
    window.localStorage.removeItem(cjkFallbackStorageKey);
    return defaults;
  }
}

function normalizeCjkFallbackMode(value: unknown): CjkFallbackMode {
  return cjkFallbackOptions.some((option) => option.value === value)
    ? (value as CjkFallbackMode)
    : "default";
}

function restoreDraft() {
  try {
    const rawDraft = window.localStorage.getItem(draftStorageKey);
    if (!rawDraft) return;

    const draft = JSON.parse(rawDraft) as Partial<StoredDraft>;
    if (!Array.isArray(draft.rows)) return;

    rows.value = draft.rows.map(normalizeStoredRow);
    fileName.value = toText(draft.fileName);
    refreshStatSnapshot();
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
  <main class="app-shell" :class="appShellClasses">
    <section class="top-panel">
      <header class="toolbar">
        <div class="toolbar-actions">
          <div class="toolbar-controls">
            <select v-model="themeMode" class="theme-select" aria-label="Theme">
              <option
                v-for="theme in themeOptions"
                :key="theme.value"
                :value="theme.value"
              >
                {{ theme.label }}
              </option>
            </select>
            <button type="button" @click="openFilePicker">Read JSON</button>
            <button type="button" :disabled="!canSaveJson" @click="saveJsonFile">
              {{ isSaving ? "Saving..." : "Save JSON" }}
            </button>
            <button type="button" @click="openExcelImportDialog">
              Import Excel
            </button>
            <button
              type="button"
              :disabled="rows.length === 0"
              @click="openExcelExportDialog"
            >
              Export Excel
            </button>
            <button
              class="clear-list-btn"
              type="button"
              :disabled="rows.length === 0"
              @click="clearRows"
            >
              Clear List
            </button>
            <button
              class="delete-selected-btn"
              type="button"
              :disabled="selectedRowCount === 0"
              @click="deleteSelectedRows"
            >
              Delete Selected {{ selectedRowCount > 0 ? selectedRowCount : "" }}
            </button>
          </div>
          <p class="file-status">{{ fileName || "No JSON file loaded" }}</p>
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
          <select v-model="textMatchMode" aria-label="Text match mode">
            <option
              v-for="option in textMatchOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
          <label class="checkbox-label case-checkbox">
            <input v-model="isCaseSensitiveSearch" type="checkbox" />
            <span>Case sensitive</span>
          </label>
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

        <div class="stats-panel" aria-label="Row statistics">
          <div class="stats-list">
            <button
              type="button"
              :class="{ active: !hasActiveStatFilters() }"
              @click="clearStatFilters"
            >
              Total {{ rowStats.total }}
            </button>
            <button
              type="button"
              @click="clearStatFilters"
            >
              Filtered {{ rowStats.filtered }}
            </button>
            <button
              v-for="state in stateOptions"
              :key="state"
              type="button"
              :class="{ active: isStatFilterActive({ type: 'state', state }) }"
              @click="toggleStatFilter({ type: 'state', state })"
            >
              {{ state }} {{ rowStats.stateCounts[state] }}
            </button>
            <button
              type="button"
              :class="{ active: isStatFilterActive({ type: 'empty_translation' }) }"
              @click="toggleStatFilter({ type: 'empty_translation' })"
            >
              Empty translation {{ rowStats.emptyTranslations }}
            </button>
            <button
              type="button"
              :class="{ active: isStatFilterActive({ type: 'not_translated' }) }"
              @click="toggleStatFilter({ type: 'not_translated' })"
            >
              Not translated {{ rowStats.notTranslated }}
            </button>
            <button
              type="button"
              :class="{ active: isStatFilterActive({ type: 'has_note' }) }"
              @click="toggleStatFilter({ type: 'has_note' })"
            >
              Has note {{ rowStats.rowsWithNotes }}
            </button>
            <button
              type="button"
              :class="{ active: isStatFilterActive({ type: 'duplicate_title_addr' }) }"
              @click="toggleStatFilter({ type: 'duplicate_title_addr' })"
            >
              Duplicate title_addr {{ rowStats.duplicateTitleAddresses }}
            </button>
            <button
              class="refresh-stat-btn"
              :class="{ dirty: isStatSnapshotDirty }"
              type="button"
              :title="
                isStatSnapshotDirty
                  ? 'Rows changed. Refresh to update statistic filters.'
                  : 'Update statistic filters.'
              "
              @click="refreshStatSnapshot"
            >
              {{ isStatSnapshotDirty ? "Refresh Filters *" : "Refresh Filters" }}
            </button>
          </div>

          <div class="secondary-actions">
            <form class="go-to-row" aria-label="Go to row" @submit.prevent="goToRow">
              <label for="go-to-row-input">Go to row</label>
              <input
                id="go-to-row-input"
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
            <div
              v-if="column.key === 'original_text'"
              class="fallback-controls"
            >
              <span>Fallback</span>
              <select
                v-model="cjkFallbackPrefs.original"
                aria-label="original_text fallback font preference"
              >
                <option
                  v-for="option in cjkFallbackOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>
            <div
              v-else-if="column.key === 'translated_text'"
              class="fallback-controls"
            >
              <span>Fallback</span>
              <select
                v-model="cjkFallbackPrefs.translated"
                aria-label="translated_text fallback font preference"
              >
                <option
                  v-for="option in cjkFallbackOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ option.label }}
                </option>
              </select>
            </div>
            <div v-else-if="column.key === 'note'" class="fallback-controls">
              <span>Fallback</span>
              <select
                v-model="cjkFallbackPrefs.note"
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
          :key="getRowIdentity(row)"
          :ref="(element) => setVirtualRowElement(element, row)"
          class="sentence-grid data-row"
          :style="{ gridTemplateColumns }"
        >
          <div class="row-number-cell" :style="columnFontStyle(0)">
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
          <div class="textarea-cell" :style="columnFontStyle(1)">
            <textarea
              v-model="row.title_addr"
              aria-label="title_addr"
              @focus="beginTableEdit"
              @input="markStatSnapshotDirty"
              @blur="commitTableEdit"
            />
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
          <div class="textarea-cell" :style="textColumnStyle(2, 'original')">
            <textarea
              v-model="row.original_text"
              aria-label="original_text"
              @focus="beginTableEdit"
              @input="markStatSnapshotDirty"
              @blur="commitTableEdit"
            />
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
          <div class="textarea-cell" :style="textColumnStyle(3, 'translated')">
            <textarea
              v-model="row.translated_text"
              aria-label="translated_text"
              @focus="beginTableEdit"
              @input="markStatSnapshotDirty"
              @blur="commitTableEdit"
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
          <div class="textarea-cell" :style="textColumnStyle(4, 'note')">
            <textarea
              v-model="row.note"
              aria-label="note"
              @focus="beginTableEdit"
              @input="markStatSnapshotDirty"
              @blur="commitTableEdit"
            />
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
            <select
              v-model="row.state"
              aria-label="state"
              @focus="beginTableEdit"
              @change="commitSelectEdit"
              @blur="commitTableEdit"
            >
              <option v-for="state in stateOptions" :key="state" :value="state">
                {{ state }}
              </option>
            </select>
          </div>
          <div class="textarea-cell" :style="columnFontStyle(6)">
            <textarea
              v-model="row.file_name"
              aria-label="file_name"
              @focus="beginTableEdit"
              @input="markStatSnapshotDirty"
              @blur="commitTableEdit"
            />
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

    <GoToRowDialog
      v-if="isGoToRowDialogOpen"
      v-model="goToRowValue"
      :max-row="rows.length"
      @close="closeGoToRowDialog"
      @confirm="confirmGoToRowDialog"
    />

    <ExcelImportDialog
      v-if="isExcelImportDialogOpen"
      v-model:path="excelImportPath"
      v-model:start-row="excelImportStartRow"
      v-model:title-column="excelImportTitleColumn"
      v-model:original-column="excelImportOriginalColumn"
      v-model:translated-column="excelImportTranslatedColumn"
      v-model:note-column="excelImportNoteColumn"
      v-model:state-column="excelImportStateColumn"
      v-model:file-name-mode="excelImportFileNameMode"
      v-model:file-name-column="excelImportFileNameColumn"
      :can-import="canImportExcel"
      :is-importing="isImportingExcel"
      @browse="browseExcelImportPath"
      @close="closeExcelImportDialog"
      @confirm="confirmExcelImport"
    />

    <ExcelExportDialog
      v-if="isExcelExportDialogOpen"
      v-model:path="excelExportPath"
      v-model:filtered-only="exportFilteredOnly"
      v-model:split-by-file-name="exportSplitByFileName"
      v-model:include-row-number="exportIncludeRowNumber"
      :can-export="canExportExcel"
      :is-exporting="isExportingExcel"
      :row-count="rows.length"
      @browse="browseExcelExportPath"
      @close="closeExcelExportDialog"
      @confirm="confirmExcelExport"
    />
  </main>
</template>

<style>
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

.app-shell {
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
  --warning-bg: #fff7ed;
  --warning-border: #fdba74;
  --warning-hover: #ea580c;
  --warning-text: #9a3412;

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
  --warning-bg: #431407;
  --warning-border: #c2410c;
  --warning-hover: #ea580c;
  --warning-text: #fed7aa;
}

.platform-linux.theme-dark select,
.platform-linux.theme-dark option {
  color: var(--input-text);
  background-color: var(--panel-bg);
  color-scheme: dark;
}

.platform-linux.theme-dark .select-cell > select {
  background-color: var(--panel-bg);
}

.top-panel {
  display: grid;
  grid-template-columns: minmax(220px, 0.62fr) minmax(360px, 1.38fr);
  gap: 6px 12px;
  align-items: start;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 8px;
  background: var(--panel-bg);
}

.toolbar {
  min-width: 0;
}

.file-status {
  margin: -2px 0 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toolbar-actions {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.toolbar-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 6px;
  min-width: 0;
}

.toolbar button {
  border: 1px solid var(--primary-hover);
  border-radius: 6px;
  padding: 5px 9px;
  color: var(--on-accent);
  background: var(--primary);
  font-size: 12px;
  font-weight: 650;
  white-space: nowrap;
}

.toolbar .delete-selected-btn {
  flex-basis: 150px;
}

.toolbar button:hover {
  background: var(--primary-hover);
}

.toolbar button:disabled {
  border-color: var(--control-border);
  color: var(--muted);
  background: var(--disabled-bg);
  cursor: not-allowed;
}

.toolbar .clear-list-btn {
  border-color: var(--danger-hover);
  background: var(--danger);
}

.toolbar .delete-selected-btn {
  border-color: var(--danger-hover);
  background: var(--danger);
}

.toolbar .clear-list-btn:hover {
  background: var(--danger-hover);
}

.toolbar .delete-selected-btn:hover {
  background: var(--danger-hover);
}

.toolbar .clear-list-btn:disabled {
  border-color: var(--control-border);
  color: var(--muted);
  background: var(--disabled-bg);
}

.toolbar .delete-selected-btn:disabled {
  border-color: var(--control-border);
  color: var(--muted);
  background: var(--disabled-bg);
}

.theme-select {
  width: 72px;
  min-height: 29px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 4px 8px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-size: 12px;
}

.theme-select:focus {
  outline: 2px solid var(--primary);
  outline-offset: -1px;
}

.file-input {
  display: none;
}

.error-message {
  margin: 0;
  border: 1px solid var(--danger-border-soft);
  border-radius: 6px;
  padding: 5px 8px;
  color: var(--danger-text-soft);
  background: var(--danger-bg-soft);
  font-size: 12px;
  line-height: 1.25;
  grid-column: 1 / -1;
}

.status-message {
  margin: 0;
  border: 1px solid var(--info-border);
  border-radius: 6px;
  padding: 5px 8px;
  color: var(--info-text);
  background: var(--info-bg);
  font-size: 12px;
  line-height: 1.25;
  grid-column: 1 / -1;
}

.search-panel {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.search-main {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 112px max-content auto;
  gap: 8px;
  align-items: center;
}

.search-main input,
.search-main select {
  min-height: 30px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 5px 8px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-size: 13px;
}

.search-main input:focus,
.search-main select:focus {
  outline: 2px solid var(--primary);
  outline-offset: -1px;
}

.result-count {
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}

.search-columns {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 12px;
}

.stats-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
}

.stats-list {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 5px;
  min-width: 240px;
}

.stats-list button {
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 3px 7px;
  color: var(--text-soft);
  background: var(--table-header-bg);
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

.stats-list .refresh-stat-btn {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--panel-bg);
  font-weight: 650;
}

.stats-list .refresh-stat-btn:hover {
  color: var(--on-accent);
  background: var(--primary);
}

.stats-list .refresh-stat-btn.dirty {
  border-color: var(--warning-border);
  color: var(--warning-text);
  background: var(--warning-bg);
}

.stats-list .refresh-stat-btn.dirty:hover {
  border-color: var(--warning-hover);
  color: var(--on-accent);
  background: var(--warning-hover);
}

.secondary-actions {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.go-to-row {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-soft);
  font-size: 12px;
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
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 4px 10px;
  color: var(--button-text);
  background: var(--button-bg);
  font-size: 12px;
}

.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(15 23 42 / 45%);
}

.go-to-row-dialog,
.excel-import-dialog,
.export-excel-dialog {
  width: min(320px, 100%);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  color: var(--text);
  background: var(--panel-bg);
  box-shadow: 0 18px 45px rgb(15 23 42 / 22%);
}

.excel-import-dialog,
.export-excel-dialog {
  width: min(560px, 100%);
}

.go-to-row-dialog h2,
.excel-import-dialog h2,
.export-excel-dialog h2 {
  margin: 0 0 10px;
  font-size: 16px;
  line-height: 1.2;
}

.go-to-row-dialog label,
.excel-import-dialog > label,
.export-excel-dialog > label {
  display: block;
  margin-bottom: 5px;
  color: var(--text-soft);
  font-size: 12px;
}

.go-to-row-dialog input,
.excel-import-dialog input[type="text"],
.excel-import-dialog input[type="number"],
.excel-import-dialog select,
.export-excel-dialog input[type="text"] {
  width: 100%;
  min-height: 34px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 6px 8px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-size: 14px;
}

.go-to-row-dialog input:focus,
.excel-import-dialog input:focus,
.excel-import-dialog select:focus,
.export-excel-dialog input[type="text"]:focus {
  outline: 2px solid var(--primary);
  outline-offset: -1px;
}

.dialog-hint {
  margin: -4px 0 10px;
  color: var(--muted);
  font-size: 12px;
}

.path-picker-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.path-picker-row button {
  min-height: 34px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 6px 12px;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 13px;
}

.path-picker-row button:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.export-options {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.excel-import-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.excel-import-grid label {
  display: grid;
  gap: 4px;
  color: var(--text-soft);
  font-size: 12px;
}

.excel-import-grid input:disabled {
  color: var(--muted);
  background: var(--disabled-bg);
  cursor: not-allowed;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
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

.dialog-actions button:disabled {
  border-color: var(--control-border);
  color: var(--muted);
  background: var(--disabled-bg);
  cursor: not-allowed;
}

.checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-soft);
  font-size: 12px;
  line-height: 1.2;
}

.checkbox-label input {
  width: 14px;
  height: 14px;
  margin: 0;
}

.case-checkbox {
  white-space: nowrap;
}

@media (max-width: 980px) {
  .top-panel {
    grid-template-columns: 1fr;
  }

  .search-main {
    grid-template-columns: minmax(180px, 1fr) 112px max-content;
  }

  .result-count {
    grid-column: 1 / -1;
  }
}

.table-wrap {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel-bg);
}

.sentence-grid {
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
  color: var(--muted);
  font-size: 11px;
  font-weight: 650;
}

.font-size-readout {
  color: var(--muted);
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
  border: 1px solid var(--control-border);
  border-radius: 5px;
  padding: 0;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 13px;
  line-height: 1;
}

.font-size-controls button:hover {
  border-color: var(--hint);
  background: var(--control-hover-bg);
}

.font-size-controls span {
  text-align: center;
  white-space: nowrap;
}

.fallback-controls {
  display: grid;
  grid-template-columns: max-content minmax(72px, 1fr);
  align-items: center;
  gap: 4px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 650;
}

.fallback-controls select {
  min-width: 0;
  min-height: 22px;
  border: 1px solid var(--control-border);
  border-radius: 5px;
  padding: 2px 5px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-size: 11px;
}

.fallback-controls select:focus {
  outline: 2px solid var(--primary);
  outline-offset: -1px;
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
  border-bottom: 1px solid var(--border-soft);
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
  border-right: 1px solid var(--border-soft);
  background: var(--panel-bg);
}

.textarea-cell:last-child,
.select-cell:last-child {
  border-right: none;
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

.row-actions {
  display: flex;
  gap: 4px;
}

.row-select-checkbox {
  width: 14px;
  height: 14px;
  margin: 3px 0 0;
  accent-color: var(--primary);
}

.row-number {
  min-width: 0;
  justify-self: end;
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
  color: var(--input-text);
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
  color: var(--hint);
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
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

.empty-state {
  flex: 1;
  min-height: 220px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
}
</style>
