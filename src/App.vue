<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { confirm, open as openDialog, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { setTheme as setAppTheme } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { readFile, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import AiTranslationDialog, {
  type AiTranslationScope,
  type AiTranslationSettings,
} from "./components/AiTranslationDialog.vue";
import AiTranslationRunDialog from "./components/AiTranslationRunDialog.vue";
import AiTranslationSessionDialog, {
  type AiTranslationApplyMode,
  type AiTranslationApplyTarget,
  type AiTranslationSession,
  type AiTranslationTask,
} from "./components/AiTranslationSessionDialog.vue";
import BulkColumnDialog from "./components/BulkColumnDialog.vue";
import BulkStateDialog from "./components/BulkStateDialog.vue";
import CharacterStatsDialog from "./components/CharacterStatsDialog.vue";
import ExcelExportDialog from "./components/ExcelExportDialog.vue";
import ExcelImportDialog from "./components/ExcelImportDialog.vue";
import GoToRowDialog from "./components/GoToRowDialog.vue";
import LanguageDialog from "./components/LanguageDialog.vue";
import LlmSettingsDialog, {
  type LlmServerSettings,
} from "./components/LlmSettingsDialog.vue";
import MainSearchControls from "./components/MainSearchControls.vue";
import SrtExportDialog, {
  type SrtExportEncoding,
} from "./components/SrtExportDialog.vue";
import SrtImportDialog from "./components/SrtImportDialog.vue";
import {
  cjkFallbackOptions,
  cjkFallbackStorageKey,
  columnFontSizeStorageKey,
  columnOrderStorageKey,
  columnVisibilityStorageKey,
  columns,
  columnWidthStorageKey,
  defaultColumnFontSizes,
  defaultColumnWidths,
  draftStorageKey,
  estimatedRowHeight,
  maxHistorySteps,
  minColumnWidths,
  stateOptions,
  textSearchColumns,
  themeStorageKey,
  topPanelVisibleStorageKey,
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
import {
  currentLanguage,
  normalizeAppLanguage,
  setAppLanguage,
  t,
  type AppLanguage,
} from "./i18n";
import { shortcutMatches, windowsShortcutMatches, type ShortcutAction } from "./shortcuts";
import type {
  CjkFallbackColumn,
  CjkFallbackMode,
  FileNameImportMode,
  SentenceInput,
  SentenceRow,
  StateValue,
  StatFilter,
  StoredDraft,
  TableSnapshot,
  TextMatchMode,
  TextSearchKey,
  ThemeMode,
} from "./types";
const columnWidths = ref(restoreColumnWidths());
const columnFontSizes = ref(restoreColumnFontSizes());
type ColumnKey = (typeof columns)[number]["key"];
const columnOrder = ref<ColumnKey[]>(restoreColumnOrder());
const hiddenColumnKeys = ref<Set<ColumnKey>>(restoreHiddenColumnKeys());
const cjkFallbackPrefs = ref(restoreCjkFallbackPrefs());
const rows = ref<SentenceRow[]>([]);
const fileName = ref("");
const jsonPath = ref("");
const errorMessage = ref("");
const statusMessage = ref("");
const messageTimestamp = ref(formatMessageTimestamp());
const isSaving = ref(false);
const isExportingExcel = ref(false);
const isImportingExcel = ref(false);
const isImportingSrt = ref(false);
const isExportingSrt = ref(false);
const searchText = ref("");
const textMatchMode = ref<TextMatchMode>("contains");
const isCaseSensitiveSearch = ref(false);
const searchLengthColumn = ref<TextSearchKey>("translated_text");
const searchLengthMin = ref("");
const searchLengthMax = ref("");
const activeStatFilters = ref<StatFilter[]>([]);
const goToRowValue = ref("");
const rowFilterStart = ref("");
const rowFilterEnd = ref("");
const isGoToRowDialogOpen = ref(false);
const isCharacterStatsDialogOpen = ref(false);
const isExcelImportDialogOpen = ref(false);
const isExcelExportDialogOpen = ref(false);
const isSrtImportDialogOpen = ref(false);
const isSrtExportDialogOpen = ref(false);
const isLlmSettingsDialogOpen = ref(false);
const isLanguageDialogOpen = ref(false);
const isAiTranslationDialogOpen = ref(false);
const isAiTranslationSessionDialogOpen = ref(false);
const isBulkColumnDialogOpen = ref(false);
const isBulkStateDialogOpen = ref(false);
const isSearchOverlayOpen = ref(false);
const llmSettingsStorageKey = "txtmgr.llmServerSettings.v1";
const llmSettings = ref<LlmServerSettings>(restoreLlmSettings());
const aiTranslationSettingsStorageKey = "txtmgr.aiTranslationSettings.v1";
const aiTranslationSettings = ref<AiTranslationSettings>(restoreAiTranslationSettings());
const bulkStateStorageKey = "txtmgr.bulkStateValue.v1";
const bulkColumnStorageKey = "txtmgr.bulkColumnKey.v1";
const aiTranslationSession = ref<AiTranslationSession | null>(null);
const isPreparingAiTranslation = ref(false);
const aiTranslationSessionMessage = ref(t("common.ready"));
const selectedAiTranslationTaskIds = ref<Set<string>>(new Set());
const aiTranslationApplyTarget = ref<AiTranslationApplyTarget>("translated_text");
const aiTranslationApplyMode = ref<AiTranslationApplyMode>("overwrite");
const updateAiTranslationStateOnApply = ref(true);
const aiTranslationStateOnApply = ref<StateValue>("⭕️temp");
const aiTranslationFinishedText = ref("");
const aiTranslationCurrentText = ref("");
const aiTranslationFinishedPreview = ref("");
const aiTranslationCompletedCount = ref(0);
const aiTranslationErrorCount = ref(0);
const aiTranslationMessage = ref(t("common.ready"));
const isAiTranslationStopRequested = ref(false);
const isAiTranslationFakeMode = ref(false);
const llmApiKeyInput = ref("");
const hasStoredLlmApiKey = ref(false);
const isTestingLlmConnection = ref(false);
const llmSettingsMessage = ref(t("common.ready"));
const excelImportPath = ref("");
const excelImportStartRow = ref(2);
const excelImportTitleColumn = ref("");
const excelImportOriginalColumn = ref("3");
const excelImportTranslatedColumn = ref("4");
const excelImportNoteColumn = ref("");
const excelImportAiOutputColumn = ref("");
const excelImportStateColumn = ref("");
const excelImportFileNameMode = ref<FileNameImportMode>("none");
const excelImportFileNameColumn = ref("");
const excelImportAppendRows = ref(false);
const excelExportPath = ref("");
const exportFilteredOnly = ref(false);
const exportSplitByFileName = ref(false);
const exportIncludeRowNumber = ref(true);
const srtImportPath = ref("");
const srtImportAppendRows = ref(false);
const srtExportPath = ref("");
const srtExportEncoding = ref<SrtExportEncoding>("utf-8");
const srtExportBilingual = ref(false);
const srtExportFilteredOnly = ref(false);
const selectedRowIds = ref<Set<number>>(new Set());
const selectionAnchorRowId = ref<number | null>(null);
type MainBulkEditableColumn = Exclude<keyof SentenceRow, "state">;
const bulkEditableColumns: { key: MainBulkEditableColumn; label: string }[] = [
  { key: "title_addr", label: "title_addr" },
  { key: "original_text", label: "original_text" },
  { key: "translated_text", label: "translated_text" },
  { key: "note", label: "note" },
  { key: "file_name", label: "file_name" },
  { key: "ai_output", label: "ai_output" },
];
const bulkColumnKey = ref<MainBulkEditableColumn>(restoreBulkColumnKey());
const bulkColumnValue = ref("");
const bulkStateValue = ref<StateValue>(restoreBulkStateValue());
const characterStatsScope = ref<"all" | "filtered" | "selected">("filtered");
const characterStatsIncludeAll = ref(true);
const characterStatsTypes = ref<
  ("western" | "han" | "kana" | "hangul" | "fullwidth" | "halfwidth" | "token")[]
>([]);
const characterStatsSortOrder = ref<"desc" | "asc">("desc");
const characterStatsBracketTokenTypes = ref<("square" | "curly" | "angle")[]>([
  "square",
  "curly",
  "angle",
]);
const characterStatsIgnoreWhitespace = ref(true);
const isCountingCharacterStats = ref(false);
const characterStatsProgress = ref(0);
const characterStatsResult = ref("");
const characterStatsMessage = ref(t("stats.notCountedYet"));
const pendingDeleteIndex = ref<number | null>(null);
const isClearRowsConfirmOpen = ref(false);
const isDeleteSelectedConfirmOpen = ref(false);
const undoStack = ref<string[]>([]);
const redoStack = ref<string[]>([]);
const themeMode = ref<ThemeMode>(restoreThemeMode());
const isTopPanelVisible = ref(restoreTopPanelVisible());
const tableWrap = ref<HTMLElement | null>(null);
const topSearchControls = ref<InstanceType<typeof MainSearchControls> | null>(null);
const overlaySearchControls = ref<InstanceType<typeof MainSearchControls> | null>(null);
const tableScrollTop = ref(0);
const tableViewportHeight = ref(600);
const rowHeights = ref<Record<number, number>>({});
const selectedSearchColumns = ref<TextSearchKey[]>(
  textSearchColumns.map((column) => column.key),
);

// Most user-facing state lives in this component because the table, filters,
// import/export dialogs, and AI flow all need the same row list. Keep helpers
// below grouped by workflow instead of splitting state across stores.
let autoSaveTimer: number | undefined;
let columnWidthSaveTimer: number | undefined;
let nextRowIdentity = 1;
let unlistenOpenGoToRow: UnlistenFn | undefined;
let unlistenReadJson: UnlistenFn | undefined;
let unlistenSaveJson: UnlistenFn | undefined;
let unlistenSaveJsonAs: UnlistenFn | undefined;
let unlistenOpenSearchPanel: UnlistenFn | undefined;
let unlistenImportExcel: UnlistenFn | undefined;
let unlistenExportExcel: UnlistenFn | undefined;
let unlistenImportSrt: UnlistenFn | undefined;
let unlistenExportSrt: UnlistenFn | undefined;
let unlistenSetLanguage: UnlistenFn | undefined;
let unlistenOpenLanguageDialog: UnlistenFn | undefined;
let unlistenOpenEncodingManager: UnlistenFn | undefined;
let unlistenOpenCharacterStats: UnlistenFn | undefined;
let unlistenOpenLlmSettings: UnlistenFn | undefined;
let unlistenOpenAiTranslation: UnlistenFn | undefined;
let unlistenUndoTableChange: UnlistenFn | undefined;
let unlistenRedoTableChange: UnlistenFn | undefined;
let unlistenClearList: UnlistenFn | undefined;
let unlistenDeleteSelected: UnlistenFn | undefined;
let unlistenCopySelected: UnlistenFn | undefined;
let unlistenSelectAllFiltered: UnlistenFn | undefined;
let unlistenDeselectAllRows: UnlistenFn | undefined;
let unlistenBulkState: UnlistenFn | undefined;
let unlistenBulkColumn: UnlistenFn | undefined;
let unlistenToggleMainColumnVisibility: UnlistenFn | undefined;
let unlistenToggleMainTopPanel: UnlistenFn | undefined;
let pendingEditSnapshot: string | null = null;
let columnDragTimer: number | undefined;
let draggedColumnKey: ColumnKey | null = null;
let activeColumnDragElement: HTMLElement | null = null;
let lastColumnPointerX = 0;
let lastColumnPointerY = 0;
const columnDropTargetKey = ref<ColumnKey | null>(null);
const rowResizeObservers = new Map<number, ResizeObserver>();
const rowElements = new Map<number, HTMLElement>();

// Row objects can be inserted, deleted, and reordered. A WeakMap identity keeps
// selection/filter bookkeeping stable without mutating imported row data.
const rowIdentities = new WeakMap<SentenceRow, number>();
const appWindow = getCurrentWindow();
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
const systemThemeMode = ref<"light" | "dark">(getSystemThemeMode());
const tableEndSpacerWidth = 24;

const displayedColumns = computed(() =>
  columnOrder.value
    .map((key) => columns.find((column) => column.key === key))
    .filter(
      (column): column is (typeof columns)[number] =>
        column !== undefined &&
        (column.key === "row_number" || !hiddenColumnKeys.value.has(column.key)),
    ),
);

const gridTemplateColumns = computed(() =>
  [
    ...displayedColumns.value.map(
      (column) => `${columnWidths.value[columnIndexByKey(column.key)]}px`,
    ),
    `${tableEndSpacerWidth}px`,
  ].join(" "),
);

const effectiveThemeMode = computed<"light" | "dark">(() =>
  themeMode.value === "system" ? systemThemeMode.value : themeMode.value,
);

const appShellClasses = computed(() => [
  `theme-${effectiveThemeMode.value}`,
  { "top-panel-hidden": !isTopPanelVisible.value },
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
const canImportSrt = computed(
  () => srtImportPath.value.trim() !== "" && !isImportingSrt.value,
);
const canExportSrt = computed(
  () =>
    rows.value.length > 0 &&
    srtExportPath.value.trim() !== "" &&
    !isExportingSrt.value,
);
const canUndoTableChange = computed(() => undoStack.value.length > 0);
const canRedoTableChange = computed(() => redoStack.value.length > 0);

const selectedRowCount = computed(() => selectedRowIds.value.size);

const characterStatsRowCount = computed(() => characterStatsRows().length);
const aiTranslationRowCount = computed(() => aiTranslationRows().length);
const displayedMessage = computed(() => {
  const message = errorMessage.value || statusMessage.value;
  return message ? `${message} ${messageTimestamp.value}` : "";
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

const textFilteredRows = computed(() => {
  const rawQuery = searchText.value.trim();
  const query = normalizeSearchValue(rawQuery);
  const searchableColumns = selectedSearchColumns.value;

  return rows.value
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      const textMatched =
        query === "" || searchableColumns.some((key) => textMatches(row[key], query));
      return textMatched && textLengthMatches(row[searchLengthColumn.value]);
    });
});

// Filtering is intentionally layered: text/length filters run first, then stat
// buttons and row range filters. Counts use the text-filtered base so category
// buttons answer "how many matches remain for this search?".
const filteredRows = computed(() =>
  textFilteredRows.value.filter(
    ({ row, index }) => rowMatchesStatFilter(row) && rowMatchesRowRange(index),
  ),
);

const duplicateTitleAddressIds = computed(() => {
  const groups = new Map<string, number[]>();

  rows.value.forEach((row) => {
    const titleAddress = row.title_addr.trim();
    if (titleAddress === "") return;
    groups.set(titleAddress, [...(groups.get(titleAddress) ?? []), getRowIdentity(row)]);
  });

  return new Set(
    Array.from(groups.values())
      .filter((ids) => ids.length > 1)
      .flat(),
  );
});

const hasActiveRowFilter = computed(
  () =>
    String(rowFilterStart.value).trim() !== "" ||
    String(rowFilterEnd.value).trim() !== "",
);

const rowStats = computed(() => {
  const stateCounts = Object.fromEntries(
    stateOptions.map((state) => [state, 0]),
  ) as Record<StateValue, number>;
  const stats = {
    duplicateTitleAddresses: 0,
    emptyTranslations: 0,
    filtered: filteredRows.value.length,
    notTranslated: 0,
    originalEqualsTranslated: 0,
    rowsWithNotes: 0,
    stateCounts,
    total: rows.value.length,
  };

  for (const { row } of textFilteredRows.value) {
    stats.stateCounts[row.state] += 1;
    if (rowMatchesSingleStatFilter(row, { type: "empty_translation" })) {
      stats.emptyTranslations += 1;
    }
    if (rowMatchesSingleStatFilter(row, { type: "not_translated" })) {
      stats.notTranslated += 1;
    }
    if (rowMatchesSingleStatFilter(row, { type: "original_equals_translated" })) {
      stats.originalEqualsTranslated += 1;
    }
    if (rowMatchesSingleStatFilter(row, { type: "has_note" })) {
      stats.rowsWithNotes += 1;
    }
    if (rowMatchesSingleStatFilter(row, { type: "duplicate_title_addr" })) {
      stats.duplicateTitleAddresses += 1;
    }
  }

  return {
    ...stats,
  };
});

// Virtualization keeps only visible rows mounted. Row heights are measured
// separately because multi-line text can make each row a different height.
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

// Draft restore is async because table contents now live in Tauri app data.
// Watchers below will re-save the restored data if it came from legacy storage.
void restoreDraft();
registerMenuListeners();
void syncNativeChrome();
window.addEventListener("focus", handleWindowFocus);
window.addEventListener("keydown", handleGlobalShortcut);
window.addEventListener("keydown", handleWindowsMenuShortcut);
window.addEventListener("keydown", handleAiTranslationModeKey);
window.addEventListener("keyup", handleAiTranslationModeKey);
window.addEventListener("blur", resetAiTranslationModeKey);
systemThemeQuery.addEventListener("change", handleSystemThemeChange);

watch(
  () => ({ fileName: fileName.value, jsonPath: jsonPath.value, rows: rows.value }),
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
  void syncNativeChrome();
});

watch(bulkStateValue, () => {
  persistBulkStateValue();
});

watch(bulkColumnKey, () => {
  persistBulkColumnKey();
});

watch(isTopPanelVisible, () => {
  persistTopPanelVisible();
  nextTick(() => {
    updateTableViewport();
  });
});

watch(currentLanguage, () => {
  syncAppLanguageMenu();
});

watch([errorMessage, statusMessage], ([error, status]) => {
  messageTimestamp.value = error || status ? formatMessageTimestamp() : "";
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
    searchLengthColumn.value,
    searchLengthMin.value,
    searchLengthMax.value,
    rowFilterStart.value,
    rowFilterEnd.value,
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
  async () => {
    pruneSelectedRows();
    await nextTick();
    updateTableViewport();
  },
);

watch(
  () => [
    rows.value,
    filteredRows.value,
    Array.from(selectedRowIds.value).join("|"),
  ],
  () => {
    persistSentenceCoverageSource();
  },
  { deep: true, immediate: true },
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
  cancelColumnReorder();
  rowResizeObservers.forEach((observer) => observer.disconnect());
  rowResizeObservers.clear();
  rowElements.clear();
  unlistenOpenGoToRow?.();
  unlistenReadJson?.();
  unlistenSaveJson?.();
  unlistenSaveJsonAs?.();
  unlistenOpenSearchPanel?.();
  unlistenImportExcel?.();
  unlistenExportExcel?.();
  unlistenImportSrt?.();
  unlistenExportSrt?.();
  unlistenSetLanguage?.();
  unlistenOpenLanguageDialog?.();
  unlistenOpenEncodingManager?.();
  unlistenOpenCharacterStats?.();
  unlistenOpenLlmSettings?.();
  unlistenOpenAiTranslation?.();
  unlistenUndoTableChange?.();
  unlistenRedoTableChange?.();
  unlistenClearList?.();
  unlistenDeleteSelected?.();
  unlistenCopySelected?.();
  unlistenSelectAllFiltered?.();
  unlistenDeselectAllRows?.();
  unlistenBulkState?.();
  unlistenBulkColumn?.();
  unlistenToggleMainColumnVisibility?.();
  unlistenToggleMainTopPanel?.();
  window.removeEventListener("focus", handleWindowFocus);
  window.removeEventListener("keydown", handleGlobalShortcut);
  window.removeEventListener("keydown", handleWindowsMenuShortcut);
  window.removeEventListener("keydown", handleAiTranslationModeKey);
  systemThemeQuery.removeEventListener("change", handleSystemThemeChange);
  window.removeEventListener("keyup", handleAiTranslationModeKey);
  window.removeEventListener("blur", resetAiTranslationModeKey);
});

async function openFilePicker() {
  const path = await openDialog({
    title: t("main.readJson"),
    multiple: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (typeof path === "string") {
    await loadJsonFromPath(path);
  }
}

function isLinuxPlatform() {
  return /Linux/i.test(window.navigator.userAgent);
}

function isWindowsPlatform() {
  return /Windows/i.test(window.navigator.userAgent);
}

function isMacPlatform() {
  return /Macintosh|Mac OS X/i.test(window.navigator.userAgent);
}

function handleWindowFocus() {
  syncHistoryMenuState();
  syncAppLanguageMenu();
  syncMainColumnVisibilityMenu();
}

function handleAiTranslationModeKey(event: KeyboardEvent) {
  isAiTranslationFakeMode.value = event.altKey;
}

function resetAiTranslationModeKey() {
  isAiTranslationFakeMode.value = false;
}

function handleGlobalShortcut(event: KeyboardEvent) {
  if (shortcutMatches(event, "open_search_panel", isMacPlatform())) {
    event.preventDefault();
    if (hasOpenMainDialog()) return;
    openSearchOverlay();
    return;
  }

  if (event.key === "Escape" && isSearchOverlayOpen.value) {
    event.preventDefault();
    closeSearchOverlay();
  }
}

function openSearchOverlay() {
  isSearchOverlayOpen.value = true;
  nextTick(() => {
    overlaySearchControls.value?.focusSearchInput();
  });
}

function closeSearchOverlay() {
  isSearchOverlayOpen.value = false;
}

async function openEncodingManagerWindow() {
  try {
    if (!isLinuxPlatform() && !isWindowsPlatform()) {
      await invoke("open_encoding_manager_window");
      return;
    }

    const existingWindow = await WebviewWindow.getByLabel("encoding");
    if (existingWindow) {
      await existingWindow.setFocus();
      return;
    }

    const encodingWindow = new WebviewWindow("encoding", {
      title: "Encoding Manager",
      url: "index.html#/encoding",
      width: 760,
      height: 860,
      center: true,
      focus: true,
      visible: true,
    });

    encodingWindow.once("tauri://error", (event) => {
      const message = String(event.payload ?? "Failed to open Encoding Manager.");
      errorMessage.value = message;
      statusMessage.value = "";
      console.warn("Failed to open Encoding Manager.", event.payload);
    });
  } catch (error) {
    errorMessage.value = formatError(error, "Failed to open Encoding Manager.");
    statusMessage.value = "";
    console.warn("Failed to open Encoding Manager.", error);
  }
}

function handleWindowsMenuShortcut(event: KeyboardEvent) {
  if (!isWindowsPlatform()) return;

  const actions: { action: ShortcutAction; run: () => void }[] = [
    { action: "go_to_row", run: () => openGoToRowDialog() },
    { action: "read_json", run: () => openFilePicker() },
    { action: "save_json", run: () => void saveJsonFile() },
    { action: "save_json_as", run: () => void saveJsonFileAs() },
    { action: "import_excel", run: () => void openExcelImportDialog() },
    { action: "export_excel", run: () => void openExcelExportDialog() },
    { action: "import_srt", run: () => void openSrtImportDialog() },
    { action: "export_srt", run: () => void openSrtExportDialog() },
    { action: "toggle_main_top_panel", run: () => toggleTopPanel() },
    { action: "open_language_dialog", run: () => openLanguageDialog() },
    {
      action: "open_encoding_manager",
      run: () => {
        void openEncodingManagerWindow();
      },
    },
    { action: "llm_server_settings", run: () => openLlmSettingsDialog() },
    { action: "ai_translation", run: () => openAiTranslationDialog() },
    { action: "clear_list", run: () => void clearRows() },
    { action: "delete_selected", run: () => void deleteSelectedRows() },
    { action: "copy_selected", run: () => void copySelectedRowsForSpreadsheet() },
    { action: "select_all_filtered", run: () => selectAllFilteredRows() },
    { action: "deselect_all_rows", run: () => deselectAllRows() },
    { action: "bulk_change_state", run: () => openBulkStateDialog() },
    { action: "bulk_change_column", run: () => openBulkColumnDialog() },
    { action: "character_stats", run: () => openCharacterStatsDialog() },
    { action: "language_en", run: () => setAppLanguage("en") },
    { action: "language_zh_hans", run: () => setAppLanguage("zh-Hans") },
  ];

  const match = actions.find(({ action }) => windowsShortcutMatches(event, action));
  if (match) {
    event.preventDefault();
    match.run();
  }
}

function registerMenuListeners() {
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

  listen("save-json-as", () => {
    void saveJsonFileAs();
  })
    .then((unlisten) => {
      unlistenSaveJsonAs = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register save JSON as menu listener.", error);
    });

  listen("open-search-panel", () => {
    if (hasOpenMainDialog()) return;
    openSearchOverlay();
  })
    .then((unlisten) => {
      unlistenOpenSearchPanel = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register search panel menu listener.", error);
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

  listen("import-srt", () => {
    void openSrtImportDialog();
  })
    .then((unlisten) => {
      unlistenImportSrt = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register import SRT menu listener.", error);
    });

  listen("export-srt", () => {
    void openSrtExportDialog();
  })
    .then((unlisten) => {
      unlistenExportSrt = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register export SRT menu listener.", error);
    });

  listen<{ target?: string; language: AppLanguage }>("set-language", (event) => {
    if (event.payload?.target !== "main") return;
    setAppLanguage(normalizeAppLanguage(event.payload?.language));
  })
    .then((unlisten) => {
      unlistenSetLanguage = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register language menu listener.", error);
    });

  listen("open-main-language-dialog", () => {
    openLanguageDialog();
  })
    .then((unlisten) => {
      unlistenOpenLanguageDialog = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register open language dialog menu listener.", error);
    });

  listen("open-encoding-manager", () => {
    void openEncodingManagerWindow();
  })
    .then((unlisten) => {
      unlistenOpenEncodingManager = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register open Encoding Manager menu listener.", error);
    });

  listen("open-character-stats", () => {
    openCharacterStatsDialog();
  })
    .then((unlisten) => {
      unlistenOpenCharacterStats = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register character stats menu listener.", error);
    });

  listen("open-llm-settings", () => {
    openLlmSettingsDialog();
  })
    .then((unlisten) => {
      unlistenOpenLlmSettings = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register LLM settings menu listener.", error);
    });

  listen("open-ai-translation", () => {
    openAiTranslationDialog();
  })
    .then((unlisten) => {
      unlistenOpenAiTranslation = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register AI translation menu listener.", error);
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

  listen("copy-selected", () => {
    void copySelectedRowsForSpreadsheet();
  })
    .then((unlisten) => {
      unlistenCopySelected = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register copy selected menu listener.", error);
    });

  listen("select-all-filtered", () => {
    selectAllFilteredRows();
  })
    .then((unlisten) => {
      unlistenSelectAllFiltered = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register select all filtered menu listener.", error);
    });

  listen("deselect-all-rows", () => {
    deselectAllRows();
  })
    .then((unlisten) => {
      unlistenDeselectAllRows = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register deselect all rows menu listener.", error);
    });

  listen("bulk-change-state", () => {
    openBulkStateDialog();
  })
    .then((unlisten) => {
      unlistenBulkState = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register bulk state menu listener.", error);
    });

  listen("bulk-change-column", () => {
    openBulkColumnDialog();
  })
    .then((unlisten) => {
      unlistenBulkColumn = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register bulk column menu listener.", error);
    });

  listen<string>("toggle-main-column-visibility", (event) => {
    toggleColumnVisibility(event.payload);
  })
    .then((unlisten) => {
      unlistenToggleMainColumnVisibility = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register column visibility menu listener.", error);
    });

  listen("toggle-main-top-panel", () => {
    toggleTopPanel();
  })
    .then((unlisten) => {
      unlistenToggleMainTopPanel = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register top panel menu listener.", error);
    });
}

type MainDialog =
  | "aiTranslation"
  | "aiTranslationSession"
  | "bulkColumn"
  | "bulkState"
  | "characterStats"
  | "excelExport"
  | "excelImport"
  | "goToRow"
  | "language"
  | "llmSettings"
  | "srtExport"
  | "srtImport";

function openMainDialog(dialog: MainDialog) {
  if (hasActiveMainDialogTask()) {
    statusMessage.value = t("message.dialogTaskRunning");
    errorMessage.value = "";
    return false;
  }

  closeSearchOverlay();
  closeMainDialogs();
  if (
    dialog === "excelExport" ||
    dialog === "excelImport" ||
    dialog === "srtExport" ||
    dialog === "srtImport"
  ) {
    errorMessage.value = "";
    statusMessage.value = "";
  }

  switch (dialog) {
    case "aiTranslation":
      isAiTranslationDialogOpen.value = true;
      break;
    case "aiTranslationSession":
      isAiTranslationSessionDialogOpen.value = true;
      break;
    case "bulkColumn":
      isBulkColumnDialogOpen.value = true;
      break;
    case "bulkState":
      isBulkStateDialogOpen.value = true;
      break;
    case "characterStats":
      isCharacterStatsDialogOpen.value = true;
      break;
    case "excelExport":
      isExcelExportDialogOpen.value = true;
      break;
    case "excelImport":
      isExcelImportDialogOpen.value = true;
      break;
    case "goToRow":
      isGoToRowDialogOpen.value = true;
      break;
    case "language":
      isLanguageDialogOpen.value = true;
      break;
    case "llmSettings":
      isLlmSettingsDialogOpen.value = true;
      break;
    case "srtExport":
      isSrtExportDialogOpen.value = true;
      break;
    case "srtImport":
      isSrtImportDialogOpen.value = true;
      break;
  }

  return true;
}

function closeMainDialogs() {
  isAiTranslationDialogOpen.value = false;
  isAiTranslationSessionDialogOpen.value = false;
  isBulkColumnDialogOpen.value = false;
  isBulkStateDialogOpen.value = false;
  isCharacterStatsDialogOpen.value = false;
  isExcelExportDialogOpen.value = false;
  isExcelImportDialogOpen.value = false;
  isSrtExportDialogOpen.value = false;
  isSrtImportDialogOpen.value = false;
  isGoToRowDialogOpen.value = false;
  isLanguageDialogOpen.value = false;
  isLlmSettingsDialogOpen.value = false;
}

function hasOpenMainDialog() {
  return (
    isAiTranslationDialogOpen.value ||
    isAiTranslationSessionDialogOpen.value ||
    isBulkColumnDialogOpen.value ||
    isBulkStateDialogOpen.value ||
    isCharacterStatsDialogOpen.value ||
    isExcelExportDialogOpen.value ||
    isExcelImportDialogOpen.value ||
    isSrtExportDialogOpen.value ||
    isSrtImportDialogOpen.value ||
    isGoToRowDialogOpen.value ||
    isLanguageDialogOpen.value ||
    isLlmSettingsDialogOpen.value
  );
}

function hasActiveMainDialogTask() {
  return (
    isCountingCharacterStats.value ||
    isExportingExcel.value ||
    isExportingSrt.value ||
    isImportingExcel.value ||
    isImportingSrt.value ||
    isPreparingAiTranslation.value ||
    isTestingLlmConnection.value
  );
}

async function openGoToRowDialog() {
  openMainDialog("goToRow");
}

function openLanguageDialog() {
  openMainDialog("language");
}

function closeLanguageDialog() {
  isLanguageDialogOpen.value = false;
}

function selectLanguage(language: AppLanguage) {
  setAppLanguage(language);
  closeLanguageDialog();
}

async function openExcelExportDialog() {
  openMainDialog("excelExport");
}

function closeExcelExportDialog() {
  isExcelExportDialogOpen.value = false;
}

async function openExcelImportDialog() {
  openMainDialog("excelImport");
}

function closeExcelImportDialog() {
  isExcelImportDialogOpen.value = false;
}

async function openSrtImportDialog() {
  openMainDialog("srtImport");
}

function closeSrtImportDialog() {
  isSrtImportDialogOpen.value = false;
}

async function openSrtExportDialog() {
  openMainDialog("srtExport");
}

function closeSrtExportDialog() {
  isSrtExportDialogOpen.value = false;
}

function openCharacterStatsDialog() {
  openMainDialog("characterStats");
}

function openLlmSettingsDialog() {
  if (!openMainDialog("llmSettings")) return;
  llmSettingsMessage.value = t("common.ready");
  void refreshStoredLlmApiKeyState();
}

function closeLlmSettingsDialog() {
  isLlmSettingsDialogOpen.value = false;
}

function openAiTranslationDialog() {
  if (!openMainDialog("aiTranslation")) return;
  aiTranslationMessage.value = t("common.ready");
}

function closeAiTranslationDialog() {
  isAiTranslationDialogOpen.value = false;
}

function openAiTranslationResultDialog() {
  if (!aiTranslationSession.value) {
    aiTranslationMessage.value = t("ai.noResultExists");
    return;
  }

  openMainDialog("aiTranslationSession");
}

function closeAiTranslationSessionDialog() {
  isAiTranslationSessionDialogOpen.value = false;
  isAiTranslationDialogOpen.value = true;
  aiTranslationMessage.value = t("ai.returnedFromResult");
}

function toggleAiTranslationTaskSelection(taskId: string) {
  const nextSelectedIds = new Set(selectedAiTranslationTaskIds.value);
  if (nextSelectedIds.has(taskId)) {
    nextSelectedIds.delete(taskId);
  } else {
    nextSelectedIds.add(taskId);
  }
  selectedAiTranslationTaskIds.value = nextSelectedIds;
}

function isSelectableAiTranslationTask(task: AiTranslationTask) {
  return (
    task.status === "done" ||
    task.status === "warning" ||
    task.status === "applied" ||
    task.status === "applied_translated" ||
    task.status === "applied_ai_output" ||
    task.status === "applied_note" ||
    task.status === "applied_both"
  );
}

function taskAppliedTargets(task: AiTranslationTask) {
  if (task.appliedTargets && task.appliedTargets.length > 0) return task.appliedTargets;
  if (task.status === "applied_translated") return ["translated_text"] as AiTranslationApplyTarget[];
  if (task.status === "applied_ai_output") return ["ai_output"] as AiTranslationApplyTarget[];
  if (task.status === "applied_note") return ["note"] as AiTranslationApplyTarget[];
  if (task.status === "applied_both") {
    return ["translated_text", "ai_output"] as AiTranslationApplyTarget[];
  }
  return [] as AiTranslationApplyTarget[];
}

function nextAiTranslationTaskStatus(targets: AiTranslationApplyTarget[]): AiTranslationTask["status"] {
  if (targets.length > 1) return "applied";
  if (targets[0] === "translated_text") return "applied_translated";
  if (targets[0] === "ai_output") return "applied_ai_output";
  if (targets[0] === "note") return "applied_note";
  return "applied";
}

function selectAllAiTranslationResults() {
  const result = aiTranslationSession.value;
  if (!result) return;

  const selectableIds = result.tasks
    .filter((task) => isSelectableAiTranslationTask(task))
    .map((task) => task.id);
  const selectedIds = selectedAiTranslationTaskIds.value;
  const allSelected =
    selectableIds.length > 0 && selectableIds.every((taskId) => selectedIds.has(taskId));

  selectedAiTranslationTaskIds.value = allSelected ? new Set() : new Set(selectableIds);
}

function applySelectedAiTranslationResults() {
  applySelectedAiTranslationResultsWithOptions();
}

function appendNoteText(existingNote: string, text: string) {
  const trimmedText = text.trim();
  if (trimmedText === "") return existingNote;
  const trimmedExisting = existingNote.trim();
  return trimmedExisting === "" ? trimmedText : `${existingNote}\n${trimmedText}`;
}

function applyTextToRowTarget(
  row: SentenceRow,
  target: AiTranslationApplyTarget,
  mode: AiTranslationApplyMode,
  text: string,
) {
  if (mode === "append") {
    row[target] = appendNoteText(row[target], text);
    return;
  }
  row[target] = text;
}

function applySelectedAiTranslationResultsWithOptions() {
  const result = aiTranslationSession.value;
  if (!result || selectedAiTranslationTaskIds.value.size === 0) return;

  const selectedIds = selectedAiTranslationTaskIds.value;
  const nextRows = rows.value.map((row) => ({ ...row }));
  const target = aiTranslationApplyTarget.value;
  const applyMode = aiTranslationApplyMode.value;
  let appliedCount = 0;

  const nextTasks = result.tasks.map((task) => {
    if (!selectedIds.has(task.id)) return task;
    if (!isSelectableAiTranslationTask(task)) return task;
    const row = nextRows[task.rowIndex];
    if (!row) return task;

    applyTextToRowTarget(row, target, applyMode, task.candidateTranslation);
    if (updateAiTranslationStateOnApply.value) {
      row.state = aiTranslationStateOnApply.value;
    }
    const appliedTargets = Array.from(new Set([...taskAppliedTargets(task), target]));
    appliedCount += 1;
    return {
      ...task,
      appliedTargets,
      status: nextAiTranslationTaskStatus(appliedTargets),
      message: t("ai.appliedToTable"),
    };
  });

  if (appliedCount === 0) {
    aiTranslationSessionMessage.value = t("ai.noSelectedResultsApplied");
    return;
  }

  recordHistoryStep(createTableSnapshot());
  rows.value = nextRows;
  aiTranslationSession.value = {
    ...result,
    tasks: nextTasks,
  };
  markStatSnapshotDirty();
  const appliedTargetMessage = `${t("ai.appliedResultsToTarget")} ${target}`;
  const appliedMessage = updateAiTranslationStateOnApply.value
    ? `${appliedTargetMessage}; ${t("ai.setStateTo")} ${aiTranslationStateOnApply.value}`
    : appliedTargetMessage;
  aiTranslationSessionMessage.value = `${appliedMessage}: ${appliedCount}.`;
  statusMessage.value = aiTranslationSessionMessage.value;
  errorMessage.value = "";
}

async function discardAiTranslationSession() {
  const confirmed = await confirm(t("ai.discardResultConfirm"), {
    title: t("ai.discardResultTitle"),
    kind: "warning",
  });

  if (!confirmed) return;

  aiTranslationSession.value = null;
  selectedAiTranslationTaskIds.value = new Set();
  isAiTranslationSessionDialogOpen.value = false;
  isAiTranslationDialogOpen.value = true;
  aiTranslationMessage.value = t("message.translationResultDiscarded");
  statusMessage.value = t("message.translationResultDiscarded");
  errorMessage.value = "";
}

function updateAiTranslationSettings(settings: AiTranslationSettings) {
  aiTranslationSettings.value = sanitizeAiTranslationSettings(settings);
  persistAiTranslationSettings();
}

function updateAiTranslationTimeoutSeconds(timeoutSeconds: number) {
  updateAiTranslationSettings({
    ...aiTranslationSettings.value,
    timeoutSeconds,
  });
  llmSettingsMessage.value = t("llm.timeoutSaved");
}

function resetAiTranslationPrompt() {
  aiTranslationSettings.value = {
    ...aiTranslationSettings.value,
    promptTemplate: defaultAiTranslationPrompt(),
  };
  persistAiTranslationSettings();
  aiTranslationMessage.value = t("ai.defaultGamePromptRestored");
}

function resetAiTranslationVideoPrompt() {
  aiTranslationSettings.value = {
    ...aiTranslationSettings.value,
    promptTemplate: defaultAiTranslationVideoPrompt(),
  };
  persistAiTranslationSettings();
  aiTranslationMessage.value = t("ai.defaultVideoPromptRestored");
}

async function browseAiTranslationAttachment() {
  const path = await openDialog({
    title: t("ai.selectTxtAttachmentTitle"),
    multiple: false,
    filters: [{ name: t("dialog.textFile"), extensions: ["txt"] }],
  });

  if (typeof path === "string") {
    updateAiTranslationSettings({
      ...aiTranslationSettings.value,
      attachmentPath: path,
    });
    aiTranslationMessage.value = t("ai.attachmentSelected");
  }
}

function clearAiTranslationAttachment() {
  updateAiTranslationSettings({
    ...aiTranslationSettings.value,
    attachmentPath: "",
  });
  aiTranslationMessage.value = t("ai.attachmentCleared");
}

async function translateWithAi() {
  if (isPreparingAiTranslation.value) return;
  const useFakeTranslation = isAiTranslationFakeMode.value;

  // Translation results are a review buffer, not immediately applied table
  // edits. Starting over would discard that buffer, so ask before replacing it.
  if (aiTranslationSession.value) {
    const shouldReplace = await confirm(
      t("ai.replaceResultConfirm"),
      {
        title: t("ai.replaceResultTitle"),
        kind: "warning",
      },
    );

    if (!shouldReplace) {
      aiTranslationMessage.value = t("ai.currentResultKept");
      return;
    }
  }

  // Fake mode is kept as a deterministic test path. Hold Option/Alt in the UI
  // to exercise the same progress/result workflow without touching the network.
  if (!useFakeTranslation) {
    if (llmSettings.value.baseUrl.trim() === "") {
      aiTranslationMessage.value = t("ai.baseUrlRequired");
      errorMessage.value = aiTranslationMessage.value;
      statusMessage.value = "";
      return;
    }
    if (llmSettings.value.model.trim() === "") {
      aiTranslationMessage.value = t("ai.modelRequired");
      errorMessage.value = aiTranslationMessage.value;
      statusMessage.value = "";
      return;
    }
  }

  let attachmentText = "";
  try {
    attachmentText = useFakeTranslation ? "" : await readAiTranslationAttachmentText();
  } catch (error) {
    aiTranslationMessage.value = formatError(error, t("ai.failedReadAttachment"));
    errorMessage.value = aiTranslationMessage.value;
    statusMessage.value = "";
    return;
  }

  isPreparingAiTranslation.value = true;
  isAiTranslationStopRequested.value = false;
  aiTranslationCompletedCount.value = 0;
  aiTranslationErrorCount.value = 0;
  aiTranslationFinishedText.value = "";
  aiTranslationFinishedPreview.value = "";
  aiTranslationMessage.value = useFakeTranslation
    ? t("ai.startingFakeTranslation")
    : t("ai.startingAiTranslation");
  statusMessage.value = aiTranslationMessage.value;
  errorMessage.value = "";
  closeMainDialogs();
  isAiTranslationDialogOpen.value = true;

  // Give the run dialog one frame to paint before doing per-row async work,
  // otherwise the first visible feedback can feel delayed on slower machines.
  await nextTick();
  await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));

  try {
    const tasks = createAiTranslationTasks();
    const resultTasks: AiTranslationTask[] = [];
    let wasStopped = false;

    for (const task of tasks) {
      if (isAiTranslationStopRequested.value) {
        wasStopped = true;
        break;
      }

      aiTranslationCurrentText.value = task.originalText;
      aiTranslationMessage.value = useFakeTranslation
        ? `${t("ai.fakeTranslatingRow")} ${task.rowIndex + 1}...`
        : `${t("ai.translatingRow")} ${task.rowIndex + 1}...`;
      // aiTranslationFinishedPreview.value = "";
      await nextTick();

      const translatedTask = useFakeTranslation
        ? await fakeTranslateTask(task)
        : await realTranslateTask(task, attachmentText);
      if (isAiTranslationStopRequested.value) {
        wasStopped = true;
        break;
      }

      resultTasks.push(translatedTask);
      aiTranslationCompletedCount.value = resultTasks.length;
      if (translatedTask.status === "error") {
        aiTranslationErrorCount.value += 1;
      }
    }

    // Keep unfinished rows visible in the result view as cancelled tasks so the
    // user can see exactly where a stop or error left the batch.
    const resultTaskIds = new Set(resultTasks.map((task) => task.id));
    const cancelledTasks = tasks
      .filter((task) => !resultTaskIds.has(task.id))
      .map((task) => ({
        ...task,
        status: "cancelled" as const,
        message: wasStopped ? t("ai.stoppedBeforeRow") : t("ai.notTranslated"),
      }));
    const finalTasks = [...resultTasks, ...cancelledTasks];

    aiTranslationCompletedCount.value = resultTasks.length;
    aiTranslationSession.value = {
      id: `result-${Date.now()}`,
      createdAt: new Date().toISOString(),
      sourceLanguage: aiTranslationSettings.value.sourceLanguage,
      targetLanguage: aiTranslationSettings.value.targetLanguage,
      promptTemplate: aiTranslationSettings.value.promptTemplate,
      attachmentPath: aiTranslationSettings.value.attachmentPath,
      tasks: finalTasks,
    };
    aiTranslationSessionMessage.value =
      finalTasks.length === 0
        ? t("ai.noRowsMatchScope")
        : wasStopped
          ? `${t("ai.translationStopped")}: ${resultTasks.length}.`
          : `${t("ai.translationComplete")}: ${resultTasks.length}.`;
    aiTranslationMessage.value = aiTranslationSessionMessage.value;
    statusMessage.value = aiTranslationMessage.value;
    errorMessage.value = "";
    if (finalTasks.length > 0) {
      isPreparingAiTranslation.value = false;
      openMainDialog("aiTranslationSession");
    }
  } catch (error) {
    aiTranslationMessage.value = formatError(
      error,
      t("ai.failedStartTranslation"),
    );
    errorMessage.value = aiTranslationMessage.value;
    statusMessage.value = "";
  } finally {
    isPreparingAiTranslation.value = false;
    aiTranslationFinishedText.value = "";
    aiTranslationFinishedPreview.value = "";
    isAiTranslationStopRequested.value = false;
  }
}

function createAiTranslationTasks(): AiTranslationTask[] {
  return aiTranslationRowsWithIndexes().map(({ row, index }) => ({
    id: `row-${index}-${getRowIdentity(row)}`,
    rowIndex: index,
    titleAddr: row.title_addr,
    fileName: row.file_name,
    originalText: row.original_text,
    existingTranslation: row.translated_text,
    candidateTranslation: "",
    candidateNote: "",
    status: "pending",
    message: t("ai.waitingForTranslation"),
  }));
}

async function fakeTranslateTask(task: AiTranslationTask): Promise<AiTranslationTask> {
  // The split delay intentionally shows a completed preview before moving to
  // the next row, matching the behavior expected from the real translator.
  const completedDelay = await waitForAiTranslationStep(400);
  if (!completedDelay || isAiTranslationStopRequested.value) {
    return {
      ...task,
      status: "cancelled",
      message: t("ai.fakeStoppedBeforeRow"),
    };
  }

  aiTranslationFinishedPreview.value = task.originalText;
  await nextTick();
  const completedPreviewDelay = await waitForAiTranslationStep(100);
  if (!completedPreviewDelay || isAiTranslationStopRequested.value) {
    return {
      ...task,
      status: "cancelled",
      message: t("ai.fakeStoppedBeforeRow"),
    };
  }

  return {
    ...task,
    candidateTranslation: task.originalText,
    candidateNote: t("ai.simulatedTranslationNote"),
    status: "done",
    message: t("ai.simulatedTranslationComplete"),
  };
}

async function realTranslateTask(
  task: AiTranslationTask,
  attachmentText: string,
): Promise<AiTranslationTask> {
  try {
    // The backend returns raw model content on parse problems so the Candidate
    // column can be used to debug prompt/JSON issues.
    const result = await invoke<{
      note: string;
      rawContent: string;
      translatedText: string;
    }>("translate_with_llm", {
      request: {
        settings: {
          ...llmSettings.value,
          timeoutSeconds: aiTranslationSettings.value.timeoutSeconds,
        },
        apiKeyOverride: llmApiKeyInput.value,
        prompt: buildAiTranslationPrompt(task, attachmentText),
        temperature: aiTranslationSettings.value.temperature,
      },
    });

    const candidateTranslation = result.translatedText;
    aiTranslationFinishedText.value = task.originalText;
    aiTranslationFinishedPreview.value = candidateTranslation;
    await nextTick();

    return {
      ...task,
      candidateTranslation,
      candidateNote: result.note,
      status: result.note.trim() === "" ? "done" : "warning",
      message: result.note.trim() === "" ? t("ai.requestComplete") : result.note,
    };
  } catch (error) {
    const message = formatError(error, t("ai.requestFailed"));
    aiTranslationFinishedText.value = task.originalText;
    aiTranslationFinishedPreview.value = message;
    await nextTick();
    return {
      ...task,
      candidateTranslation: "",
      candidateNote: "",
      status: "error",
      message,
    };
  }
}

async function readAiTranslationAttachmentText() {
  const path = aiTranslationSettings.value.attachmentPath.trim();
  if (path === "") return "";

  const bytes = await readFile(path);
  return decodeTextAuto(bytes).trim();
}

function buildAiTranslationPrompt(task: AiTranslationTask, attachmentText = "") {
  const settings = aiTranslationSettings.value;
  const row = rows.value[task.rowIndex];
  const replacements: Record<string, string> = {
    attachment_text: attachmentText,
    existing_translation: task.existingTranslation,
    file_name: task.fileName,
    nearby_rows: nearbyRowsForPrompt(task.rowIndex),
    note: row?.note ?? "",
    original_text: task.originalText,
    source_language: settings.sourceLanguage,
    state: row?.state ?? "",
    target_language: settings.targetLanguage,
    title_addr: task.titleAddr,
    translated_text: task.existingTranslation,
  };

  return settings.promptTemplate.replace(/\{([a-z_]+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(replacements, key) ? replacements[key] : match,
  );
}

function nearbyRowsForPrompt(rowIndex: number) {
  const start = Math.max(0, rowIndex - 2);
  const end = Math.min(rows.value.length, rowIndex + 3);
  return rows.value
    .slice(start, end)
    .map((row, offset) => {
      const index = start + offset;
      return [
        `row ${index + 1}${index === rowIndex ? " (current)" : ""}`,
        `original: ${row.original_text}`,
        `translation: ${row.translated_text}`,
      ].join("\n");
    })
    .join("\n\n");
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, milliseconds);
  });
}

async function waitForAiTranslationStep(milliseconds: number) {
  const deadline = Date.now() + milliseconds;
  while (Date.now() < deadline) {
    if (isAiTranslationStopRequested.value) return false;
    await wait(Math.min(50, deadline - Date.now()));
  }
  return true;
}

function stopAiTranslationRun() {
  isAiTranslationStopRequested.value = true;
  aiTranslationMessage.value = t("ai.stoppingTranslation");
}

function updateLlmSettings(settings: LlmServerSettings) {
  llmSettings.value = sanitizeLlmSettings(settings);
  persistLlmSettings();
  statusMessage.value = t("message.llmSettingsSaved");
  errorMessage.value = "";
}

function updateLlmApiKeyInput(value: string) {
  llmApiKeyInput.value = value;
}

async function saveLlmApiKey() {
  const apiKey = llmApiKeyInput.value.trim();
  if (apiKey === "") {
    llmSettingsMessage.value = t("llm.enterApiKeyBeforeSaving");
    return;
  }

  try {
    await invoke("save_llm_api_key", { apiKey });
    llmApiKeyInput.value = "";
    hasStoredLlmApiKey.value = true;
    llmSettingsMessage.value = t("llm.apiKeySavedCredential");
    statusMessage.value = t("message.llmApiKeySaved");
    errorMessage.value = "";
  } catch (error) {
    llmSettingsMessage.value = formatError(error, t("llm.failedSaveApiKey"));
  }
}

async function clearLlmApiKey() {
  try {
    await invoke("delete_llm_api_key");
    llmApiKeyInput.value = "";
    hasStoredLlmApiKey.value = false;
    llmSettingsMessage.value = t("llm.apiKeyCleared");
    statusMessage.value = t("message.llmApiKeyCleared");
    errorMessage.value = "";
  } catch (error) {
    llmSettingsMessage.value = formatError(error, t("llm.failedClearApiKey"));
  }
}

function resetLlmSettings() {
  llmSettings.value = defaultLlmSettings();
  persistLlmSettings();
  llmApiKeyInput.value = "";
  llmSettingsMessage.value = t("llm.settingsResetApiKeyUnchanged");
  statusMessage.value = t("message.llmSettingsReset");
  errorMessage.value = "";
}

async function testLlmConnection() {
  if (isTestingLlmConnection.value) return;

  isTestingLlmConnection.value = true;
  llmSettingsMessage.value = t("llm.testingConnection");
  try {
    const result = await invoke<{ ok: boolean; message: string }>("test_llm_connection", {
      settings: {
        ...llmSettings.value,
        timeoutSeconds: aiTranslationSettings.value.timeoutSeconds,
      },
      apiKeyOverride: llmApiKeyInput.value,
    });
    const resultMessage = localizedLlmConnectionMessage(result);
    llmSettingsMessage.value = resultMessage;
    if (result.ok) {
      statusMessage.value = resultMessage;
      errorMessage.value = "";
    }
  } catch (error) {
    llmSettingsMessage.value = formatError(error, t("llm.failedTestConnection"));
  } finally {
    isTestingLlmConnection.value = false;
  }
}

function localizedLlmConnectionMessage(result: { ok: boolean; message: string }) {
  if (!result.ok) return result.message;

  // The Rust command returns English diagnostic text because failures often
  // include server bodies. Only the known success form is localized here.
  const prefix = "Connection succeeded: ";
  const unvalidatedSuffix = ". Model name was not validated yet.";
  if (!result.message.startsWith(prefix)) return result.message;

  const hasUnvalidatedSuffix = result.message.endsWith(unvalidatedSuffix);
  const url = result.message
    .slice(prefix.length, hasUnvalidatedSuffix ? -unvalidatedSuffix.length : undefined)
    .trim()
    .replace(/\.$/, "");
  if (!url) return result.message;

  const modelNote = hasUnvalidatedSuffix ? ` ${t("llm.modelNameNotValidated")}` : "";
  return `${t("llm.connectionSucceeded")}: ${url}.${modelNote}`;
}

async function refreshStoredLlmApiKeyState() {
  try {
    hasStoredLlmApiKey.value = await invoke<boolean>("has_llm_api_key");
  } catch (error) {
    llmSettingsMessage.value = formatError(error, t("llm.failedReadApiKeyState"));
  }
}

function closeCharacterStatsDialog() {
  isCharacterStatsDialogOpen.value = false;
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
    jsonPath: jsonPath.value,
    rows: rows.value,
  };

  return JSON.stringify(snapshot);
}

function restoreTableSnapshot(snapshot: string) {
  const parsed = JSON.parse(snapshot) as TableSnapshot;
  const scrollAnchor = captureTableScrollAnchor();

  rows.value = restoreRowsPreservingObjects(parsed.rows.map(normalizeStoredRow));
  fileName.value = toText(parsed.fileName);
  jsonPath.value = toText(parsed.jsonPath);
  pendingDeleteIndex.value = null;
  pendingEditSnapshot = null;
  clearSelectedRows();
  pruneVirtualRowState();
  refreshStatSnapshot(false);
  restoreTableScrollAnchor(scrollAnchor);
}

type TableScrollAnchor = {
  filteredIndex: number;
  occurrence: number;
  offset: number;
  scrollTop: number;
  signature: string;
};

function restoreRowsPreservingObjects(nextRows: SentenceRow[]) {
  const existingRows = new Map<string, SentenceRow[]>();

  for (const row of rows.value) {
    const signature = sentenceRowSignature(row);
    existingRows.set(signature, [...(existingRows.get(signature) ?? []), row]);
  }

  return nextRows.map((nextRow) => {
    const signature = sentenceRowSignature(nextRow);
    const reusableRows = existingRows.get(signature);
    const reusableRow = reusableRows?.shift();

    if (!reusableRow) return nextRow;
    Object.assign(reusableRow, nextRow);
    return reusableRow;
  });
}

function sentenceRowSignature(row: SentenceRow) {
  return JSON.stringify([
    row.title_addr,
    row.original_text,
    row.translated_text,
    row.note,
    row.state,
    row.file_name,
    row.ai_output,
  ]);
}

function captureTableScrollAnchor(): TableScrollAnchor | null {
  const items = filteredRows.value;
  const scrollTop = tableWrap.value?.scrollTop ?? tableScrollTop.value;
  if (items.length === 0) return null;

  let offsetTop = 0;
  let filteredIndex = 0;
  while (filteredIndex < items.length) {
    const height = rowHeight(items[filteredIndex].row);
    if (offsetTop + height > scrollTop) break;
    offsetTop += height;
    filteredIndex += 1;
  }

  const boundedIndex = Math.min(filteredIndex, items.length - 1);
  const signature = sentenceRowSignature(items[boundedIndex].row);
  const occurrence = items
    .slice(0, boundedIndex)
    .filter(({ row }) => sentenceRowSignature(row) === signature).length;

  return {
    filteredIndex: boundedIndex,
    occurrence,
    offset: Math.max(0, scrollTop - offsetTop),
    scrollTop,
    signature,
  };
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
  statusMessage.value = t("message.undidTableChange");
}

function redoTableChange() {
  flushPendingTableEdit();
  if (!canRedoTableChange.value) return;

  const currentSnapshot = createTableSnapshot();
  const snapshot = redoStack.value[redoStack.value.length - 1];
  redoStack.value = redoStack.value.slice(0, -1);
  undoStack.value = pushHistorySnapshot(undoStack.value, currentSnapshot);
  restoreTableSnapshot(snapshot);
  statusMessage.value = t("message.redidTableChange");
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

  if (jsonPath.value.trim() === "") {
    await saveJsonFileAs();
    return;
  }

  try {
    errorMessage.value = "";
    statusMessage.value = "";
    isSaving.value = true;

    await writeTextFile(jsonPath.value, serializeRows());
    statusMessage.value = t("message.jsonSaved");
  } catch (error) {
    errorMessage.value = formatError(error, t("message.failedSaveJson"));
  } finally {
    isSaving.value = false;
  }
}

async function saveJsonFileAs() {
  if (!canSaveJson.value) return;

  try {
    errorMessage.value = "";
    statusMessage.value = "";
    isSaving.value = true;

    const path = await save({
      title: t("main.saveJsonAs"),
      defaultPath: jsonPath.value.trim() || defaultJsonSavePath(),
      filters: [{ name: "JSON", extensions: ["json"] }],
    });

    if (!path) return;

    const nextPath = ensureJsonExtension(path);
    await writeTextFile(nextPath, serializeRows());
    jsonPath.value = nextPath;
    fileName.value = pathBaseName(nextPath);
    statusMessage.value = t("message.jsonSaved");
  } catch (error) {
    errorMessage.value = formatError(error, t("message.failedSaveJson"));
  } finally {
    isSaving.value = false;
  }
}

function ensureJsonExtension(path: string) {
  return /\.json$/i.test(path) ? path : `${path}.json`;
}

function defaultJsonSavePath() {
  const baseName = fileName.value.replace(/\.[^.]+$/, "") || "sentences";
  return `${baseName}.json`;
}

async function browseExcelImportPath() {
  const path = await openDialog({
    title: t("dialog.importExcel"),
    multiple: false,
    filters: [{ name: t("dialog.excelWorkbook"), extensions: ["xlsx"] }],
  });

  if (typeof path === "string") {
    excelImportPath.value = path;
  }
}

async function confirmExcelImport() {
  if (!canImportExcel.value) return;

  try {
    if (!excelImportAppendRows.value && !(await confirmImportOverwrite(t("dialog.importExcel")))) {
      return;
    }

    errorMessage.value = "";
    statusMessage.value = "";
    isImportingExcel.value = true;

    const importedRows = await rowsFromExcelImport();
    if (importedRows.length === 0) {
      throw new Error(t("message.noValidExcelRows"));
    }

    recordCurrentStateForUndo();
    rows.value = excelImportAppendRows.value
      ? [...rows.value, ...importedRows]
      : importedRows;
    if (!excelImportAppendRows.value) {
      fileName.value = excelImportPath.value.split(/[\\/]/).pop() ?? t("message.importedExcelFileName");
      jsonPath.value = "";
    }
    clearSelectedRows();
    pendingDeleteIndex.value = null;
    resetVirtualRowState();
    refreshStatSnapshot();
    closeExcelImportDialog();
    statusMessage.value = excelImportAppendRows.value
      ? `${t("message.excelAppended")}: ${importedRows.length} ${t("message.rows")}.`
      : `${t("message.excelImported")}: ${importedRows.length} ${t("message.rows")}.`;
  } catch (error) {
    errorMessage.value = formatError(error, t("message.failedImportExcel"));
  } finally {
    isImportingExcel.value = false;
  }
}

async function rowsFromExcelImport() {
  const startRow = requiredPositiveInteger(excelImportStartRow.value, t("dialog.startRow"));
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
  const aiOutputColumn = optionalPositiveInteger(
    excelImportAiOutputColumn.value,
    "ai_output column",
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
      const aiOutput = aiOutputColumn ? excelCellText(cells, aiOutputColumn) : "";
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
        aiOutput === "" &&
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
        ai_output: aiOutput,
      });
    }
  }

  return outputRows;
}

async function browseSrtImportPath() {
  const path = await openDialog({
    title: t("dialog.importSrt"),
    multiple: false,
    filters: [{ name: t("dialog.srtSubtitle"), extensions: ["srt"] }],
  });

  if (typeof path === "string") {
    srtImportPath.value = path;
  }
}

async function confirmSrtImport() {
  if (!canImportSrt.value) return;

  try {
    if (!srtImportAppendRows.value && !(await confirmImportOverwrite(t("dialog.importSrt")))) {
      return;
    }

    errorMessage.value = "";
    statusMessage.value = "";
    isImportingSrt.value = true;

    const text = decodeTextAuto(await readFile(srtImportPath.value.trim()));
    const importedRows = rowsFromSrt(text);
    if (importedRows.length === 0) {
      throw new Error(t("message.noValidSrtRows"));
    }

    recordCurrentStateForUndo();
    rows.value = srtImportAppendRows.value ? [...rows.value, ...importedRows] : importedRows;
    if (!srtImportAppendRows.value) {
      fileName.value = pathBaseName(srtImportPath.value);
      jsonPath.value = "";
    }
    clearSelectedRows();
    pendingDeleteIndex.value = null;
    resetVirtualRowState();
    refreshStatSnapshot();
    closeSrtImportDialog();
    statusMessage.value = srtImportAppendRows.value
      ? `${t("message.srtAppended")}: ${importedRows.length} ${t("message.rows")}.`
      : `${t("message.srtImported")}: ${importedRows.length} ${t("message.rows")}.`;
  } catch (error) {
    errorMessage.value = formatError(error, t("message.failedImportSrt"));
  } finally {
    isImportingSrt.value = false;
  }
}

function rowsFromSrt(text: string): SentenceRow[] {
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (normalizedText === "") return [];

  const timePattern = /^\s*\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}.*$/;
  return normalizedText
    .split(/\n\s*\n/)
    .flatMap((block) => {
      const lines = block.split("\n");
      const timeIndex = lines.findIndex((line) => timePattern.test(line));
      if (timeIndex < 0) return [];

      const timeline = lines[timeIndex].trim();
      const subtitle = lines.slice(timeIndex + 1).join("\n").trim();
      return [
        {
          title_addr: timeline,
          original_text: subtitle,
          translated_text: subtitle,
          note: "",
          state: "❓unmarked" as StateValue,
          file_name: "",
          ai_output: "",
        },
      ];
    });
}

function decodeTextAuto(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }

  for (const encoding of ["utf-8", "shift_jis", "euc-kr", "gb18030", "big5"]) {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(bytes);
    } catch {
      // Try the next likely subtitle encoding.
    }
  }

  return new TextDecoder("utf-8").decode(bytes);
}

function defaultSrtExportPath() {
  const baseName = fileName.value.replace(/\.[^.]+$/, "") || "sentences";
  return `${baseName}.srt`;
}

async function browseSrtExportPath() {
  const path = await save({
    title: t("dialog.exportSrt"),
    defaultPath: srtExportPath.value.trim() || defaultSrtExportPath(),
    filters: [{ name: t("dialog.srtSubtitle"), extensions: ["srt"] }],
  });

  if (path) {
    srtExportPath.value = ensureSrtExtension(path);
  }
}

async function confirmSrtExport() {
  if (!canExportSrt.value) return;

  try {
    errorMessage.value = "";
    statusMessage.value = "";
    isExportingSrt.value = true;

    const exportRows = rowsForSrtExport();
    if (exportRows.length === 0) {
      throw new Error(t("message.noRowsToExport"));
    }

    const path = ensureSrtExtension(srtExportPath.value.trim());
    await writeFile(
      path,
      encodeSrtText(
        buildSrtText(exportRows),
        srtExportEncoding.value,
      ),
    );

    srtExportPath.value = path;
    closeSrtExportDialog();
    statusMessage.value = `${t("message.srtExported")}: ${exportRows.length} ${t("message.rows")}.`;
  } catch (error) {
    errorMessage.value = formatError(error, t("message.failedExportSrt"));
  } finally {
    isExportingSrt.value = false;
  }
}

function rowsForSrtExport() {
  if (srtExportFilteredOnly.value) {
    return filteredRows.value.map(({ row }) => row);
  }

  return rows.value;
}

function buildSrtText(exportRows: SentenceRow[]) {
  let subtitleIndex = 1;
  const blocks = exportRows.flatMap((row) => {
    const timeline = row.title_addr.trim();
    if (timeline === "") return [];

    const original = row.original_text.trim();
    const translated = row.translated_text.trim();
    const subtitle = srtExportBilingual.value
      ? [translated, original].filter((line) => line !== "").join("\n")
      : translated || original;

    const block = `${subtitleIndex}\n${timeline}\n${subtitle}`;
    subtitleIndex += 1;
    return [block];
  });

  return blocks.length === 0 ? "" : `${blocks.join("\n\n")}\n`;
}

function encodeSrtText(text: string, encoding: SrtExportEncoding) {
  if (encoding === "utf-16" || encoding === "utf-16-le") {
    return encodeUtf16(text, true, encoding === "utf-16");
  }
  if (encoding === "utf-16-be") {
    return encodeUtf16(text, false, true);
  }

  const encoded = new TextEncoder().encode(text);
  if (encoding === "utf-8-sig") {
    const output = new Uint8Array(encoded.length + 3);
    output.set([0xef, 0xbb, 0xbf], 0);
    output.set(encoded, 3);
    return output;
  }
  return encoded;
}

function encodeUtf16(text: string, littleEndian: boolean, withBom: boolean) {
  const bomLength = withBom ? 2 : 0;
  const output = new Uint8Array(text.length * 2 + bomLength);
  if (withBom) {
    output[0] = littleEndian ? 0xff : 0xfe;
    output[1] = littleEndian ? 0xfe : 0xff;
  }

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    const offset = bomLength + index * 2;
    output[offset] = littleEndian ? code & 0xff : code >> 8;
    output[offset + 1] = littleEndian ? code >> 8 : code & 0xff;
  }

  return output;
}

function ensureSrtExtension(path: string) {
  return /\.srt$/i.test(path) ? path : `${path}.srt`;
}

function defaultExcelExportPath() {
  const baseName = fileName.value.replace(/\.[^.]+$/, "") || "sentences";
  return `${baseName}.xlsx`;
}

async function browseExcelExportPath() {
  const path = await save({
    title: t("dialog.exportExcel"),
    defaultPath: excelExportPath.value.trim() || defaultExcelExportPath(),
    filters: [{ name: t("dialog.excelWorkbook"), extensions: ["xlsx"] }],
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
      throw new Error(t("message.noRowsToExport"));
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
    statusMessage.value = `${t("message.excelExported")}: ${exportRows.length} ${t("message.rows")}.`;
  } catch (error) {
    errorMessage.value = formatError(error, t("message.failedExportExcel"));
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

function characterStatsRows() {
  if (characterStatsScope.value === "filtered") {
    return filteredRows.value.map(({ row }) => row);
  }

  if (characterStatsScope.value === "selected") {
    return rows.value.filter((row) => selectedRowIds.value.has(getRowIdentity(row)));
  }

  return rows.value;
}

function aiTranslationRows() {
  return aiTranslationRowsWithIndexes().map(({ row }) => row);
}

function aiTranslationRowsWithIndexes() {
  const sourceRows = (() => {
    switch (aiTranslationSettings.value.scope) {
    case "selected":
      return rows.value
        .map((row, index) => ({ row, index }))
        .filter(({ row }) => selectedRowIds.value.has(getRowIdentity(row)));
    case "filtered":
      return filteredRows.value.map(({ row, index }) => ({ row, index }));
    case "all":
      return rows.value.map((row, index) => ({ row, index }));
    }
  })();

  const minimumCharacters = Math.max(
    0,
    Math.floor(aiTranslationSettings.value.minOriginalCharacters),
  );
  return sourceRows.filter(
    ({ row }) => originalCharacterCount(row.original_text) >= minimumCharacters,
  );
}

function originalCharacterCount(value: string) {
  return Array.from(value.trim()).length;
}

function persistSentenceCoverageSource() {
  const rowForCoverage = (row: SentenceRow, index: number) => ({
    index,
    translated_text: row.translated_text,
  });

  const source = {
    all: rows.value.map(rowForCoverage),
    filtered: filteredRows.value.map(({ row, index }) => rowForCoverage(row, index)),
    selected: rows.value
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => selectedRowIds.value.has(getRowIdentity(row)))
      .map(({ row, index }) => rowForCoverage(row, index)),
  };

  invoke("set_sentence_coverage_source", { source }).catch((error) => {
    console.warn("Failed to persist sentence coverage source.", error);
  });
}

async function runCharacterStats() {
  if (isCountingCharacterStats.value) return;

  isCountingCharacterStats.value = true;
  characterStatsProgress.value = 0;
  characterStatsMessage.value = t("stats.countingCharacters");
  errorMessage.value = "";
  await nextTick();

  const counts = new Map<string, number>();
  const sourceRows = characterStatsRows();
  const totalCharacters = sourceRows.reduce(
    (total, row) => total + row.translated_text.length,
    0,
  );
  let scannedCharacters = 0;

  try {
    for (let rowIndex = 0; rowIndex < sourceRows.length; rowIndex += 1) {
      const row = sourceRows[rowIndex];
      for (const token of characterStatsTokens(row.translated_text)) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }

      scannedCharacters += row.translated_text.length;
      if (rowIndex % 120 === 0 || rowIndex === sourceRows.length - 1) {
        characterStatsProgress.value =
          totalCharacters === 0
            ? 100
            : Math.round((scannedCharacters / totalCharacters) * 100);
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      }
    }

    const sortedRows = Array.from(counts.entries()).sort(([charA, countA], [charB, countB]) => {
      const countDelta =
        characterStatsSortOrder.value === "asc" ? countA - countB : countB - countA;
      if (countDelta !== 0) return countDelta;
      return charA.localeCompare(charB);
    });

    characterStatsResult.value = sortedRows
      .map(([character, count]) => `${displayCharacterStatsToken(character)}\t${count}`)
      .join("\n");

    characterStatsMessage.value =
      sortedRows.length === 0
        ? `${t("message.noMatchingCharactersFound")}: ${sourceRows.length} ${t("message.rows")}.`
        : `${t("message.countedItemsFromRows")}: ${sortedRows.length} / ${sourceRows.length} ${t("message.rows")}.`;
    statusMessage.value = characterStatsMessage.value;
  } finally {
    characterStatsProgress.value = 100;
    isCountingCharacterStats.value = false;
  }
}

function characterStatsTokens(text: string) {
  const tokens: string[] = [];
  let index = 0;

  while (index < text.length) {
    const bracketToken = bracketedTokenAt(text, index);

    if (bracketToken) {
      if (characterStatsIncludeAll.value || characterStatsTypes.value.includes("token")) {
        tokens.push(bracketToken.token);
      }
      index = bracketToken.endIndex;
      continue;
    }

    const character = Array.from(text.slice(index))[0] ?? "";
    index += character.length;
    if (characterStatsIgnoreWhitespace.value && /\s/u.test(character)) continue;
    if (characterMatchesStatsType(character)) {
      tokens.push(character);
    }
  }

  return tokens;
}

function bracketedTokenAt(text: string, startIndex: number) {
  const pairs: Record<string, { close: string; type: "square" | "curly" | "angle" }> = {
    "[": { close: "]", type: "square" },
    "{": { close: "}", type: "curly" },
    "<": { close: ">", type: "angle" },
  };
  const open = text[startIndex];
  const pair = pairs[open];
  if (!pair || !characterStatsBracketTokenTypes.value.includes(pair.type)) return null;

  const endIndex = text.indexOf(pair.close, startIndex + 1);
  if (endIndex === -1) return null;

  return {
    endIndex: endIndex + pair.close.length,
    token: text.slice(startIndex, endIndex + pair.close.length),
  };
}

function characterMatchesStatsType(character: string) {
  if (characterStatsIncludeAll.value) return true;
  const selectedTypes = characterStatsTypes.value;
  if (selectedTypes.length === 0) return false;

  return selectedTypes.some((type) => characterMatchesSingleStatsType(character, type));
}

function characterMatchesSingleStatsType(
  character: string,
  type: "western" | "han" | "kana" | "hangul" | "fullwidth" | "halfwidth" | "token",
) {
  switch (type) {
    case "western":
      return /\p{Script=Latin}/u.test(character);
    case "han":
      return /\p{Script=Han}/u.test(character);
    case "kana":
      return /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(character);
    case "hangul":
      return /\p{Script=Hangul}/u.test(character);
    case "fullwidth":
      return /[\uFF10-\uFF19\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65]/u.test(
        character,
      );
    case "halfwidth":
      return /[0-9!-\/:-@[-`{-~]/u.test(character);
    case "token":
      return false;
  }
}

function displayCharacterStatsToken(token: string) {
  if (token === " ") return " ";
  if (token === "\t") return "\\t";
  if (token === "\r") return "\\r";
  if (token === "\n") return "\\n";
  return token;
}

async function copyCharacterStatsResult() {
  if (characterStatsResult.value === "") return;

  try {
    await copyText(characterStatsResult.value);
    characterStatsMessage.value = t("message.characterCountCopied");
    statusMessage.value = characterStatsMessage.value;
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value = formatError(error, t("message.failedCopyCharacterCount"));
    statusMessage.value = "";
  }
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) {
    throw new Error(t("message.clipboardUnavailable"));
  }
}

async function loadJsonFromPath(path: string) {
  try {
    if (!(await confirmImportOverwrite(t("main.readJson")))) return;

    errorMessage.value = "";
    const text = new TextDecoder("utf-8").decode(await readFile(path));
    const parsed = JSON.parse(text) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error(t("message.jsonRootMustBeArray"));
    }

    recordCurrentStateForUndo();
    rows.value = parsed.map(normalizeSentence);
    clearSelectedRows();
    jsonPath.value = path;
    fileName.value = pathBaseName(path);
    refreshStatSnapshot();
    statusMessage.value = t("message.loadedAndAutoSaved");
  } catch (error) {
    statusMessage.value = "";
    errorMessage.value = formatError(error, t("message.failedReadJson"));
  }
}

function pathBaseName(path: string) {
  return path.split(/[\\/]/).pop() ?? path;
}

async function confirmImportOverwrite(title: string) {
  if (rows.value.length === 0) return true;

  return confirm(
    t("message.importOverwrite"),
    {
      title,
      kind: "warning",
    },
  );
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
    ai_output: toText(sentence.ai_output),
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
    ai_output: toText(row.ai_output),
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
    ai_output: "",
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
  if (isClearRowsConfirmOpen.value) return;

  isClearRowsConfirmOpen.value = true;
  const confirmed = await confirm(t("message.clearListConfirm"), {
    title: t("main.clearList"),
    kind: "warning",
  }).finally(() => {
    isClearRowsConfirmOpen.value = false;
  });

  if (!confirmed) return;

  recordCurrentStateForUndo();
  rows.value = [];
  clearSelectedRows();
  pendingDeleteIndex.value = null;
  refreshStatSnapshot();
  statusMessage.value = t("message.listCleared");
}

async function deleteSelectedRows() {
  pruneSelectedRows(true);
  if (selectedRowIds.value.size === 0) return;
  if (isDeleteSelectedConfirmOpen.value) return;

  const deleteCount = selectedRowIds.value.size;
  isDeleteSelectedConfirmOpen.value = true;
  const confirmed = await confirm(
    `${t("message.deleteSelectedConfirmPrefix")} ${deleteCount} ${t("message.deleteSelectedConfirmSuffix")}`,
    {
      title: t("main.deleteSelected"),
      kind: "warning",
    },
  ).finally(() => {
    isDeleteSelectedConfirmOpen.value = false;
  });

  if (!confirmed) return;

  recordCurrentStateForUndo();
  const idsToDelete = selectedRowIds.value;
  rows.value = rows.value.filter((row) => !idsToDelete.has(getRowIdentity(row)));
  clearSelectedRows();
  pendingDeleteIndex.value = null;
  pruneVirtualRowState();
  markStatSnapshotDirty();
  statusMessage.value = `${t("message.deletedSelected")}: ${deleteCount} ${t("message.rows")}.`;
}

function spreadsheetCellText(value: string) {
  if (!/[\t\r\n"]/.test(value)) return value;
  return `"${value.replace(/"/g, "\"\"")}"`;
}

function selectedRowsSpreadsheetText() {
  const selectedIds = selectedRowIds.value;
  const copyColumns = displayedColumns.value
    .filter((column) => column.key !== "row_number")
    .map((column) => column.key as keyof SentenceRow);

  return rows.value
    .filter((row) => selectedIds.has(getRowIdentity(row)))
    .map((row) => copyColumns.map((column) => spreadsheetCellText(row[column])).join("\t"))
    .join("\n");
}

async function copySelectedRowsForSpreadsheet() {
  pruneSelectedRows(true);
  if (selectedRowIds.value.size === 0) {
    statusMessage.value = t("message.noRowsSelected");
    errorMessage.value = "";
    return;
  }

  try {
    await copyText(selectedRowsSpreadsheetText());
    statusMessage.value = `${t("message.copiedSelectedRows")}: ${selectedRowIds.value.size}.`;
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("message.failedCopySelectedRows");
    statusMessage.value = "";
  }
}

function openBulkStateDialog() {
  pruneSelectedRows(true);
  if (selectedRowIds.value.size === 0) {
    statusMessage.value = t("message.noRowsSelected");
    errorMessage.value = "";
    return;
  }

  if (!openMainDialog("bulkState")) return;
}

function openBulkColumnDialog() {
  pruneSelectedRows(true);
  if (selectedRowIds.value.size === 0) {
    statusMessage.value = t("message.noRowsSelected");
    errorMessage.value = "";
    return;
  }

  if (!openMainDialog("bulkColumn")) return;
  bulkColumnValue.value = "";
}

function closeBulkColumnDialog() {
  isBulkColumnDialogOpen.value = false;
}

async function confirmBulkColumnChange() {
  const selectedIds = selectedRowIds.value;
  if (selectedIds.size === 0) {
    closeBulkColumnDialog();
    return;
  }

  const confirmed = await confirm(
    `${t("bulk.columnConfirmPrefix")} ${selectedIds.size} ${t("bulk.columnConfirmMiddle")} ${bulkColumnKey.value}${t("bulk.columnConfirmSuffix")}`,
    {
      title: t("bulk.columnTitle"),
      kind: "warning",
    },
  );

  if (!confirmed) return;

  recordCurrentStateForUndo();
  let changedCount = 0;
  rows.value.forEach((row) => {
    if (!selectedIds.has(getRowIdentity(row))) return;
    changedCount += 1;
    row[bulkColumnKey.value] = bulkColumnValue.value;
  });
  rows.value = [...rows.value];
  pruneSelectedRows(true);
  markStatSnapshotDirty();
  closeBulkColumnDialog();
  statusMessage.value = `${t("bulk.changedColumnPrefix")}: ${changedCount}; ${bulkColumnKey.value} = ${bulkColumnValue.value}.`;
  errorMessage.value = "";
}

function closeBulkStateDialog() {
  isBulkStateDialogOpen.value = false;
}

function confirmBulkStateChange() {
  const selectedIds = selectedRowIds.value;
  if (selectedIds.size === 0) {
    closeBulkStateDialog();
    return;
  }

  recordCurrentStateForUndo();
  let changedCount = 0;
  rows.value.forEach((row) => {
    if (!selectedIds.has(getRowIdentity(row))) return;
    changedCount += 1;
    row.state = bulkStateValue.value;
  });
  rows.value = [...rows.value];
  pruneSelectedRows(true);
  markStatSnapshotDirty();
  closeBulkStateDialog();
  statusMessage.value = `${t("message.changedSelectedRowsToPrefix")}: ${changedCount}; ${t("message.changedSelectedRowsToSuffix")} ${bulkStateValue.value}.`;
  errorMessage.value = "";
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

function toggleRowSelectionRange(row: SentenceRow, checked: boolean) {
  const rowId = getRowIdentity(row);
  const anchorId = selectionAnchorRowId.value;
  const visibleRowIds = filteredRowIds.value;
  const rowIndex = visibleRowIds.indexOf(rowId);
  const anchorIndex = anchorId === null ? -1 : visibleRowIds.indexOf(anchorId);

  if (rowIndex < 0 || anchorIndex < 0) {
    toggleRowSelection(row, checked);
    selectionAnchorRowId.value = rowId;
    return;
  }

  const [start, end] =
    rowIndex < anchorIndex ? [rowIndex, anchorIndex] : [anchorIndex, rowIndex];
  const nextSelectedIds = new Set(selectedRowIds.value);
  for (const visibleRowId of visibleRowIds.slice(start, end + 1)) {
    if (checked) {
      nextSelectedIds.add(visibleRowId);
    } else {
      nextSelectedIds.delete(visibleRowId);
    }
  }
  selectedRowIds.value = nextSelectedIds;
}

function applyRowSelection(row: SentenceRow, checked: boolean, shiftKey: boolean) {
  if (shiftKey) {
    toggleRowSelectionRange(row, checked);
  } else {
    toggleRowSelection(row, checked);
  }
  selectionAnchorRowId.value = getRowIdentity(row);
}

function handleRowSelectionChange(row: SentenceRow, event: MouseEvent) {
  const input = event.currentTarget as HTMLInputElement;
  applyRowSelection(row, input.checked, event.shiftKey);
}

function isInteractiveRowNumberTarget(event: MouseEvent) {
  const target = event.target instanceof HTMLElement ? event.target : null;
  return Boolean(target?.closest("button, input, select, textarea"));
}

function handleRowNumberCellMouseDown(event: MouseEvent) {
  if (!isInteractiveRowNumberTarget(event)) {
    event.preventDefault();
  }
}

function handleRowNumberCellClick(row: SentenceRow, event: MouseEvent) {
  if (isInteractiveRowNumberTarget(event)) return;

  const rowId = getRowIdentity(row);
  applyRowSelection(row, !selectedRowIds.value.has(rowId), event.shiftKey);
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
  selectionAnchorRowId.value = null;
}

function selectAllFilteredRows() {
  toggleFilteredRowSelection(true);
  statusMessage.value = `${t("message.selectedFilteredRows")}: ${filteredRowIds.value.length}.`;
  errorMessage.value = "";
}

function deselectAllRows() {
  clearSelectedRows();
  statusMessage.value = t("message.deselectedAllRows");
  errorMessage.value = "";
}

function handleFilteredSelectionChange(event?: Event) {
  event?.preventDefault();
  toggleFilteredRowSelection(!isEveryFilteredRowSelected.value);
}

function clearSelectedRows() {
  selectedRowIds.value = new Set();
  selectionAnchorRowId.value = null;
}

function pruneSelectedRows(forceRefresh = false) {
  const existingRowIds = new Set(rows.value.map((row) => getRowIdentity(row)));
  const nextSelectedIds = new Set(
    Array.from(selectedRowIds.value).filter((rowId) => existingRowIds.has(rowId)),
  );

  if (forceRefresh || nextSelectedIds.size !== selectedRowIds.value.size) {
    selectedRowIds.value = nextSelectedIds;
  }
  if (
    selectionAnchorRowId.value !== null &&
    !existingRowIds.has(selectionAnchorRowId.value)
  ) {
    selectionAnchorRowId.value = null;
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
        ? t("message.noRowsToJump")
        : `${t("message.enterRowRangePrefix")} ${rows.value.length}${t("message.enterRowRangeSuffix")}`;
    return false;
  }

  const targetRowIndex = targetRowNumber - 1;
  const filteredIndex = filteredRows.value.findIndex(
    (item) => item.index === targetRowIndex,
  );

  if (filteredIndex === -1) {
    statusMessage.value = "";
    errorMessage.value = `${t("message.rowHiddenByFiltersPrefix")} ${targetRowNumber} ${t("message.rowHiddenByFiltersSuffix")}`;
    return false;
  }

  errorMessage.value = "";
  statusMessage.value = `${t("message.jumpedToRow")} ${targetRowNumber}.`;

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

async function restoreTableScrollAnchor(anchor: TableScrollAnchor | null) {
  await nextTick();
  applyTableScrollAnchor(anchor);
  window.requestAnimationFrame(() => {
    applyTableScrollAnchor(anchor);
    updateTableViewport();
  });
}

function applyTableScrollAnchor(anchor: TableScrollAnchor | null) {
  if (!anchor) {
    setTableScrollTop(0);
    return;
  }

  const items = filteredRows.value;
  if (items.length === 0) {
    setTableScrollTop(0);
    return;
  }

  let matchingOccurrence = 0;
  let targetIndex = -1;
  for (let index = 0; index < items.length; index += 1) {
    if (sentenceRowSignature(items[index].row) !== anchor.signature) continue;
    if (matchingOccurrence === anchor.occurrence) {
      targetIndex = index;
      break;
    }
    matchingOccurrence += 1;
  }

  if (targetIndex === -1) {
    targetIndex = Math.min(anchor.filteredIndex, items.length - 1);
  }

  const nextScrollTop = sumRowHeights(items, 0, targetIndex) + anchor.offset;
  setTableScrollTop(Math.max(0, nextScrollTop));
}

function setTableScrollTop(scrollTop: number) {
  tableScrollTop.value = scrollTop;
  if (tableWrap.value) {
    tableWrap.value.scrollTop = scrollTop;
  }
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
      ai_output: row.ai_output,
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

async function persistDraft() {
  try {
    if (rows.value.length === 0 && fileName.value === "" && jsonPath.value === "") {
      await invoke("delete_app_draft", { name: "main" });
      window.localStorage.removeItem(draftStorageKey);
      return;
    }

    const draft: StoredDraft = {
      fileName: fileName.value,
      jsonPath: jsonPath.value,
      rows: rows.value,
    };

    await invoke("write_app_draft", {
      contents: JSON.stringify(draft),
      name: "main",
    });
    window.localStorage.removeItem(draftStorageKey);
    statusMessage.value = t("message.autoSavedLocal");
  } catch (error) {
    errorMessage.value = formatError(error, t("message.failedAutoSave"));
  }
}

function formatError(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

function formatMessageTimestamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function defaultLlmSettings(): LlmServerSettings {
  return {
    providerMode: "local",
    providerName: "OpenAI compatible",
    baseUrl: "http://localhost:11434/v1",
    model: "",
    organization: "",
    project: "",
    extraRequestJson: "",
  };
}

function defaultAiTranslationPrompt() {
  return `You are translating text for a retro video game ROM editing tool.

Translate the current text from {source_language} into {target_language}.

Rules:
- Preserve all control codes, placeholders, bracketed tokens, and special tokens exactly.
- Do not remove or reorder tokens such as <...>, [...], {...}.
- Preserve intentional line breaks when they affect layout.
- Prefer concise game UI/dialogue style.
- Do not add explanations or invent story details.
- If the existing translation is usable, improve it instead of rewriting unnecessarily.
- Follow the user note if provided.
- Use the nearby context to keep terminology, tone, speaker continuity, and UI wording consistent.
- In nearby context, if translation is identical to original, treat it as untranslated unless it is clearly a proper noun, code, symbol, or intentionally preserved term.
- Do not translate or rewrite nearby context rows; only translate the current row.

Current row:
file_name: {file_name}
title_addr: {title_addr}
state: {state}
note: {note}

Original text:
{original_text}

Existing translation:
{translated_text}

Nearby context, for consistency reference only:
{nearby_rows}

Reference txt attachment, for terminology and style only. Do not translate this whole attachment:
{attachment_text}

Return only valid JSON:
{
  "translated_text": "translated result",
  "note": "optional short note, or empty string"
}`;
}

function defaultAiTranslationVideoPrompt() {
  return `You are translating subtitles for a video.

Translate the current subtitle from {source_language} into {target_language}.

Rules:
- Preserve the meaning, tone, and speaker intent.
- Make the translation natural for on-screen subtitles, not literal word-by-word text.
- Keep the subtitle concise enough to read during the original timing.
- Preserve intentional line breaks when they improve readability.
- Do not add explanations, timestamps, speaker labels, or commentary.
- Preserve names, terminology, bracketed tokens, and placeholders exactly when they should not be translated.
- If the existing translation is usable, improve it instead of rewriting unnecessarily.
- Follow the user note if provided.
- Use nearby subtitle context to keep pronouns, terminology, speaker continuity, and emotional tone consistent.
- In nearby context, if translation is identical to original, treat it as untranslated unless it is clearly a proper noun, code, symbol, or intentionally preserved term.
- Do not translate or rewrite nearby subtitle context; only translate the current subtitle.

Current subtitle:
timecode/title_addr: {title_addr}
file_name: {file_name}
state: {state}
note: {note}

Original subtitle:
{original_text}

Existing translation:
{translated_text}

Nearby subtitle context, for consistency reference only:
{nearby_rows}

Reference txt attachment, for terminology, names, and style only. Do not translate this whole attachment:
{attachment_text}

Return only valid JSON:
{
  "translated_text": "translated subtitle",
  "note": "optional short note, or empty string"
}`;
}

function defaultAiTranslationSettings(): AiTranslationSettings {
  return {
    scope: "filtered",
    sourceLanguage: "Japanese",
    targetLanguage: "简体中文",
    promptTemplate: defaultAiTranslationPrompt(),
    minOriginalCharacters: 1,
    timeoutSeconds: 60,
    temperature: 0.2,
    attachmentPath: "",
  };
}

function restoreLlmSettings(): LlmServerSettings {
  try {
    const rawSettings = window.localStorage.getItem(llmSettingsStorageKey);
    if (!rawSettings) return defaultLlmSettings();
    const settings = sanitizeLlmSettings(JSON.parse(rawSettings));
    window.localStorage.setItem(llmSettingsStorageKey, JSON.stringify(settings));
    return settings;
  } catch {
    window.localStorage.removeItem(llmSettingsStorageKey);
    return defaultLlmSettings();
  }
}

function persistLlmSettings() {
  window.localStorage.setItem(llmSettingsStorageKey, JSON.stringify(llmSettings.value));
}

function restoreAiTranslationSettings(): AiTranslationSettings {
  try {
    const rawSettings = window.localStorage.getItem(aiTranslationSettingsStorageKey);
    if (!rawSettings) return defaultAiTranslationSettings();
    return sanitizeAiTranslationSettings(JSON.parse(rawSettings));
  } catch {
    window.localStorage.removeItem(aiTranslationSettingsStorageKey);
    return defaultAiTranslationSettings();
  }
}

function persistAiTranslationSettings() {
  window.localStorage.setItem(
    aiTranslationSettingsStorageKey,
    JSON.stringify(aiTranslationSettings.value),
  );
}

function restoreBulkStateValue(): StateValue {
  const storedState = window.localStorage.getItem(bulkStateStorageKey);
  const matchedState = stateOptions.find((state) => state === storedState);
  return matchedState ?? "⭕️temp";
}

function persistBulkStateValue() {
  window.localStorage.setItem(bulkStateStorageKey, bulkStateValue.value);
}

function restoreBulkColumnKey(): MainBulkEditableColumn {
  const storedColumn = window.localStorage.getItem(bulkColumnStorageKey);
  const matchedColumn = bulkEditableColumns.find((column) => column.key === storedColumn);
  return matchedColumn?.key ?? "translated_text";
}

function persistBulkColumnKey() {
  window.localStorage.setItem(bulkColumnStorageKey, bulkColumnKey.value);
}

function sanitizeLlmSettings(value: unknown): LlmServerSettings {
  const defaults = defaultLlmSettings();
  if (!isPlainRecord(value)) return defaults;

  return {
    providerMode: value.providerMode === "cloud" ? "cloud" : "local",
    providerName: textSetting(value.providerName, defaults.providerName),
    baseUrl: textSetting(value.baseUrl, defaults.baseUrl),
    model: textSetting(value.model, defaults.model),
    organization: textSetting(value.organization, defaults.organization),
    project: textSetting(value.project, defaults.project),
    extraRequestJson: textSetting(value.extraRequestJson, defaults.extraRequestJson),
  };
}

function sanitizeAiTranslationSettings(value: unknown): AiTranslationSettings {
  const defaults = defaultAiTranslationSettings();
  if (!isPlainRecord(value)) return defaults;

  return {
    scope: translationScopeSetting(value.scope, defaults.scope),
    sourceLanguage: textSetting(value.sourceLanguage, defaults.sourceLanguage),
    targetLanguage: textSetting(value.targetLanguage, defaults.targetLanguage),
    promptTemplate: textSetting(value.promptTemplate, defaults.promptTemplate),
    minOriginalCharacters: clampNumber(
      value.minOriginalCharacters,
      0,
      10000,
      defaults.minOriginalCharacters,
    ),
    timeoutSeconds: clampNumber(value.timeoutSeconds, 1, 600, defaults.timeoutSeconds),
    temperature: clampNumber(value.temperature, 0, 2, defaults.temperature),
    attachmentPath: textSetting(value.attachmentPath, defaults.attachmentPath),
  };
}

function translationScopeSetting(value: unknown, fallback: AiTranslationScope) {
  return value === "all" ||
    value === "selected" ||
    value === "filtered"
    ? value
    : fallback;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textSetting(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function newlineHintParts(value: string) {
  return value.split("\n");
}

function columnIndexByKey(key: ColumnKey) {
  return columns.findIndex((column) => column.key === key);
}

function movableColumn(key: ColumnKey) {
  return key !== "row_number";
}

function restoreColumnOrder(): ColumnKey[] {
  const defaultOrder = columns.map((column) => column.key);
  try {
    const rawOrder = window.localStorage.getItem(columnOrderStorageKey);
    if (!rawOrder) return defaultOrder;
    const parsed = JSON.parse(rawOrder) as unknown;
    if (!Array.isArray(parsed)) return defaultOrder;

    const knownKeys = new Set(defaultOrder);
    const restored = parsed.filter(
      (key): key is ColumnKey => typeof key === "string" && knownKeys.has(key as ColumnKey),
    );
    return [
      "row_number",
      ...restored.filter((key) => key !== "row_number"),
      ...defaultOrder.filter((key) => !restored.includes(key)),
    ];
  } catch {
    window.localStorage.removeItem(columnOrderStorageKey);
    return defaultOrder;
  }
}

function restoreHiddenColumnKeys(): Set<ColumnKey> {
  try {
    const rawVisibility = window.localStorage.getItem(columnVisibilityStorageKey);
    if (!rawVisibility) return new Set();
    const parsed = JSON.parse(rawVisibility) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return new Set();

    const knownKeys = new Set(columns.map((column) => column.key));
    const hidden = new Set<ColumnKey>();
    Object.entries(parsed as Record<string, unknown>).forEach(([key, isVisible]) => {
      if (key !== "row_number" && knownKeys.has(key as ColumnKey) && isVisible === false) {
        hidden.add(key as ColumnKey);
      }
    });
    return hidden;
  } catch {
    window.localStorage.removeItem(columnVisibilityStorageKey);
    return new Set();
  }
}

function persistColumnOrder() {
  window.localStorage.setItem(columnOrderStorageKey, JSON.stringify(columnOrder.value));
}

function persistColumnVisibility() {
  const visibility = Object.fromEntries(
    columns
      .filter((column) => column.key !== "row_number")
      .map((column) => [column.key, !hiddenColumnKeys.value.has(column.key)]),
  );
  window.localStorage.setItem(columnVisibilityStorageKey, JSON.stringify(visibility));
}

function toggleColumnVisibility(columnKey: string) {
  if (!columns.some((column) => column.key === columnKey) || columnKey === "row_number") {
    return;
  }

  const key = columnKey as ColumnKey;
  const nextHidden = new Set(hiddenColumnKeys.value);
  if (nextHidden.has(key)) {
    nextHidden.delete(key);
  } else {
    nextHidden.add(key);
  }
  hiddenColumnKeys.value = nextHidden;
  persistColumnVisibility();
  syncMainColumnVisibilityMenu();
  nextTick(() => {
    updateTableViewport();
  });
}

function startColumnReorder(columnKey: ColumnKey, event: PointerEvent) {
  if (!movableColumn(columnKey)) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest("button, input, select, textarea")) return;
  event.preventDefault();
  lastColumnPointerX = event.clientX;
  lastColumnPointerY = event.clientY;
  activeColumnDragElement = event.currentTarget as HTMLElement | null;
  window.addEventListener("pointermove", trackColumnPointer);
  window.addEventListener("pointerup", finishColumnReorder);
  columnDragTimer = window.setTimeout(() => {
    draggedColumnKey = columnKey;
    columnDropTargetKey.value = null;
    activeColumnDragElement?.classList.add("reordering");
    document.body.style.userSelect = "none";
  }, 350);
}

function trackColumnPointer(event: PointerEvent) {
  lastColumnPointerX = event.clientX;
  lastColumnPointerY = event.clientY;
  if (draggedColumnKey) {
    event.preventDefault();
    const targetKey = columnKeyFromPoint(event.clientX, event.clientY);
    columnDropTargetKey.value =
      targetKey && targetKey !== draggedColumnKey && movableColumn(targetKey)
        ? targetKey
        : null;
  }
}

function cancelColumnReorder() {
  if (columnDragTimer !== undefined) {
    window.clearTimeout(columnDragTimer);
    columnDragTimer = undefined;
  }
  draggedColumnKey = null;
  columnDropTargetKey.value = null;
  activeColumnDragElement?.classList.remove("reordering");
  activeColumnDragElement = null;
  document.body.style.userSelect = "";
  window.removeEventListener("pointermove", trackColumnPointer);
  window.removeEventListener("pointerup", finishColumnReorder);
}

function columnKeyFromPoint(x: number, y: number): ColumnKey | null {
  const element = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-column-key]");
  const key = element?.dataset.columnKey;
  return columns.some((column) => column.key === key) ? (key as ColumnKey) : null;
}

function finishColumnReorder(event: PointerEvent) {
  lastColumnPointerX = event.clientX;
  lastColumnPointerY = event.clientY;
  const sourceKey = draggedColumnKey;
  const targetKey = columnKeyFromPoint(lastColumnPointerX, lastColumnPointerY);
  cancelColumnReorder();
  if (!sourceKey || !targetKey || sourceKey === targetKey || !movableColumn(targetKey)) return;

  const nextOrder = columnOrder.value.filter((key) => key !== sourceKey);
  const targetIndex = nextOrder.indexOf(targetKey);
  if (targetIndex < 0) return;
  nextOrder.splice(targetIndex, 0, sourceKey);
  columnOrder.value = nextOrder;
  persistColumnOrder();
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

function sentenceCellStyle(key: keyof SentenceRow) {
  const columnIndex = columnIndexByKey(key);
  if (key === "original_text") return textColumnStyle(columnIndex, "original");
  if (key === "translated_text") return textColumnStyle(columnIndex, "translated");
  if (key === "note") return textColumnStyle(columnIndex, "note");
  return columnFontStyle(columnIndex);
}

function disablesTextCorrection(key: keyof SentenceRow) {
  return key === "title_addr" || key === "file_name";
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

function fontOptionLabel(mode: CjkFallbackMode) {
  const labels: Record<CjkFallbackMode, string> = {
    default: t("font.default"),
    sc: t("font.sc"),
    tc: t("font.tc"),
    jp: t("font.jp"),
    kr: t("font.kr"),
  };
  return labels[mode];
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

async function syncWindowTheme() {
  try {
    const nativeTheme = themeMode.value === "system" ? null : themeMode.value;
    await setAppTheme(nativeTheme);
    await appWindow.setTheme(nativeTheme);
  } catch (error) {
    console.warn("Failed to sync native window theme.", error);
    // The web theme still works if native titlebar theming is unavailable.
  }
}

function getSystemThemeMode(): "light" | "dark" {
  return systemThemeQuery.matches ? "dark" : "light";
}

function handleSystemThemeChange() {
  systemThemeMode.value = getSystemThemeMode();
  if (themeMode.value === "system") {
    void syncNativeChrome();
  }
}

function syncAppLanguageMenu(forceRebuild = false) {
  invoke("set_app_language_menu", {
    language: currentLanguage.value,
    forceRebuild,
  }).catch((error) => {
    console.warn("Failed to sync app language menu.", error);
  });
}

async function syncNativeChrome() {
  // On Windows the native menu colors are captured when the menu is attached,
  // so apply the window theme before rebuilding localized menus.
  await syncWindowTheme();
  syncAppLanguageMenu(true);
  syncMainColumnVisibilityMenu();
}

function syncHistoryMenuState() {
  invoke("set_history_menu_enabled", {
    canUndo: canUndoTableChange.value,
    canRedo: canRedoTableChange.value,
  }).catch((error) => {
    console.warn("Failed to sync history menu state.", error);
  });
}

function syncMainColumnVisibilityMenu() {
  const visibility = Object.fromEntries(
    columns
      .filter((column) => column.key !== "row_number")
      .map((column) => [column.key, !hiddenColumnKeys.value.has(column.key)]),
  );

  invoke("set_main_column_visibility_menu", { visibility }).catch((error) => {
    console.warn("Failed to sync main column visibility menu.", error);
  });
}

function refreshStatSnapshot(resetScroll = true) {
  if (!resetScroll) return;

  tableScrollTop.value = 0;
  if (tableWrap.value) {
    tableWrap.value.scrollTop = 0;
  }
}

function markStatSnapshotDirty() {
  // Filters and statistics are computed directly from current rows now.
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

function isOriginalEqualsTranslated(row: SentenceRow) {
  const originalText = row.original_text.trim();
  return originalText === "" || originalText !== row.translated_text.trim();
}

function clearStatFilters() {
  activeStatFilters.value = [];
}

function clearRowFilter() {
  rowFilterStart.value = "";
  rowFilterEnd.value = "";
}

function resetSearchFilters() {
  searchText.value = "";
  textMatchMode.value = "contains";
  isCaseSensitiveSearch.value = false;
  searchLengthColumn.value = "translated_text";
  searchLengthMin.value = "";
  searchLengthMax.value = "";
  selectedSearchColumns.value = textSearchColumns.map((column) => column.key);
  activeStatFilters.value = [];
  rowFilterStart.value = "";
  rowFilterEnd.value = "";
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
  switch (filter.type) {
    case "state":
      return row.state === filter.state;
    case "empty_translation":
      return row.translated_text.trim() === "";
    case "not_translated":
      return isNotTranslated(row);
    case "original_equals_translated":
      return isOriginalEqualsTranslated(row);
    case "has_note":
      return row.note.trim() !== "";
    case "duplicate_title_addr": {
      return duplicateTitleAddressIds.value.has(getRowIdentity(row));
    }
  }
}

function rowMatchesRowRange(rowIndex: number) {
  const rowNumber = rowIndex + 1;
  const start = positiveIntegerOrNull(rowFilterStart.value);
  const end = positiveIntegerOrNull(rowFilterEnd.value);

  if (start !== null && rowNumber < start) return false;
  if (end !== null && rowNumber > end) return false;
  return true;
}

function positiveIntegerOrNull(value: unknown) {
  const text = String(value).trim();
  if (text === "") return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : null;
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

function textLengthMatches(value: string) {
  const minLength = nonNegativeIntegerOrNull(searchLengthMin.value);
  const maxLength = nonNegativeIntegerOrNull(searchLengthMax.value);
  if (minLength === null && maxLength === null) return true;

  const length = Array.from(value).length;
  if (length === 0 && minLength !== 0) return false;
  if (minLength !== null && length < minLength) return false;
  if (maxLength !== null && length > maxLength) return false;
  return true;
}

function nonNegativeIntegerOrNull(value: unknown) {
  const text = String(value).trim();
  if (text === "") return null;
  const parsed = Number.parseInt(text, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function restoreThemeMode(): ThemeMode {
  const storedTheme = window.localStorage.getItem(themeStorageKey);
  return storedTheme === "system" || storedTheme === "dark" || storedTheme === "light"
    ? storedTheme
    : "system";
}

function restoreTopPanelVisible() {
  return window.localStorage.getItem(topPanelVisibleStorageKey) !== "false";
}

function persistTopPanelVisible() {
  window.localStorage.setItem(topPanelVisibleStorageKey, String(isTopPanelVisible.value));
}

function toggleTopPanel() {
  isTopPanelVisible.value = !isTopPanelVisible.value;
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

async function restoreDraft() {
  try {
    const backendDraft = await invoke<string | null>("read_app_draft", { name: "main" });
    const legacyDraft = window.localStorage.getItem(draftStorageKey);
    const rawDraft = backendDraft ?? legacyDraft;
    if (!rawDraft) return;

    const draft = JSON.parse(rawDraft) as Partial<StoredDraft>;
    if (!Array.isArray(draft.rows)) return;

    rows.value = draft.rows.map(normalizeStoredRow);
    fileName.value = toText(draft.fileName);
    jsonPath.value = toText(draft.jsonPath);
    refreshStatSnapshot();
    statusMessage.value = t("message.restoredLocalDraft");
    if (!backendDraft && legacyDraft) {
      // Migrate old browser storage into app data on first successful restore.
      window.localStorage.removeItem(draftStorageKey);
      queuePersistDraft();
    }
  } catch {
    window.localStorage.removeItem(draftStorageKey);
    invoke("delete_app_draft", { name: "main" }).catch(() => {});
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
    <div v-if="!isTopPanelVisible" class="compact-top-bar">
      <button
        class="top-panel-toggle"
        type="button"
        @click="toggleTopPanel"
      >
        {{ t("common.showControls") }}
      </button>
      <p class="compact-file-path">
        {{
          jsonPath ||
          (rows.length > 0
            ? t("main.noJsonSavePath")
            : t("main.noJsonFileLoaded"))
        }}
      </p>
      <span class="compact-result-count">{{ filteredRows.length }} / {{ rows.length }}</span>
      <p
        class="compact-message"
        :class="{
          'error-message': errorMessage,
          'status-message': !errorMessage && displayedMessage,
          empty: !displayedMessage,
        }"
      >
        {{ displayedMessage || "\u00a0" }}
      </p>
    </div>

    <section v-if="isTopPanelVisible" class="top-panel">
      <header class="toolbar">
        <div class="toolbar-actions">
          <div class="toolbar-controls">
            <select v-model="themeMode" class="theme-select" :aria-label="t('common.theme')">
              <option value="system">{{ t("theme.system") }}</option>
              <option value="light">{{ t("theme.light") }}</option>
              <option value="dark">{{ t("theme.dark") }}</option>
            </select>
            <button type="button" @click="openFilePicker">{{ t("main.readJson") }}</button>
            <button type="button" :disabled="!canSaveJson" @click="saveJsonFile">
              {{ isSaving ? t("common.saving") : t("main.saveJson") }}
            </button>
            <button type="button" @click="openExcelImportDialog">
              {{ t("main.importExcel") }}
            </button>
            <button
              type="button"
              :disabled="rows.length === 0"
              @click="openExcelExportDialog"
            >
              {{ t("main.exportExcel") }}
            </button>
            <button
              class="clear-list-btn"
              type="button"
              :disabled="rows.length === 0"
              @click="clearRows"
            >
              {{ t("main.clearList") }}
            </button>
            <button
              class="delete-selected-btn"
              type="button"
              :disabled="selectedRowCount === 0"
              @click="deleteSelectedRows"
            >
              {{ t("main.deleteSelected") }} {{ selectedRowCount > 0 ? selectedRowCount : "" }}
            </button>
            <button
              type="button"
              :disabled="selectedRowCount === 0"
              @click="copySelectedRowsForSpreadsheet"
            >
              {{ t("main.copySelected") }} {{ selectedRowCount > 0 ? selectedRowCount : "" }}
            </button>
          </div>
          <p class="file-status">
            {{
              jsonPath ||
              (rows.length > 0
                ? t("main.noJsonSavePath")
                : t("main.noJsonFileLoaded"))
            }}
          </p>
        </div>
          <span class="result-count">
            <!-- {{ renderedRows.length }} / {{ filteredRows.length }} / {{ rows.length }} -->
              {{ filteredRows.length }} / {{ rows.length }}
          </span>
      </header>

      <MainSearchControls
        ref="topSearchControls"
        v-model:search-text="searchText"
        v-model:text-match-mode="textMatchMode"
        v-model:is-case-sensitive-search="isCaseSensitiveSearch"
        v-model:search-length-column="searchLengthColumn"
        v-model:search-length-min="searchLengthMin"
        v-model:search-length-max="searchLengthMax"
        v-model:selected-search-columns="selectedSearchColumns"
        v-model:row-filter-start="rowFilterStart"
        v-model:row-filter-end="rowFilterEnd"
        v-model:go-to-row-value="goToRowValue"
        :displayed-message="displayedMessage"
        :error-message="errorMessage"
        :filtered-rows-length="filteredRows.length"
        :go-to-max-row="rows.length"
        :has-active-row-filter="hasActiveRowFilter"
        :has-active-stat-filters="hasActiveStatFilters"
        :is-stat-filter-active="isStatFilterActive"
        :row-stats="rowStats"
        :rows-length="rows.length"
        :state-options="stateOptions"
        :text-search-columns="textSearchColumns"
        @clear-row-filter="clearRowFilter"
        @clear-stat-filters="clearStatFilters"
        @go-to-row="goToRow"
        @reset-search="resetSearchFilters"
        @toggle-stat-filter="toggleStatFilter"
      />
    </section>

    <div
      v-if="isSearchOverlayOpen"
      class="search-overlay-backdrop"
      role="presentation"
      @click.self="closeSearchOverlay"
    >
      <div class="search-overlay-stack">
        <button
          class="search-overlay-close"
          type="button"
          :aria-label="t('common.close')"
          @click="closeSearchOverlay"
        >
          ×
        </button>
        <section class="search-overlay-panel" role="dialog" aria-modal="true">
          <MainSearchControls
            ref="overlaySearchControls"
            v-model:search-text="searchText"
            v-model:text-match-mode="textMatchMode"
            v-model:is-case-sensitive-search="isCaseSensitiveSearch"
            v-model:search-length-column="searchLengthColumn"
            v-model:search-length-min="searchLengthMin"
            v-model:search-length-max="searchLengthMax"
            v-model:selected-search-columns="selectedSearchColumns"
            v-model:row-filter-start="rowFilterStart"
            v-model:row-filter-end="rowFilterEnd"
            v-model:go-to-row-value="goToRowValue"
            :displayed-message="displayedMessage"
            :error-message="errorMessage"
            :filtered-rows-length="filteredRows.length"
            :go-to-max-row="rows.length"
            :has-active-row-filter="hasActiveRowFilter"
            :has-active-stat-filters="hasActiveStatFilters"
            :is-stat-filter-active="isStatFilterActive"
            :row-stats="rowStats"
            :rows-length="rows.length"
            :state-options="stateOptions"
            :text-search-columns="textSearchColumns"
          @clear-row-filter="clearRowFilter"
          @clear-stat-filters="clearStatFilters"
          @go-to-row="goToRow"
          @reset-search="resetSearchFilters"
          @toggle-stat-filter="toggleStatFilter"
        />
        </section>
      </div>
    </div>

    <section
      ref="tableWrap"
      class="table-wrap"
      :aria-label="t('main.sentenceList')"
      @scroll="handleTableScroll"
    >
      <div class="sentence-grid header-row" :style="{ gridTemplateColumns }">
        <div
          v-for="column in displayedColumns"
          :key="column.key"
          class="header-cell"
          :class="{ 'drop-target': columnDropTargetKey === column.key }"
          :data-column-key="column.key"
        >
          <div
            class="header-content"
            @pointerdown="startColumnReorder(column.key, $event)"
          >
            <span class="header-label">{{ column.label }}</span>
            <div v-if="column.key === 'row_number'" class="header-row-actions">
              <input
                class="row-select-checkbox"
                type="checkbox"
                :aria-label="t('main.selectFilteredRows')"
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
                :aria-label="t('main.addRowAtEnd')"
                @click="addRowAtEnd"
              >
                +
              </button>
              <span class="font-size-readout">
                {{ columnFontSizes[columnIndexByKey(column.key)] }}px
              </span>
            </div>
            <div v-else class="font-size-controls">
              <button
                type="button"
                :aria-label="`Decrease ${column.label} font size`"
                @click="adjustColumnFontSize(columnIndexByKey(column.key), -1)"
              >
                -
              </button>
              <span>{{ columnFontSizes[columnIndexByKey(column.key)] }}px</span>
              <button
                type="button"
                :aria-label="`Increase ${column.label} font size`"
                @click="adjustColumnFontSize(columnIndexByKey(column.key), 1)"
              >
                +
              </button>
            </div>
            <div
              v-if="column.key === 'original_text'"
              class="fallback-controls"
            >
              <span>{{ t("main.font") }}</span>
              <select
                v-model="cjkFallbackPrefs.original"
                aria-label="original_text fallback font preference"
              >
                <option
                  v-for="option in cjkFallbackOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ fontOptionLabel(option.value) }}
                </option>
              </select>
            </div>
            <div
              v-else-if="column.key === 'translated_text'"
              class="fallback-controls"
            >
              <span>{{ t("main.font") }}</span>
              <select
                v-model="cjkFallbackPrefs.translated"
                aria-label="translated_text fallback font preference"
              >
                <option
                  v-for="option in cjkFallbackOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ fontOptionLabel(option.value) }}
                </option>
              </select>
            </div>
            <div v-else-if="column.key === 'note'" class="fallback-controls">
              <span>{{ t("main.font") }}</span>
              <select
                v-model="cjkFallbackPrefs.note"
                aria-label="note fallback font preference"
              >
                <option
                  v-for="option in cjkFallbackOptions"
                  :key="option.value"
                  :value="option.value"
                >
                  {{ fontOptionLabel(option.value) }}
                </option>
              </select>
            </div>
          </div>
          <button
            class="resize-handle"
            type="button"
            :aria-label="`Resize ${column.label}`"
            @pointerdown="startResize(columnIndexByKey(column.key), $event)"
          />
        </div>
        <div class="header-cell table-end-spacer" aria-hidden="true" />
      </div>

      <div v-if="rows.length === 0" class="empty-state">
        {{ t("main.noJsonFileLoaded") }}
      </div>

      <div v-else-if="filteredRows.length === 0" class="empty-state">
        {{ t("message.noMatchingSentenceRows") }}
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
          <template v-for="column in displayedColumns" :key="column.key">
            <div
              v-if="column.key === 'row_number'"
              class="row-number-cell"
              :style="columnFontStyle(columnIndexByKey(column.key))"
              @mousedown="handleRowNumberCellMouseDown"
              @click="handleRowNumberCellClick(row, $event)"
            >
              <input
                class="row-select-checkbox"
                type="checkbox"
                :aria-label="`Select row ${rowIndex + 1}`"
                :checked="selectedRowIds.has(getRowIdentity(row))"
                @click="handleRowSelectionChange(row, $event)"
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
            <div
              v-else-if="column.key === 'state'"
              class="select-cell"
              :style="columnFontStyle(columnIndexByKey(column.key))"
            >
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
            <div
              v-else
              class="textarea-cell"
              :style="sentenceCellStyle(column.key)"
            >
              <textarea
                v-model="row[column.key]"
                :aria-label="column.key"
                :autocapitalize="disablesTextCorrection(column.key) ? 'off' : undefined"
                :autocorrect="disablesTextCorrection(column.key) ? 'off' : undefined"
                :spellcheck="disablesTextCorrection(column.key) ? false : undefined"
                @focus="beginTableEdit"
                @input="markStatSnapshotDirty"
                @blur="commitTableEdit"
              />
              <div class="newline-hints" aria-hidden="true">
                <template
                  v-for="(line, lineIndex) in newlineHintParts(row[column.key])"
                  :key="lineIndex"
                >
                  <span>{{ line || " " }}</span>
                  <span
                    v-if="lineIndex < newlineHintParts(row[column.key]).length - 1"
                    class="newline-marker"
                  >
                    ↵
                  </span>
                  <br
                    v-if="lineIndex < newlineHintParts(row[column.key]).length - 1"
                  />
                </template>
              </div>
              <div class="textarea-measure">{{ row[column.key] || " " }}</div>
            </div>
          </template>
          <div class="table-end-spacer" aria-hidden="true" />
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

    <LanguageDialog
      v-if="isLanguageDialogOpen"
      :current-language="currentLanguage"
      @close="closeLanguageDialog"
      @select="selectLanguage"
    />

    <CharacterStatsDialog
      v-if="isCharacterStatsDialogOpen"
      v-model:scope="characterStatsScope"
      v-model:include-all-characters="characterStatsIncludeAll"
      v-model:character-types="characterStatsTypes"
      v-model:sort-order="characterStatsSortOrder"
      v-model:bracket-token-types="characterStatsBracketTokenTypes"
      v-model:ignore-whitespace="characterStatsIgnoreWhitespace"
      always-show-progress
      :can-copy="characterStatsResult !== ''"
      :is-running="isCountingCharacterStats"
      :message="characterStatsMessage"
      :progress-value="characterStatsProgress"
      :result="characterStatsResult"
      :row-count="characterStatsRowCount"
      show-ignore-whitespace
      @close="closeCharacterStatsDialog"
      @copy="copyCharacterStatsResult"
      @run="runCharacterStats"
    />

    <LlmSettingsDialog
      v-if="isLlmSettingsDialogOpen"
      :api-key-input="llmApiKeyInput"
      :has-stored-api-key="hasStoredLlmApiKey"
      :is-testing="isTestingLlmConnection"
      :message="llmSettingsMessage"
      :settings="llmSettings"
      :timeout-seconds="aiTranslationSettings.timeoutSeconds"
      @clear-api-key="clearLlmApiKey"
      @close="closeLlmSettingsDialog"
      @reset="resetLlmSettings"
      @save-api-key="saveLlmApiKey"
      @test="testLlmConnection"
      @update-api-key-input="updateLlmApiKeyInput"
      @update-timeout-seconds="updateAiTranslationTimeoutSeconds"
      @update="updateLlmSettings"
    />

    <AiTranslationDialog
      v-if="isAiTranslationDialogOpen"
      :has-result="aiTranslationSession !== null"
      :is-error="errorMessage !== '' && errorMessage === aiTranslationMessage"
      :is-fake-mode="isAiTranslationFakeMode"
      :is-translating="isPreparingAiTranslation"
      :message="aiTranslationMessage"
      :row-count="aiTranslationRowCount"
      :settings="aiTranslationSettings"
      @browse-attachment="browseAiTranslationAttachment"
      @clear-attachment="clearAiTranslationAttachment"
      @close="closeAiTranslationDialog"
      @open-result="openAiTranslationResultDialog"
      @reset-prompt="resetAiTranslationPrompt"
      @reset-video-prompt="resetAiTranslationVideoPrompt"
      @translate="translateWithAi"
      @update="updateAiTranslationSettings"
    />

    <AiTranslationRunDialog
      v-if="isPreparingAiTranslation"
      :completed-count="aiTranslationCompletedCount"
      :current-original-text="aiTranslationFinishedText"
      :current-translated-text="aiTranslationFinishedPreview"
      :error-count="aiTranslationErrorCount"
      :is-stopping="isAiTranslationStopRequested"
      :message="aiTranslationMessage"
      :total-count="aiTranslationRowCount"
      @stop="stopAiTranslationRun"
    />

    <AiTranslationSessionDialog
      v-if="isAiTranslationSessionDialogOpen && aiTranslationSession"
      :apply-mode="aiTranslationApplyMode"
      :apply-target="aiTranslationApplyTarget"
      :message="aiTranslationSessionMessage"
      :selected-task-ids="Array.from(selectedAiTranslationTaskIds)"
      :session="aiTranslationSession"
      :state-on-apply="aiTranslationStateOnApply"
      :state-options="stateOptions"
      :update-state-on-apply="updateAiTranslationStateOnApply"
      @apply-selected="applySelectedAiTranslationResults"
      @close="closeAiTranslationSessionDialog"
      @discard="discardAiTranslationSession"
      @select-all="selectAllAiTranslationResults"
      @toggle-task="toggleAiTranslationTaskSelection"
      @update-apply-mode="aiTranslationApplyMode = $event"
      @update-apply-target="aiTranslationApplyTarget = $event"
      @update-state-on-apply-value="aiTranslationStateOnApply = $event"
      @update-state-on-apply="updateAiTranslationStateOnApply = $event"
    />

    <BulkStateDialog
      v-if="isBulkStateDialogOpen"
      v-model="bulkStateValue"
      :selected-count="selectedRowCount"
      :state-options="stateOptions"
      @close="closeBulkStateDialog"
      @confirm="confirmBulkStateChange"
    />

    <BulkColumnDialog
      v-if="isBulkColumnDialogOpen"
      v-model:column="bulkColumnKey"
      v-model:value="bulkColumnValue"
      :columns="bulkEditableColumns"
      :selected-count="selectedRowCount"
      @close="closeBulkColumnDialog"
      @confirm="confirmBulkColumnChange"
    />

    <ExcelImportDialog
      v-if="isExcelImportDialogOpen"
      v-model:path="excelImportPath"
      v-model:start-row="excelImportStartRow"
      v-model:title-column="excelImportTitleColumn"
      v-model:original-column="excelImportOriginalColumn"
      v-model:translated-column="excelImportTranslatedColumn"
      v-model:note-column="excelImportNoteColumn"
      v-model:ai-output-column="excelImportAiOutputColumn"
      v-model:state-column="excelImportStateColumn"
      v-model:file-name-mode="excelImportFileNameMode"
      v-model:file-name-column="excelImportFileNameColumn"
      v-model:append-rows="excelImportAppendRows"
      :can-import="canImportExcel"
      :is-error="errorMessage !== ''"
      :is-importing="isImportingExcel"
      :message="displayedMessage"
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
      :is-error="errorMessage !== ''"
      :is-exporting="isExportingExcel"
      :message="displayedMessage"
      :row-count="rows.length"
      @browse="browseExcelExportPath"
      @close="closeExcelExportDialog"
      @confirm="confirmExcelExport"
    />

    <SrtImportDialog
      v-if="isSrtImportDialogOpen"
      v-model:path="srtImportPath"
      v-model:append-rows="srtImportAppendRows"
      :can-import="canImportSrt"
      :is-error="errorMessage !== ''"
      :is-importing="isImportingSrt"
      :message="displayedMessage"
      @browse="browseSrtImportPath"
      @close="closeSrtImportDialog"
      @confirm="confirmSrtImport"
    />

    <SrtExportDialog
      v-if="isSrtExportDialogOpen"
      v-model:path="srtExportPath"
      v-model:encoding="srtExportEncoding"
      v-model:bilingual="srtExportBilingual"
      v-model:filtered-only="srtExportFilteredOnly"
      :can-export="canExportSrt"
      :is-error="errorMessage !== ''"
      :is-exporting="isExportingSrt"
      :message="displayedMessage"
      :row-count="rows.length"
      @browse="browseSrtExportPath"
      @close="closeSrtExportDialog"
      @confirm="confirmSrtExport"
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

.app-shell.top-panel-hidden {
  gap: 6px;
  padding-top: 6px;
}

.app-shell .compact-top-bar {
  display: grid;
  grid-template-columns: max-content minmax(120px, 1fr) max-content minmax(120px, 0.8fr);
  gap: 8px;
  align-items: center;
  min-height: 28px;
  min-width: 0;
}

.app-shell .top-panel-toggle {
  align-self: flex-end;
  min-height: 24px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 3px 8px;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.2;
  white-space: nowrap;
}

.app-shell .top-panel-toggle:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--control-hover-bg);
}

.app-shell .compact-file-path,
.app-shell .compact-message {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-shell .compact-file-path,
.app-shell .compact-result-count {
  color: var(--muted);
  font-size: 11px;
}

.app-shell .compact-result-count {
  white-space: nowrap;
}

.app-shell .compact-message {
  min-height: 24px;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 3px 7px;
  font-size: 11px;
  line-height: 1.25;
}

.app-shell .compact-message.empty {
  border-color: var(--info-border);
  color: transparent;
  background: var(--info-bg);
}

.app-shell .search-overlay-backdrop {
  position: fixed;
  inset: 0;
  z-index: 35;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgb(15 23 42 / 45%);
}

.app-shell .search-overlay-stack {
  display: grid;
  width: min(1120px, 100%);
  max-height: calc(100vh - 24px);
  gap: 8px;
}

.app-shell .search-overlay-panel {
  position: relative;
  max-height: calc(100vh - 60px);
  overflow: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 12px 12px;
  color: var(--text);
  background: var(--panel-bg);
  box-shadow: 0 18px 45px rgb(15 23 42 / 24%);
}

.app-shell.theme-dark .search-overlay-panel {
  border-color: #475569;
  background: #111827;
  box-shadow: 0 18px 60px rgb(0 0 0 / 42%);
}

.app-shell .search-overlay-close {
  justify-self: end;
  width: 24px;
  height: 24px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 16px;
  line-height: 1;
}

.app-shell .search-overlay-close:hover {
  border-color: var(--danger);
  color: var(--danger);
  background: var(--danger-bg-soft);
}

.app-shell .search-overlay-panel .search-panel {
  padding-right: 28px;
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
  width: 86px;
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

.message-tools-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  grid-column: 1 / -1;
  min-width: 0;
}

.message-slot {
  margin: 0;
  min-height: 29px;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 12px;
  line-height: 1.25;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.message-slot.empty {
  visibility: hidden;
}

.error-message {
  border-color: var(--danger-border-soft);
  color: var(--danger-text-soft);
  background: var(--danger-bg-soft);
}

.status-message {
  border-color: var(--info-border);
  color: var(--info-text);
  background: var(--info-bg);
}

.dialog-inline-message {
  margin: 0 0 12px;
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

.search-panel {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.search-summary-row {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) max-content auto;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.filter-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.filter-group-label {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 11px;
  font-weight: 750;
  white-space: nowrap;
}

.text-search-group input[type="search"] {
  min-width: 150px;
  flex: 1 1 190px;
}

.text-search-group select {
  width: 112px;
}

.length-filter-group select {
  width: 118px;
}

.length-filter-group input {
  width: 54px;
}

.filter-group input,
.filter-group select {
  min-height: 30px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 5px 8px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-size: 13px;
}

.filter-group input:focus,
.filter-group select:focus {
  outline: 2px solid var(--primary);
  outline-offset: -1px;
}

.range-separator {
  color: var(--text-soft);
  font-size: 12px;
}

.result-count {
  justify-self: end;
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
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 6px;
  align-items: start;
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

.reset-search-btn {
  min-height: 30px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 5px 10px;
  color: var(--text-soft);
  background: var(--panel-bg);
  font-size: 12px;
  white-space: nowrap;
}

.reset-search-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--control-hover-bg);
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

.go-to-row,
.row-range-filter {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-soft);
  font-size: 12px;
  white-space: nowrap;
}

.go-to-row input,
.row-range-filter input {
  width: 72px;
  min-height: 28px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 4px 6px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-size: 12px;
}

.go-to-row input:focus,
.row-range-filter input:focus {
  outline: 2px solid var(--primary);
  outline-offset: -1px;
}

.go-to-row button,
.row-range-filter button {
  min-height: 28px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 4px 10px;
  color: var(--button-text);
  background: var(--button-bg);
  font-size: 12px;
}

.row-range-filter button:disabled {
  color: var(--muted);
  background: var(--disabled-bg);
  cursor: not-allowed;
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
.export-excel-dialog input[type="text"],
.export-excel-dialog select {
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
.export-excel-dialog input[type="text"]:focus,
.export-excel-dialog select:focus {
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

.srt-select-field {
  display: grid;
  gap: 4px;
  margin-top: 12px;
  color: var(--text-soft);
  font-size: 12px;
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

.excel-import-dialog > .append-option {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 12px 0 0;
  white-space: nowrap;
}

.excel-import-dialog > .append-option input {
  flex: 0 0 auto;
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
  .message-tools-row {
    grid-template-columns: 1fr;
  }

  .top-panel {
    grid-template-columns: 1fr;
  }

  .search-summary-row {
    grid-template-columns: 1fr;
  }

  .filter-group {
    flex-wrap: wrap;
  }

  .result-count {
    justify-self: start;
  }

  .stats-panel {
    grid-template-columns: 1fr;
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

.header-cell.table-end-spacer {
  min-height: 58px;
  padding: 0;
  pointer-events: none;
}

.header-content {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  cursor: grab;
}

.header-content:active {
  cursor: grabbing;
}

.header-content.reordering {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
  border-radius: 6px;
  color: var(--text);
  background: color-mix(in srgb, var(--primary) 20%, var(--header-bg));
  box-shadow: inset 0 0 0 1px var(--primary);
}

.header-cell.drop-target {
  color: var(--text);
  background: color-mix(in srgb, var(--success) 18%, var(--header-bg));
  box-shadow: inset 0 0 0 2px var(--success);
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
  border-right-color: transparent;
}

.table-end-spacer {
  min-height: 42px;
  background: var(--panel-bg);
  pointer-events: none;
  user-select: none;
}

.header-row .table-end-spacer {
  background: var(--header-bg);
}

.row-number-cell {
  display: grid;
  grid-template-columns: auto auto 1fr;
  align-items: flex-start;
  gap: 6px;
  padding: 9px 10px;
  color: var(--muted);
  cursor: pointer;
  font-size: 13px;
  line-height: 1.45;
  font-variant-numeric: tabular-nums;
  user-select: none;
  -webkit-user-select: none;
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
  box-sizing: border-box;
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
  width: auto;
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
  outline: none;
  box-shadow: inset 0 0 0 2px var(--primary);
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
