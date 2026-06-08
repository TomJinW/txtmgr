<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
  confirm,
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { setTheme as setAppTheme } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readFile, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import {
  cjkFallbackOptions,
  draftStorageKey as sentenceDraftStorageKey,
  encodingExcelExportScopeStorageKey,
  encodingTextExportScopeStorageKey,
  maxHistorySteps,
} from "./constants";
import { parseClipboardTable } from "./clipboardTable";
import {
  currentLanguage,
  normalizeAppLanguage,
  setAppLanguage,
  t,
  type AppLanguage,
} from "./i18n";
import { shortcutMatches, windowsShortcutMatches, type ShortcutAction } from "./shortcuts";
import {
  buildEncodingXlsxWorkbook,
  ensureXlsxExtension,
  excelCellText,
  optionalPositiveInteger,
  readXlsxWorkbook,
  requiredPositiveInteger,
} from "./excel";
import CharacterStatsDialog from "./components/CharacterStatsDialog.vue";
import BulkColumnDialog, { type BulkEditableColumn } from "./components/BulkColumnDialog.vue";
import EncodingCodeShiftDialog, {
  type CodeShiftBase,
  type CodeShiftOperation,
} from "./components/EncodingCodeShiftDialog.vue";
import EncodingLineLengthDialog, {
  type LineLengthBracketTokenType,
  type LineLengthCharacterType,
  type LineLengthScope,
  type LineLengthWidthRule,
} from "./components/EncodingLineLengthDialog.vue";
import EncodingExcelImportDialog from "./components/EncodingExcelImportDialog.vue";
import EncodingExcelExportDialog from "./components/EncodingExcelExportDialog.vue";
import EncodingExportDialog from "./components/EncodingExportDialog.vue";
import EncodingImportDialog from "./components/EncodingImportDialog.vue";
import EncodingSearchControls from "./components/EncodingSearchControls.vue";
import FindReplaceBar, {
  type FindReplaceColumn,
  type FindReplaceScope,
} from "./components/FindReplaceBar.vue";
import GoToRowDialog from "./components/GoToRowDialog.vue";
import InsertRowsDialog from "./components/InsertRowsDialog.vue";
import LanguageDialog from "./components/LanguageDialog.vue";
import type {
  CjkFallbackMode,
  EncodingRow,
  ExportScope,
  SentenceRow,
  StoredDraft,
  ThemeMode,
} from "./types";

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

type CoverageCharacterType =
  | "western"
  | "han"
  | "kana"
  | "hangul"
  | "fullwidth_letters"
  | "fullwidth"
  | "halfwidth"
  | "token"
  | "other";

type CoverageBracketTokenType = "square" | "curly" | "angle";

type SentenceCoverageRow = {
  index: number;
  translated_text: string;
};

type SentenceCoverageSource = {
  all?: SentenceCoverageRow[];
  filtered?: SentenceCoverageRow[];
  selected?: SentenceCoverageRow[];
};

type EncodingTableSnapshot = {
  jsonPath: string;
  rows: EncodingRow[];
};

const draftStorageKey = "txtmgr.encodingRows.v1";
const columnWidthStorageKey = "txtmgr.encodingColumnWidths.v3";
const columnFontSizeStorageKey = "txtmgr.encodingColumnFontSizes.v1";
const columnOrderStorageKey = "txtmgr.encodingColumnOrder.v1";
const fallbackStorageKey = "txtmgr.encodingFallback.v2";
const bulkColumnStorageKey = "txtmgr.encodingBulkColumnKey.v1";
const topPanelVisibleStorageKey = "txtmgr.encodingTopPanelVisible.v1";
const themeStorageKey = "txtmgr.theme.v1";
const defaultColumnWidths = [112, 105, 112, 76, 200];
const defaultColumnFontSizes = [10, 14, 14, 14, 14];
const minColumnWidths = [108, 64, 72, 56, 100];
const estimatedRowHeight = 42;
const virtualOverscanRows = 12;
const filterOptions: EncodingFilter[] = [
  "duplicate_character",
  "duplicate_code",
  "empty_character",
  "empty_code",
  "punctuation",
  "han",
  "kana",
  "hangul",
  "latin",
  "special",
];
const columns = [
  { key: "row_number", label: "#" },
  { key: "original_char", label: "char" },
  { key: "code", label: "code" },
  { key: "width", label: "width" },
  { key: "note", label: "note" },
] as const;
type EncodingColumnKey = (typeof columns)[number]["key"];
const searchableColumns: (keyof EncodingRow)[] = [
  "original_char",
  "code",
  "width",
  "note",
];

const rows = ref<EncodingRow[]>([]);
const jsonPath = ref("");
const undoStack = ref<string[]>([]);
const redoStack = ref<string[]>([]);
const columnWidths = ref(restoreColumnWidths());
const columnFontSizes = ref(restoreColumnFontSizes());
const columnOrder = ref<EncodingColumnKey[]>(restoreColumnOrder());
const fallbackPrefs = ref(restoreFallbackPrefs());
const themeMode = ref<ThemeMode>(restoreThemeMode());
const isTopPanelVisible = ref(restoreTopPanelVisible());
const searchText = ref("");
const isCaseSensitiveSearch = ref(false);
const selectedSearchColumns = ref<(keyof EncodingRow)[]>([...searchableColumns]);
const activeFilters = ref<EncodingFilter[]>([]);
const selectedRowIds = ref<Set<number>>(new Set());
const selectionAnchorRowId = ref<number | null>(null);
type TableInteractionMode = "edit" | "select";
type EncodingTableCell = { columnKey: keyof EncodingRow; rowIndex: number };
const tableInteractionMode = ref<TableInteractionMode>("edit");
const selectedTableCells = ref<Set<string>>(new Set());
const activeTableCell = ref<EncodingTableCell | null>(null);
const tableCellSelectionAnchor = ref<EncodingTableCell | null>(null);
const editingTableCell = ref<EncodingTableCell | null>(null);
const isTableKeyboardActive = ref(false);
const isDraggingTableCellSelection = ref(false);
const isDiscontiguousCellClickSelectionEnabled = false;
const focusedPasteCell = ref<{ columnKey: keyof EncodingRow; rowIndex: number } | null>(null);
let tableCellAutoScrollFrame: number | undefined;
let tableCellDragPointerX = 0;
let tableCellDragPointerY = 0;
let tableCellAutoScrollStartedAt = 0;
const bulkEditableColumns: { key: BulkEditableColumn; label: string }[] = [
  { key: "original_char", label: "char" },
  { key: "code", label: "code" },
  { key: "width", label: "width" },
  { key: "note", label: "note" },
];
const bulkColumnKey = ref<BulkEditableColumn>(restoreBulkColumnKey());
const bulkColumnValue = ref("");
const codeShiftColumn = ref<keyof EncodingRow>("code");
const codeShiftOperation = ref<CodeShiftOperation>("add");
const codeShiftBase = ref<CodeShiftBase>("hex");
const codeShiftXValue = ref("0");
const codeShiftYValue = ref("0");
const pendingDeleteIndex = ref<number | null>(null);
const goToRowValue = ref("");
const rowFilterStart = ref("");
const rowFilterEnd = ref("");
const insertRowsTargetRow = ref("1");
const insertRowsCount = ref("1");
const isFindReplaceOpen = ref(false);
const findReplaceQuery = ref("");
const findReplaceReplacement = ref("");
const findReplaceMatchMode = ref<"contains" | "exact">("contains");
const isFindReplaceCaseSensitive = ref(false);
const findReplaceScope = ref<FindReplaceScope>("filtered");
const findReplaceColumns = ref<(keyof EncodingRow)[]>([...searchableColumns]);
const currentFindMatchIndex = ref(0);
const isGoToRowDialogOpen = ref(false);
const isInsertRowsDialogOpen = ref(false);
const isBulkColumnDialogOpen = ref(false);
const isCodeShiftDialogOpen = ref(false);
const isUnmappedCharactersDialogOpen = ref(false);
const isUnusedEncodingsDialogOpen = ref(false);
const isLineLengthDialogOpen = ref(false);
const isLanguageDialogOpen = ref(false);
const isSearchOverlayOpen = ref(false);
const isImportDialogOpen = ref(false);
const isImportingText = ref(false);
const isSavingJson = ref(false);
const importPath = ref("");
const importDirection = ref<"code_char" | "char_code">("code_char");
const importFileEncoding = ref<"auto" | "utf8" | "utf16le">("auto");
const importAppendRows = ref(false);
const isExcelImportDialogOpen = ref(false);
const isImportingExcel = ref(false);
const excelImportPath = ref("");
const excelImportStartRow = ref(2);
const excelImportCharColumn = ref("2");
const excelImportCodeColumn = ref("3");
const excelImportWidthColumn = ref("");
const excelImportNoteColumn = ref("");
const excelImportAppendRows = ref(false);
const isExportDialogOpen = ref(false);
const isExportingText = ref(false);
const exportPath = ref("");
const exportScope = ref<ExportScope>(restoreExportScope(encodingTextExportScopeStorageKey));
const exportExtension = ref<"txt" | "tbl">("txt");
const exportDirection = ref<"code_char" | "char_code">("code_char");
const exportNewline = ref<"crlf" | "lf">("crlf");
const exportFileEncoding = ref<"utf8" | "utf16le">("utf8");
const isExcelExportDialogOpen = ref(false);
const isExportingExcel = ref(false);
const excelExportPath = ref("");
const excelExportScope = ref<ExportScope>(restoreExportScope(encodingExcelExportScopeStorageKey));
const isCharacterStatsDialogOpen = ref(false);
const characterStatsScope = ref<"all" | "filtered" | "selected">("filtered");
const characterStatsTextScope = ref<"all" | "filtered" | "selected">("filtered");
const characterStatsIncludeAll = ref(true);
const characterStatsTypes = ref<CoverageCharacterType[]>([]);
const characterStatsSortOrder = ref<"desc" | "asc">("desc");
const characterStatsBracketTokenTypes = ref<CoverageBracketTokenType[]>([
  "square",
  "curly",
  "angle",
]);
const characterStatsIgnoreWhitespace = ref(true);
const isCountingCharacterStats = ref(false);
const characterStatsProgress = ref(0);
const characterStatsResult = ref("");
const characterStatsMessage = ref(t("stats.notCountedYet"));
const unmappedScope = ref<"all" | "filtered" | "selected">("filtered");
const unmappedIncludeAllCharacters = ref(true);
const unmappedCharacterTypes = ref<CoverageCharacterType[]>([]);
const unmappedSortOrder = ref<"desc" | "asc">("asc");
const unmappedBracketTokenTypes = ref<CoverageBracketTokenType[]>([
  "square",
  "curly",
  "angle",
]);
const unmappedIgnoreWhitespace = ref(true);
const isCheckingUnmappedCharacters = ref(false);
const unmappedProgress = ref(0);
const unmappedResult = ref("");
const unmappedMessage = ref(t("message.notCheckedYet"));
const unmappedSourceRefreshKey = ref(0);
const unusedEncodingScope = ref<"all" | "filtered" | "selected">("filtered");
const unusedEncodingIncludeAllCharacters = ref(true);
const unusedEncodingCharacterTypes = ref<CoverageCharacterType[]>([]);
const unusedEncodingSortOrder = ref<"desc" | "asc">("asc");
const unusedEncodingBracketTokenTypes = ref<CoverageBracketTokenType[]>([
  "square",
  "curly",
  "angle",
]);
const unusedEncodingIgnoreWhitespace = ref(true);
const isCheckingUnusedEncodings = ref(false);
const unusedEncodingProgress = ref(0);
const unusedEncodingResult = ref("");
const unusedEncodingMessage = ref(t("message.notCheckedYet"));
const unusedEncodingSourceRefreshKey = ref(0);
const lineLengthScope = ref<LineLengthScope>("filtered");
const lineLengthMaxLength = ref(32);
const lineLengthBracketTokenTypes = ref<LineLengthBracketTokenType[]>([
  "square",
  "curly",
  "angle",
]);
const lineLengthWidthRules = ref<Record<LineLengthCharacterType, LineLengthWidthRule>>({
  fullwidth: { fixed: 1, mode: "encoding" },
  fullwidth_letters: { fixed: 1, mode: "encoding" },
  halfwidth: { fixed: 1, mode: "encoding" },
  han: { fixed: 1, mode: "encoding" },
  hangul: { fixed: 1, mode: "encoding" },
  kana: { fixed: 1, mode: "encoding" },
  other: { fixed: 1, mode: "encoding" },
  token: { fixed: 1, mode: "encoding" },
  western: { fixed: 1, mode: "encoding" },
});
const isCheckingLineLength = ref(false);
const lineLengthProgress = ref(0);
const lineLengthResult = ref("");
const lineLengthMessage = ref(t("message.notCheckedYet"));
const lineLengthSourceRefreshKey = ref(0);
const sentenceCoverageSource = ref<SentenceCoverageSource>({
  all: [],
  filtered: [],
  selected: [],
});

// Encoding checks depend on main-window translated_text. The backend store is
// preferred, and old localStorage reading remains only as a compatibility path.
const statusMessage = ref("");
const errorMessage = ref("");
const messageTimestamp = ref(formatMessageTimestamp());
const tableWrap = ref<HTMLElement | null>(null);
const topSearchControls = ref<InstanceType<typeof EncodingSearchControls> | null>(null);
const overlaySearchControls = ref<InstanceType<typeof EncodingSearchControls> | null>(null);
const tableScrollTop = ref(0);
const tableViewportHeight = ref(600);
const rowHeights = ref<Record<number, number>>({});
let nextRowIdentity = 1;
let autoSaveTimer: number | undefined;
let columnWidthSaveTimer: number | undefined;
let unlistenEncodingReadJson: UnlistenFn | undefined;
let unlistenEncodingSaveJson: UnlistenFn | undefined;
let unlistenEncodingSaveJsonAs: UnlistenFn | undefined;
let unlistenEncodingOpenSearchPanel: UnlistenFn | undefined;
let unlistenEncodingOpenFindReplace: UnlistenFn | undefined;
let unlistenEncodingImport: UnlistenFn | undefined;
let unlistenEncodingImportExcel: UnlistenFn | undefined;
let unlistenEncodingExport: UnlistenFn | undefined;
let unlistenEncodingExportExcel: UnlistenFn | undefined;
let unlistenEncodingOpenCharacterStats: UnlistenFn | undefined;
let unlistenEncodingOpenUnmappedCharacters: UnlistenFn | undefined;
let unlistenEncodingOpenUnusedEncodings: UnlistenFn | undefined;
let unlistenEncodingOpenLineLength: UnlistenFn | undefined;
let unlistenEncodingOpenGoToRow: UnlistenFn | undefined;
let unlistenEncodingClearList: UnlistenFn | undefined;
let unlistenEncodingDeleteSelected: UnlistenFn | undefined;
let unlistenEncodingCopySelected: UnlistenFn | undefined;
let unlistenEncodingUndoTableChange: UnlistenFn | undefined;
let unlistenEncodingRedoTableChange: UnlistenFn | undefined;
let unlistenEncodingSelectAllFiltered: UnlistenFn | undefined;
let unlistenEncodingDeselectAllRows: UnlistenFn | undefined;
let unlistenEncodingBulkColumn: UnlistenFn | undefined;
let unlistenEncodingCodeShift: UnlistenFn | undefined;
let unlistenEncodingInsertRows: UnlistenFn | undefined;
let unlistenEncodingToggleTopPanel: UnlistenFn | undefined;
let unlistenEncodingToggleTableMode: UnlistenFn | undefined;
let unlistenSetLanguage: UnlistenFn | undefined;
let unlistenOpenLanguageDialog: UnlistenFn | undefined;
const rowResizeObservers = new Map<number, ResizeObserver>();
const rowElements = new Map<number, HTMLElement>();

// Encoding rows are edited in place; WeakMap identities let selection survive
// edits without adding internal ids to user-exported JSON/TBL data.
const rowIdentities = new WeakMap<EncodingRow, number>();
const appWindow = getCurrentWindow();
const systemThemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
const systemThemeMode = ref<"light" | "dark">(getSystemThemeMode());
const tableEndSpacerWidth = 24;
let filterCountRefreshFrame: number | undefined;
let filterCountRefreshRun = 0;
let columnDragTimer: number | undefined;
let draggedColumnKey: EncodingColumnKey | null = null;
let activeColumnDragElement: HTMLElement | null = null;
let lastColumnPointerX = 0;
let lastColumnPointerY = 0;
const columnDropTargetKey = ref<EncodingColumnKey | null>(null);

const effectiveThemeMode = computed<"light" | "dark">(() =>
  themeMode.value === "system" ? systemThemeMode.value : themeMode.value,
);

const canUndoTableChange = computed(() => undoStack.value.length > 0);
const canRedoTableChange = computed(() => redoStack.value.length > 0);

const appShellClasses = computed(() => [
  `theme-${effectiveThemeMode.value}`,
  { "top-panel-hidden": !isTopPanelVisible.value },
  { "platform-linux": isLinuxPlatform() },
  { "table-select-mode": tableInteractionMode.value === "select" },
]);

const displayedColumns = computed(() =>
  columnOrder.value
    .map((key) => columns.find((column) => column.key === key))
    .filter((column): column is (typeof columns)[number] => column !== undefined),
);

const selectableTableColumns = computed(() =>
  displayedColumns.value
    .filter((column) => column.key !== "row_number")
    .map((column) => column.key as keyof EncodingRow),
);

const gridTemplateColumns = computed(() =>
  [
    ...displayedColumns.value.map(
      (column) => `${columnWidths.value[columnIndexByKey(column.key)]}px`,
    ),
    `${tableEndSpacerWidth}px`,
  ].join(" "),
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

const duplicateCharacterIds = computed(() => {
  const groups = new Map<string, number[]>();
  rows.value.forEach((row) => {
    const character = row.original_char.trim();
    if (character === "") return;
    groups.set(character, [...(groups.get(character) ?? []), getRowIdentity(row)]);
  });

  return new Set(
    Array.from(groups.values())
      .filter((ids) => ids.length > 1)
      .flat(),
  );
});

const filteredRows = computed(() => {
  const query = normalizeSearchValue(searchText.value.trim());

  // Search text, category filters, and row range are conjunctive. Individual
  // category buttons remain a union inside activeFilters.
  return rows.value
    .map((row, index) => ({ row, index }))
    .filter(({ row, index }) => {
      const textMatches = rowMatchesSearch(row, query);
      const filterMatches =
        activeFilters.value.length === 0 ||
        activeFilters.value.some((filter) => rowMatchesFilter(row, filter));

      return textMatches && filterMatches && rowMatchesRowRange(index);
    });
});

type EncodingFindReplaceMatch = {
  columnKey: keyof EncodingRow;
  filteredIndex: number;
  row: EncodingRow;
  rowIndex: number;
};

const availableFindReplaceColumns = computed<FindReplaceColumn[]>(() => {
  const visibleKeys = new Set(displayedColumns.value.map((column) => column.key));
  return columns
    .filter(
      (column): column is Extract<(typeof columns)[number], { key: keyof EncodingRow }> =>
        column.key !== "row_number" && visibleKeys.has(column.key),
    )
    .map((column) => ({ key: column.key, label: column.label }));
});

const findReplaceMatches = computed<EncodingFindReplaceMatch[]>(() => {
  const query = findReplaceQuery.value;
  if (query === "" || findReplaceColumns.value.length === 0) return [];

  const activeColumns = findReplaceColumns.value.filter((columnKey) =>
    availableFindReplaceColumns.value.some((column) => column.key === columnKey),
  );
  if (activeColumns.length === 0) return [];

  const matches: EncodingFindReplaceMatch[] = [];
  filteredRows.value.forEach(({ row, index }, filteredIndex) => {
    const rowId = getRowIdentity(row);
    if (
      findReplaceScope.value === "selectedRows" &&
      !selectedRowIds.value.has(rowId)
    ) {
      return;
    }

    for (const columnKey of activeColumns) {
      if (
        findReplaceScope.value === "selectedCells" &&
        !selectedTableCells.value.has(tableCellKey(index, columnKey))
      ) {
        continue;
      }

      if (findReplaceCellMatches(row[columnKey], query)) {
        matches.push({ columnKey, filteredIndex, row, rowIndex: index });
      }
    }
  });

  return matches;
});

const currentFindReplaceMatch = computed(
  () => findReplaceMatches.value[currentFindMatchIndex.value] ?? null,
);

const hasActiveRowFilter = computed(
  () =>
    String(rowFilterStart.value).trim() !== "" ||
    String(rowFilterEnd.value).trim() !== "",
);

// The encoding table is narrow but can still contain thousands of rows; keep
// only the visible slice mounted and use measured row heights for notes.
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
  const query = normalizeSearchValue(searchText.value.trim());
  return rows.value
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => rowMatchesSearch(row, query));
});

const filterCounts = ref(emptyEncodingFilterCounts());

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

const characterStatsRowCount = computed(() => encodingRowsForCharacterStats().length);
const characterStatsTextRowCount = computed(() => textRowsForCharacterStats().length);
const unmappedRowCount = computed(() => sentenceRowsForUnmappedCheck().length);
const unusedEncodingTextRowCount = computed(() => sentenceRowsForUnusedEncodingCheck().length);
const lineLengthRowCount = computed(() => sentenceRowsForLineLengthCheck().length);

const exportRowCount = computed(() =>
  rowsForTextExport().length,
);

const canExportText = computed(
  () =>
    exportPath.value.trim() !== "" &&
    exportRowCount.value > 0 &&
    !isExportingText.value,
);

const canImportText = computed(
  () => importPath.value.trim() !== "" && !isImportingText.value,
);

const canImportExcel = computed(
  () =>
    excelImportPath.value.trim() !== "" &&
    String(excelImportCharColumn.value).trim() !== "" &&
    String(excelImportCodeColumn.value).trim() !== "" &&
    !isImportingExcel.value,
);

const canSaveJson = computed(() => rows.value.length > 0 && !isSavingJson.value);

const excelExportRowCount = computed(() =>
  rowsForExcelExport().length,
);

const canExportExcel = computed(
  () =>
    excelExportPath.value.trim() !== "" &&
    excelExportRowCount.value > 0 &&
    !isExportingExcel.value,
);

const displayedMessage = computed(() => {
  const message = errorMessage.value || statusMessage.value;
  return message ? `${message} ${messageTimestamp.value}` : "";
});

const displayedJsonPath = computed(() => {
  if (jsonPath.value) return jsonPath.value;
  return rows.value.length > 0 ? t("main.noJsonSavePath") : t("main.noJsonFileLoaded");
});

watch(
  rows,
  () => {
    queuePersistRows();
    queueRefreshFilterCounts();
    pruneSelectedRows();
  },
  { deep: true },
);

watch(
  () => rows.value.length,
  async () => {
    await nextTick();
    updateTableViewport();
  },
);

watch(
  () => [canUndoTableChange.value, canRedoTableChange.value],
  () => {
    syncHistoryMenuState();
  },
  { immediate: true },
);

watch(availableFindReplaceColumns, (availableColumns) => {
  const availableKeys = new Set(availableColumns.map((column) => column.key));
  const nextColumns = findReplaceColumns.value.filter((column) => availableKeys.has(column));
  findReplaceColumns.value =
    nextColumns.length > 0
      ? nextColumns
      : availableColumns.map((column) => column.key as keyof EncodingRow);
});

watch(jsonPath, () => {
  queuePersistRows();
});

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
  void syncNativeChrome();
});

watch(bulkColumnKey, () => {
  persistBulkColumnKey();
});

watch(exportScope, () => {
  persistExportScope(encodingTextExportScopeStorageKey, exportScope.value);
});

watch(excelExportScope, () => {
  persistExportScope(encodingExcelExportScopeStorageKey, excelExportScope.value);
});

watch(isTopPanelVisible, () => {
  window.localStorage.setItem(topPanelVisibleStorageKey, String(isTopPanelVisible.value));
  nextTick(() => {
    updateTableViewport();
  });
});

watch(currentLanguage, () => {
  refreshDefaultCheckMessages();
  syncAppLanguageMenu();
});

window.requestAnimationFrame(() => {
  void restoreEncodingDraft();
});

watch([errorMessage, statusMessage], ([error, status]) => {
  messageTimestamp.value = error || status ? formatMessageTimestamp() : "";
});

watch(
  () => [
    searchText.value,
    String(isCaseSensitiveSearch.value),
    activeFilters.value.join("|"),
    selectedSearchColumns.value.join("|"),
    rowFilterStart.value,
    rowFilterEnd.value,
  ],
  async () => {
    tableScrollTop.value = 0;
    if (tableWrap.value) {
      tableWrap.value.scrollTop = 0;
    }
    queueRefreshFilterCounts();
    await nextTick();
    updateTableViewport();
  },
);

watch(findReplaceMatches, (matches) => {
  if (matches.length === 0) {
    currentFindMatchIndex.value = 0;
    return;
  }
  if (currentFindMatchIndex.value >= matches.length) {
    currentFindMatchIndex.value = matches.length - 1;
  }
});

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

watch(
  () => displayedColumns.value.map((column) => column.key).join("|"),
  () => {
    clearTableCellSelection();
  },
);

watch(
  () => filteredRows.value.map(({ index }) => index).join("|"),
  () => {
    clearTableCellSelection();
  },
);

registerMenuListeners();
void syncNativeChrome();
if (isMacPlatform()) {
  window.addEventListener("focus", handleWindowFocus);
}
window.addEventListener("keydown", handleGlobalShortcut);
window.addEventListener("keydown", handleWindowsMenuShortcut);
window.addEventListener("pointerdown", handleWindowPointerDownForTableKeyboard, true);
window.addEventListener("mousemove", handleWindowTableCellDragMouseMove);
window.addEventListener("mouseup", endTableCellDragSelection);
systemThemeQuery.addEventListener("change", handleSystemThemeChange);

onBeforeUnmount(() => {
  cancelColumnReorder();
  window.clearTimeout(autoSaveTimer);
  window.clearTimeout(columnWidthSaveTimer);
  if (filterCountRefreshFrame !== undefined) {
    window.cancelAnimationFrame(filterCountRefreshFrame);
  }
  unlistenEncodingReadJson?.();
  unlistenEncodingSaveJson?.();
  unlistenEncodingSaveJsonAs?.();
  unlistenEncodingOpenSearchPanel?.();
  unlistenEncodingOpenFindReplace?.();
  unlistenEncodingImport?.();
  unlistenEncodingImportExcel?.();
  unlistenEncodingExport?.();
  unlistenEncodingExportExcel?.();
  unlistenEncodingOpenCharacterStats?.();
  unlistenEncodingOpenUnmappedCharacters?.();
  unlistenEncodingOpenUnusedEncodings?.();
  unlistenEncodingOpenLineLength?.();
  unlistenEncodingOpenGoToRow?.();
  unlistenEncodingClearList?.();
  unlistenEncodingDeleteSelected?.();
  unlistenEncodingCopySelected?.();
  unlistenEncodingUndoTableChange?.();
  unlistenEncodingRedoTableChange?.();
  unlistenEncodingSelectAllFiltered?.();
  unlistenEncodingDeselectAllRows?.();
  unlistenEncodingBulkColumn?.();
  unlistenEncodingCodeShift?.();
  unlistenEncodingInsertRows?.();
  unlistenEncodingToggleTopPanel?.();
  unlistenEncodingToggleTableMode?.();
  unlistenSetLanguage?.();
  unlistenOpenLanguageDialog?.();
  if (isMacPlatform()) {
    window.removeEventListener("focus", handleWindowFocus);
  }
  window.removeEventListener("keydown", handleGlobalShortcut);
  window.removeEventListener("pointerdown", handleWindowPointerDownForTableKeyboard, true);
  rowResizeObservers.forEach((observer) => observer.disconnect());
  rowResizeObservers.clear();
rowElements.clear();
window.removeEventListener("keydown", handleWindowsMenuShortcut);
window.removeEventListener("mousemove", handleWindowTableCellDragMouseMove);
window.removeEventListener("mouseup", endTableCellDragSelection);
  stopTableCellDragAutoScroll();
  systemThemeQuery.removeEventListener("change", handleSystemThemeChange);
});

function isWindowsPlatform() {
  return /Windows/i.test(window.navigator.userAgent);
}

function isMacPlatform() {
  return /Macintosh|Mac OS X/i.test(window.navigator.userAgent);
}

function handleWindowFocus() {
  syncAppLanguageMenu();
}

function handleGlobalShortcut(event: KeyboardEvent) {
  if (event.key === "Escape" && editableEventTarget(event.target)) {
    event.preventDefault();
    (event.target as HTMLElement).blur();
    exitTableCellEdit();
    return;
  }

  if (event.key === "Escape" && isSearchOverlayOpen.value) {
    event.preventDefault();
    closeSearchOverlay();
    return;
  }

  if (
    tableInteractionMode.value === "select" &&
    editingTableCell.value &&
    editableEventTarget(event.target)
  ) {
    return;
  }

  if (
    event.key === "Escape" &&
    tableInteractionMode.value === "select" &&
    !hasOpenEncodingDialog() &&
    (selectedTableCells.value.size > 0 || selectedRowIds.value.size > 0)
  ) {
    event.preventDefault();
    deselectAllRows();
    return;
  }

  if (
    tableInteractionMode.value === "select" &&
    !isSearchOverlayOpen.value &&
    !hasOpenEncodingDialog() &&
    !hasActiveEncodingDialogTask() &&
    isTableSelectionKeyboardTarget(event) &&
    handleTableSelectionKeydown(event)
  ) {
    return;
  }

  if (
    (event.key === "t" || event.key === "T") &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !editableEventTarget(event.target)
  ) {
    event.preventDefault();
    toggleTableInteractionMode();
    return;
  }

  if (shortcutMatches(event, "encoding_open_search_panel", isMacPlatform())) {
    event.preventDefault();
    if (hasOpenEncodingDialog()) return;
    openSearchOverlay();
    return;
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

function handleWindowsMenuShortcut(event: KeyboardEvent) {
  if (!isWindowsPlatform()) return;

  const actions: { action: ShortcutAction; run: () => void }[] = [
    { action: "encoding_read_json", run: () => void openJsonFile() },
    { action: "encoding_save_json", run: () => void saveJsonFile() },
    { action: "encoding_save_json_as", run: () => void saveJsonFileAs() },
    { action: "encoding_import", run: () => openImportDialog() },
    { action: "encoding_import_excel", run: () => openExcelImportDialog() },
    { action: "encoding_export", run: () => openExportDialog() },
    { action: "encoding_export_excel", run: () => openExcelExportDialog() },
    { action: "encoding_go_to_row", run: () => openGoToRowDialog() },
    { action: "encoding_open_find_replace", run: () => toggleFindReplaceBar() },
    { action: "encoding_clear_list", run: () => void clearRows() },
    { action: "encoding_delete_selected", run: () => void deleteSelectedRows() },
    { action: "encoding_copy_selected", run: () => void copySelectedRowsForSpreadsheet() },
    { action: "encoding_select_all_filtered", run: () => selectAllFilteredRows() },
    { action: "encoding_deselect_all_rows", run: () => deselectAllRows() },
    { action: "encoding_insert_rows", run: () => openInsertRowsDialog("end") },
    { action: "encoding_bulk_change_column", run: () => openBulkColumnDialog() },
    { action: "encoding_code_shift", run: () => openCodeShiftDialog() },
    { action: "encoding_toggle_top_panel", run: () => toggleTopPanel() },
    { action: "encoding_character_stats", run: () => void openCharacterStatsDialog() },
    { action: "encoding_unmapped_characters", run: () => void openUnmappedCharactersDialog() },
    { action: "encoding_unused_encodings", run: () => void openUnusedEncodingsDialog() },
    { action: "encoding_line_length", run: () => void openLineLengthDialog() },
    { action: "encoding_open_language_dialog", run: () => openLanguageDialog() },
    { action: "encoding_language_en", run: () => setAppLanguage("en") },
    { action: "encoding_language_zh_hans", run: () => setAppLanguage("zh-Hans") },
  ];

  const match = actions.find(({ action }) => windowsShortcutMatches(event, action));
  if (match) {
    event.preventDefault();
    match.run();
  }
}

function registerMenuListeners() {
  listen("encoding-read-json", () => {
    void openJsonFile();
  })
    .then((unlisten) => {
      unlistenEncodingReadJson = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding read JSON menu listener.", error);
    });

  listen("encoding-save-json", () => {
    void saveJsonFile();
  })
    .then((unlisten) => {
      unlistenEncodingSaveJson = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding save JSON menu listener.", error);
    });

  listen("encoding-save-json-as", () => {
    void saveJsonFileAs();
  })
    .then((unlisten) => {
      unlistenEncodingSaveJsonAs = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding save JSON as menu listener.", error);
    });

  listen("encoding-open-search-panel", () => {
    if (hasOpenEncodingDialog()) return;
    openSearchOverlay();
  })
    .then((unlisten) => {
      unlistenEncodingOpenSearchPanel = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding search panel menu listener.", error);
    });

  listen("encoding-open-find-replace", () => {
    toggleFindReplaceBar();
  })
    .then((unlisten) => {
      unlistenEncodingOpenFindReplace = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding find replace menu listener.", error);
    });

  listen("encoding-import", () => {
    openImportDialog();
  })
    .then((unlisten) => {
      unlistenEncodingImport = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding import menu listener.", error);
    });

  listen("encoding-import-excel", () => {
    openExcelImportDialog();
  })
    .then((unlisten) => {
      unlistenEncodingImportExcel = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding import Excel menu listener.", error);
    });

  listen("encoding-export", () => {
    openExportDialog();
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

  listen("encoding-copy-selected", () => {
    void copySelectedRowsForSpreadsheet();
  })
    .then((unlisten) => {
      unlistenEncodingCopySelected = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding copy selected menu listener.", error);
    });

  listen("encoding-undo-table-change", () => {
    undoTableChange();
  })
    .then((unlisten) => {
      unlistenEncodingUndoTableChange = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding undo table change menu listener.", error);
    });

  listen("encoding-redo-table-change", () => {
    redoTableChange();
  })
    .then((unlisten) => {
      unlistenEncodingRedoTableChange = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding redo table change menu listener.", error);
    });

  listen("encoding-select-all-filtered", () => {
    selectAllFilteredRows();
  })
    .then((unlisten) => {
      unlistenEncodingSelectAllFiltered = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding select all filtered menu listener.", error);
    });

  listen("encoding-deselect-all-rows", () => {
    deselectAllRows();
  })
    .then((unlisten) => {
      unlistenEncodingDeselectAllRows = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding deselect all rows menu listener.", error);
    });

  listen("encoding-bulk-change-column", () => {
    openBulkColumnDialog();
  })
    .then((unlisten) => {
      unlistenEncodingBulkColumn = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding bulk column menu listener.", error);
    });

  listen("encoding-code-shift", () => {
    openCodeShiftDialog();
  })
    .then((unlisten) => {
      unlistenEncodingCodeShift = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding code shift menu listener.", error);
    });

  listen("encoding-insert-rows", () => {
    openInsertRowsDialog("end");
  })
    .then((unlisten) => {
      unlistenEncodingInsertRows = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding insert rows menu listener.", error);
    });

  listen("encoding-toggle-top-panel", () => {
    toggleTopPanel();
  })
    .then((unlisten) => {
      unlistenEncodingToggleTopPanel = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding top panel menu listener.", error);
    });

  listen("encoding-toggle-table-mode", () => {
    toggleTableInteractionMode();
  })
    .then((unlisten) => {
      unlistenEncodingToggleTableMode = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding table mode menu listener.", error);
    });

  listen("encoding-export-excel", () => {
    openExcelExportDialog();
  })
    .then((unlisten) => {
      unlistenEncodingExportExcel = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding export Excel menu listener.", error);
    });

  listen("encoding-open-character-stats", () => {
    void openCharacterStatsDialog();
  })
    .then((unlisten) => {
      unlistenEncodingOpenCharacterStats = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding character stats menu listener.", error);
    });

  listen("encoding-open-unmapped-characters", () => {
    void openUnmappedCharactersDialog();
  })
    .then((unlisten) => {
      unlistenEncodingOpenUnmappedCharacters = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding unmapped characters menu listener.", error);
    });

  listen("encoding-open-unused-encodings", () => {
    void openUnusedEncodingsDialog();
  })
    .then((unlisten) => {
      unlistenEncodingOpenUnusedEncodings = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding unused encodings menu listener.", error);
    });

  listen("encoding-open-line-length", () => {
    void openLineLengthDialog();
  })
    .then((unlisten) => {
      unlistenEncodingOpenLineLength = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding line length menu listener.", error);
    });

  listen<{ target?: string; language: AppLanguage }>("set-language", (event) => {
    if (event.payload?.target !== "encoding") return;
    setAppLanguage(normalizeAppLanguage(event.payload?.language));
  })
    .then((unlisten) => {
      unlistenSetLanguage = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register language menu listener.", error);
    });

  listen("open-encoding-language-dialog", () => {
    openLanguageDialog();
  })
    .then((unlisten) => {
      unlistenOpenLanguageDialog = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register open language dialog menu listener.", error);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function createTableSnapshot() {
  const snapshot: EncodingTableSnapshot = {
    jsonPath: jsonPath.value,
    rows: rows.value,
  };

  return JSON.stringify(snapshot);
}

function restoreTableSnapshot(snapshot: string) {
  const parsed = JSON.parse(snapshot) as EncodingTableSnapshot;
  rows.value = parsed.rows.map(normalizeEncodingJsonRow);
  jsonPath.value = toText(parsed.jsonPath);
  selectedRowIds.value = new Set();
  selectionAnchorRowId.value = null;
  pendingDeleteIndex.value = null;
  clearTableCellSelection();
  resetVirtualRowState();
}

function pushHistorySnapshot(stack: string[], snapshot: string) {
  if (stack[stack.length - 1] === snapshot) return stack;
  return [...stack, snapshot].slice(-maxHistorySteps);
}

function recordHistoryStep(snapshot = createTableSnapshot()) {
  if (snapshot === createTableSnapshot()) return;
  undoStack.value = pushHistorySnapshot(undoStack.value, snapshot);
  redoStack.value = [];
  syncHistoryMenuState();
}

function recordCurrentStateForUndo() {
  undoStack.value = pushHistorySnapshot(undoStack.value, createTableSnapshot());
  redoStack.value = [];
  syncHistoryMenuState();
}

function undoTableChange() {
  if (!canUndoTableChange.value) return;

  const currentSnapshot = createTableSnapshot();
  const snapshot = undoStack.value[undoStack.value.length - 1];
  undoStack.value = undoStack.value.slice(0, -1);
  redoStack.value = pushHistorySnapshot(redoStack.value, currentSnapshot);
  restoreTableSnapshot(snapshot);
  syncHistoryMenuState();
  statusMessage.value = t("message.undidTableChange");
  errorMessage.value = "";
}

function redoTableChange() {
  if (!canRedoTableChange.value) return;

  const currentSnapshot = createTableSnapshot();
  const snapshot = redoStack.value[redoStack.value.length - 1];
  redoStack.value = redoStack.value.slice(0, -1);
  undoStack.value = pushHistorySnapshot(undoStack.value, currentSnapshot);
  restoreTableSnapshot(snapshot);
  syncHistoryMenuState();
  statusMessage.value = t("message.redidTableChange");
  errorMessage.value = "";
}

function addRowAfter(rowIndex: number) {
  recordCurrentStateForUndo();
  rows.value.splice(rowIndex + 1, 0, createEmptyRow());
  if (pendingDeleteIndex.value !== null && pendingDeleteIndex.value > rowIndex) {
    pendingDeleteIndex.value += 1;
  }
}

function openInsertRowsDialog(position: "start" | "end" = "end") {
  insertRowsTargetRow.value = position === "start" ? "1" : String(rows.value.length + 1);
  insertRowsCount.value = "1";
  openEncodingDialog("insertRows");
}

function closeInsertRowsDialog() {
  isInsertRowsDialogOpen.value = false;
}

function confirmInsertRows() {
  const targetRow = Number.parseInt(insertRowsTargetRow.value, 10);
  const count = Number.parseInt(insertRowsCount.value, 10);
  const maxRow = rows.value.length + 1;
  if (
    !Number.isInteger(targetRow) ||
    !Number.isInteger(count) ||
    targetRow < 1 ||
    targetRow > maxRow ||
    count < 1
  ) {
    errorMessage.value = t("insertRows.invalid");
    statusMessage.value = "";
    return;
  }

  recordCurrentStateForUndo();
  const insertIndex = targetRow - 1;
  rows.value.splice(insertIndex, 0, ...Array.from({ length: count }, createEmptyRow));
  if (pendingDeleteIndex.value !== null && pendingDeleteIndex.value >= insertIndex) {
    pendingDeleteIndex.value += count;
  }
  closeInsertRowsDialog();
  statusMessage.value = `${t("insertRows.inserted")}: ${count}.`;
  errorMessage.value = "";
}

async function pasteClipboardAsTable() {
  const target = activeTableCell.value ?? focusedPasteCell.value;
  if (!target) {
    statusMessage.value = t("message.noPasteTarget");
    errorMessage.value = "";
    return;
  }

  let text = "";
  try {
    if (!navigator.clipboard?.readText) throw new Error(t("message.clipboardReadUnavailable"));
    text = await navigator.clipboard.readText();
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("message.clipboardReadUnavailable");
    statusMessage.value = "";
    return;
  }

  if (text === "") return;

  const table = parseClipboardTable(text);

  const pasteColumns = displayedColumns.value
    .filter((column) => column.key !== "row_number")
    .map((column) => column.key as keyof EncodingRow);
  const startColumnIndex = pasteColumns.indexOf(target.columnKey);
  if (startColumnIndex === -1) {
    statusMessage.value = t("message.noPasteTarget");
    errorMessage.value = "";
    return;
  }

  recordCurrentStateForUndo();
  const requiredRows = target.rowIndex + table.length - rows.value.length;
  if (requiredRows > 0) {
    rows.value.push(...Array.from({ length: requiredRows }, createEmptyRow));
  }

  let changedCount = 0;
  table.forEach((pasteRow, pasteRowOffset) => {
    const targetRow = rows.value[target.rowIndex + pasteRowOffset];
    if (!targetRow) return;

    pasteRow.forEach((value, pasteColumnOffset) => {
      const targetColumn = pasteColumns[startColumnIndex + pasteColumnOffset];
      if (!targetColumn) return;
      targetRow[targetColumn] = targetColumn === "code" ? normalizeCode(value) : value;
      changedCount += 1;
    });
  });

  rows.value = [...rows.value];
  statusMessage.value = `${t("message.pastedCells")}: ${changedCount}.`;
  errorMessage.value = "";
}

async function openJsonFile() {
  const path = await openDialog({
    title: t("encoding.readJson"),
    multiple: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });

  if (typeof path === "string") {
    await loadJsonFromPath(path);
  }
}

async function loadJsonFromPath(path: string) {
  try {
    if (!(await confirmImportOverwrite(t("encoding.readJson")))) return;

    errorMessage.value = "";
    statusMessage.value = "";
    const text = new TextDecoder("utf-8").decode(await readFile(path));
    const parsed = JSON.parse(text) as unknown;
    const importedRows = normalizeEncodingJsonRows(parsed);

    recordCurrentStateForUndo();
    rows.value = importedRows;
    jsonPath.value = path;
    selectedRowIds.value = new Set();
    selectionAnchorRowId.value = null;
    pendingDeleteIndex.value = null;
    resetVirtualRowState();
    statusMessage.value = `${t("message.loadedRows")}: ${importedRows.length} ${t("message.rows")}.`;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("message.failedReadJson");
  }
}

async function saveJsonFile() {
  if (!canSaveJson.value) return;

  if (jsonPath.value.trim() === "") {
    await saveJsonFileAs();
    return;
  }

  errorMessage.value = "";
  statusMessage.value = "";
  isSavingJson.value = true;

  try {
    await writeTextFile(jsonPath.value, serializeJsonRows());
    statusMessage.value = t("message.jsonSaved");
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("message.failedSaveJson");
  } finally {
    isSavingJson.value = false;
  }
}

async function saveJsonFileAs() {
  if (!canSaveJson.value) return;

  errorMessage.value = "";
  statusMessage.value = "";
  isSavingJson.value = true;

  try {
    const path = await saveDialog({
      title: t("encoding.saveJson"),
      defaultPath: jsonPath.value.trim() || defaultJsonSavePath(),
      filters: [{ name: "JSON", extensions: ["json"] }],
    });

    if (!path) return;

    const nextPath = ensureJsonExtension(path);
    await writeTextFile(nextPath, serializeJsonRows());
    jsonPath.value = nextPath;
    statusMessage.value = t("message.jsonSaved");
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("message.failedSaveJson");
  } finally {
    isSavingJson.value = false;
  }
}

function serializeJsonRows() {
  return JSON.stringify(
    rows.value.map((row) => ({
      char: row.original_char,
      code: normalizeCode(row.code),
      width: row.width,
      note: row.note,
    })),
    null,
    2,
  );
}

function normalizeEncodingJsonRows(parsed: unknown) {
  const source = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.rows)
      ? parsed.rows
      : null;

  if (!source) {
    throw new Error(t("message.encodingJsonRootMustBeRows"));
  }

  return source.map(normalizeEncodingJsonRow);
}

function normalizeEncodingJsonRow(item: unknown): EncodingRow {
  const row = isRecord(item) && isRecord(item.Encoding) ? item.Encoding : item;
  if (!isRecord(row)) return createEmptyRow();

  return {
    original_char: toText(row.char || row.original_char),
    code: normalizeCode(toText(row.code)),
    width: toText(row.width),
    note: toText(row.note),
  };
}

function ensureJsonExtension(path: string) {
  return /\.json$/i.test(path) ? path : `${path}.json`;
}

function defaultJsonSavePath() {
  return "encoding-table.json";
}

async function confirmImportOverwrite(title: string) {
  if (rows.value.length === 0) return true;

  return confirm(
    t("message.encodingImportOverwrite"),
    {
      title,
      kind: "warning",
    },
  );
}

type EncodingDialog =
  | "bulkColumn"
  | "codeShift"
  | "characterStats"
  | "excelExport"
  | "excelImport"
  | "exportText"
  | "goToRow"
  | "insertRows"
  | "importText"
  | "language"
  | "lineLength"
  | "unmappedCharacters"
  | "unusedEncodings";

function openEncodingDialog(dialog: EncodingDialog) {
  if (hasActiveEncodingDialogTask()) {
    statusMessage.value = t("message.dialogTaskRunning");
    errorMessage.value = "";
    return false;
  }

  closeSearchOverlay();
  closeEncodingDialogs();
  if (
    dialog === "excelExport" ||
    dialog === "excelImport" ||
    dialog === "exportText" ||
    dialog === "importText"
  ) {
    errorMessage.value = "";
    statusMessage.value = "";
  }

  switch (dialog) {
    case "bulkColumn":
      isBulkColumnDialogOpen.value = true;
      break;
    case "codeShift":
      isCodeShiftDialogOpen.value = true;
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
    case "exportText":
      isExportDialogOpen.value = true;
      break;
    case "goToRow":
      isGoToRowDialogOpen.value = true;
      break;
    case "insertRows":
      isInsertRowsDialogOpen.value = true;
      break;
    case "importText":
      isImportDialogOpen.value = true;
      break;
    case "language":
      isLanguageDialogOpen.value = true;
      break;
    case "lineLength":
      isLineLengthDialogOpen.value = true;
      break;
    case "unmappedCharacters":
      isUnmappedCharactersDialogOpen.value = true;
      break;
    case "unusedEncodings":
      isUnusedEncodingsDialogOpen.value = true;
      break;
  }

  return true;
}

function closeEncodingDialogs() {
  isBulkColumnDialogOpen.value = false;
  isCodeShiftDialogOpen.value = false;
  isCharacterStatsDialogOpen.value = false;
  isExcelExportDialogOpen.value = false;
  isExcelImportDialogOpen.value = false;
  isExportDialogOpen.value = false;
  isGoToRowDialogOpen.value = false;
  isInsertRowsDialogOpen.value = false;
  isImportDialogOpen.value = false;
  isLanguageDialogOpen.value = false;
  isLineLengthDialogOpen.value = false;
  isUnmappedCharactersDialogOpen.value = false;
  isUnusedEncodingsDialogOpen.value = false;
}

function hasOpenEncodingDialog() {
  return (
    isExcelExportDialogOpen.value ||
    isBulkColumnDialogOpen.value ||
    isCodeShiftDialogOpen.value ||
    isCharacterStatsDialogOpen.value ||
    isExcelImportDialogOpen.value ||
    isExportDialogOpen.value ||
    isGoToRowDialogOpen.value ||
    isInsertRowsDialogOpen.value ||
    isImportDialogOpen.value ||
    isLanguageDialogOpen.value ||
    isLineLengthDialogOpen.value ||
    isUnmappedCharactersDialogOpen.value ||
    isUnusedEncodingsDialogOpen.value
  );
}

function hasActiveEncodingDialogTask() {
  return (
    isCheckingUnmappedCharacters.value ||
    isCheckingUnusedEncodings.value ||
    isCountingCharacterStats.value ||
    isCheckingLineLength.value ||
    isExportingExcel.value ||
    isExportingText.value ||
    isImportingExcel.value ||
    isImportingText.value
  );
}

function openImportDialog() {
  openEncodingDialog("importText");
}

function closeImportDialog() {
  isImportDialogOpen.value = false;
}

function openExcelImportDialog() {
  openEncodingDialog("excelImport");
}

function closeExcelImportDialog() {
  isExcelImportDialogOpen.value = false;
}

async function openCharacterStatsDialog() {
  if (!openEncodingDialog("characterStats")) return;
  await refreshSentenceCoverageSource();
}

function closeCharacterStatsDialog() {
  isCharacterStatsDialogOpen.value = false;
}

async function openUnmappedCharactersDialog() {
  if (!openEncodingDialog("unmappedCharacters")) return;
  await refreshSentenceCoverageSource();
}

function closeUnmappedCharactersDialog() {
  isUnmappedCharactersDialogOpen.value = false;
}

async function openUnusedEncodingsDialog() {
  if (!openEncodingDialog("unusedEncodings")) return;
  await refreshSentenceCoverageSource();
}

function closeUnusedEncodingsDialog() {
  isUnusedEncodingsDialogOpen.value = false;
}

async function openLineLengthDialog() {
  if (!openEncodingDialog("lineLength")) return;
  await refreshSentenceCoverageSource();
}

function closeLineLengthDialog() {
  isLineLengthDialogOpen.value = false;
}

function sentenceRowsForUnmappedCheck() {
  void unmappedSourceRefreshKey.value;
  const source = sentenceCoverageSource.value;
  const scopedRows = source[unmappedScope.value];
  if (scopedRows) return scopedRows;
  return source.all ?? [];
}

function sentenceRowsForUnusedEncodingCheck() {
  void unusedEncodingSourceRefreshKey.value;
  const source = sentenceCoverageSource.value;
  const scopedRows = source[unusedEncodingScope.value];
  if (scopedRows) return scopedRows;
  return source.all ?? [];
}

function sentenceRowsForLineLengthCheck() {
  void lineLengthSourceRefreshKey.value;
  const source = sentenceCoverageSource.value;
  const scopedRows = source[lineLengthScope.value];
  if (scopedRows) return scopedRows;
  return source.all ?? [];
}

function encodingRowsForCharacterStats() {
  if (characterStatsScope.value === "filtered") {
    return filteredRows.value.map(({ row }) => row);
  }

  if (characterStatsScope.value === "selected") {
    return rows.value.filter((row) => selectedRowIds.value.has(getRowIdentity(row)));
  }

  return rows.value;
}

function textRowsForCharacterStats() {
  const source = sentenceCoverageSource.value;
  const scopedRows = source[characterStatsTextScope.value];
  if (scopedRows) return scopedRows;
  return source.all ?? [];
}

async function refreshSentenceCoverageSource() {
  const source = await readSentenceCoverageSource();
  sentenceCoverageSource.value = source;
  unmappedSourceRefreshKey.value += 1;
  unusedEncodingSourceRefreshKey.value += 1;
  lineLengthSourceRefreshKey.value += 1;
}

async function readSentenceCoverageSource(): Promise<SentenceCoverageSource> {
  const source = await readBackendSentenceCoverageSource();
  if (source) return source;

  const draftRows = readStoredSentenceRows();
  return {
    all: draftRows,
    filtered: draftRows,
    selected: [],
  };
}

async function readBackendSentenceCoverageSource(): Promise<SentenceCoverageSource | null> {
  try {
    const source = await invoke<Partial<SentenceCoverageSource>>(
      "get_sentence_coverage_source",
    );
    const normalizedSource = {
      all: normalizeSentenceCoverageRows(source.all) ?? [],
      filtered: normalizeSentenceCoverageRows(source.filtered) ?? [],
      selected: normalizeSentenceCoverageRows(source.selected) ?? [],
    };
    if (
      normalizedSource.all.length === 0 &&
      normalizedSource.filtered.length === 0 &&
      normalizedSource.selected.length === 0
    ) {
      return null;
    }
    return normalizedSource;
  } catch (error) {
    console.warn("Failed to read sentence coverage source.", error);
    return null;
  }
}

function readStoredSentenceRows() {
  try {
    // Compatibility fallback for older builds before sentence coverage moved to
    // backend state. Main-window table drafts themselves now live in app data.
    const rawDraft = window.localStorage.getItem(sentenceDraftStorageKey);
    if (!rawDraft) return [];
    const parsed = JSON.parse(rawDraft) as Partial<StoredDraft>;
    if (!Array.isArray(parsed.rows)) return [];
    return parsed.rows.map((row, index) => ({
      index,
      translated_text:
        typeof (row as Partial<SentenceRow>).translated_text === "string"
          ? (row as Partial<SentenceRow>).translated_text ?? ""
          : "",
    }));
  } catch {
    return [];
  }
}

function normalizeSentenceCoverageRows(rowsToNormalize: unknown) {
  if (!Array.isArray(rowsToNormalize)) return undefined;
  return rowsToNormalize.map((row, fallbackIndex) => {
    const item = isRecord(row) ? row : {};
    const index = typeof item.index === "number" ? item.index : fallbackIndex;
    return {
      index,
      translated_text: typeof item.translated_text === "string" ? item.translated_text : "",
    };
  });
}

async function runCharacterStats() {
  if (isCountingCharacterStats.value) return;

  isCountingCharacterStats.value = true;
  characterStatsProgress.value = 0;
  characterStatsMessage.value = t("stats.countingCharacters");
  errorMessage.value = "";
  await nextTick();

  const encodingRows = encodingRowsForCharacterStats();
  const textRows = textRowsForCharacterStats();
  const targetTokens = new Set<string>();
  const counts = new Map<string, number>();

  try {
    for (let rowIndex = 0; rowIndex < encodingRows.length; rowIndex += 1) {
      const row = encodingRows[rowIndex];
      for (const token of encodingCharacterStatsTokens(row.original_char)) {
        targetTokens.add(token);
        counts.set(token, 0);
      }

      if (rowIndex % 240 === 0 || rowIndex === encodingRows.length - 1) {
        characterStatsProgress.value =
          encodingRows.length === 0
            ? 25
            : Math.round(((rowIndex + 1) / encodingRows.length) * 25);
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      }
    }

    for (let rowIndex = 0; rowIndex < textRows.length; rowIndex += 1) {
      const row = textRows[rowIndex];
      for (const token of encodingCharacterStatsTokens(row.translated_text)) {
        if (!targetTokens.has(token)) continue;
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }

      if (rowIndex % 120 === 0 || rowIndex === textRows.length - 1) {
        characterStatsProgress.value =
          textRows.length === 0
            ? 100
            : 25 + Math.round(((rowIndex + 1) / textRows.length) * 75);
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      }
    }

    const sortedRows = Array.from(counts.entries()).sort(([charA, countA], [charB, countB]) => {
      const countDiff =
        characterStatsSortOrder.value === "asc" ? countA - countB : countB - countA;
      return countDiff === 0 ? charA.localeCompare(charB) : countDiff;
    });

    characterStatsResult.value = sortedRows
      .map(([character, count]) => `${displayUnmappedToken(character)}\t${count}`)
      .join("\n");

    characterStatsMessage.value =
      sortedRows.length === 0
        ? `${t("message.noMatchingCharactersFound")}: ${encodingRows.length} ${t("stats.encodingRows")}; ${textRows.length} ${t("stats.textRows")}.`
        : `${t("message.countedItemsFromRows")}: ${sortedRows.length} / ${encodingRows.length} ${t("stats.encodingRows")}; ${textRows.length} ${t("stats.textRows")}.`;
    statusMessage.value = characterStatsMessage.value;
  } finally {
    characterStatsProgress.value = 100;
    isCountingCharacterStats.value = false;
  }
}

async function runUnmappedCharactersCheck() {
  if (isCheckingUnmappedCharacters.value) return;

  isCheckingUnmappedCharacters.value = true;
  unmappedProgress.value = 0;
  unmappedMessage.value = t("stats.checkingUnmappedCharacters");
  errorMessage.value = "";
  await nextTick();

  const encodingChars = new Set(
    rows.value
      .map((row) => row.original_char)
      .filter((char) => char !== ""),
  );
  const missingRows = new Map<string, { count: number; rows: Set<number> }>();
  const sourceRows = sentenceRowsForUnmappedCheck();

  try {
    for (let rowIndex = 0; rowIndex < sourceRows.length; rowIndex += 1) {
      const row = sourceRows[rowIndex];
      for (const token of unmappedCharacterTokens(row.translated_text)) {
        if (encodingChars.has(token)) continue;
        const match = missingRows.get(token) ?? { count: 0, rows: new Set<number>() };
        match.count += 1;
        match.rows.add(row.index + 1);
        missingRows.set(token, match);
      }

      if (rowIndex % 120 === 0 || rowIndex === sourceRows.length - 1) {
        // Yield regularly so the persistent progress bar updates during large
        // text scans instead of appearing frozen.
        unmappedProgress.value =
          sourceRows.length === 0
            ? 100
            : Math.round(((rowIndex + 1) / sourceRows.length) * 100);
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      }
    }

    const sortedRows = Array.from(missingRows.entries()).sort(
      ([charA, matchA], [charB, matchB]) => {
        const countDiff =
          unmappedSortOrder.value === "asc"
            ? matchA.count - matchB.count
            : matchB.count - matchA.count;
        return countDiff === 0 ? charA.localeCompare(charB) : countDiff;
      },
    );

    const totalOccurrences = sortedRows.reduce((total, [, match]) => total + match.count, 0);
    unmappedResult.value = sortedRows
      .map(([character, match]) =>
        `unmapped char "${displayUnmappedToken(character)}" in row ${Array.from(match.rows).join(",")}`,
      )
      .join("\n");
    unmappedMessage.value =
      sortedRows.length === 0
        ? `${t("stats.noUnmappedCharactersFound")}: ${sourceRows.length} ${t("message.rows")}.`
        : `${t("stats.foundUnmappedCharacters")}: ${sortedRows.length}; ${t("stats.occurrences")}: ${totalOccurrences}; ${t("stats.textRowsScanned")}: ${sourceRows.length}.`;
    statusMessage.value = unmappedMessage.value;
  } finally {
    unmappedProgress.value = 100;
    isCheckingUnmappedCharacters.value = false;
  }
}

async function runUnusedEncodingsCheck() {
  if (isCheckingUnusedEncodings.value) return;

  isCheckingUnusedEncodings.value = true;
  unusedEncodingProgress.value = 0;
  unusedEncodingMessage.value = t("stats.checkingUnusedEncodings");
  errorMessage.value = "";
  await nextTick();

  const sourceRows = sentenceRowsForUnusedEncodingCheck();
  const usedTokens = new Set<string>();

  try {
    // Phase one scans translated text, phase two compares the encoding table.
    // Progress is split 70/30 to keep feedback roughly proportional.
    for (let rowIndex = 0; rowIndex < sourceRows.length; rowIndex += 1) {
      const row = sourceRows[rowIndex];
      for (const token of unusedEncodingTextTokens(row.translated_text)) {
        usedTokens.add(token);
      }

      if (rowIndex % 120 === 0 || rowIndex === sourceRows.length - 1) {
        unusedEncodingProgress.value =
          sourceRows.length === 0
            ? 70
            : Math.round(((rowIndex + 1) / sourceRows.length) * 70);
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      }
    }

    const unusedRows: { character: string; code: string; rowNumber: number }[] = [];
    for (let rowIndex = 0; rowIndex < rows.value.length; rowIndex += 1) {
      const row = rows.value[rowIndex];
      const character = row.original_char;
      if (character === "" || !encodingCharacterMatchesUnusedSelection(character)) {
        continue;
      }

      if (!usedTokens.has(character)) {
        unusedRows.push({
          character,
          code: row.code,
          rowNumber: rowIndex + 1,
        });
      }

      if (rowIndex % 240 === 0 || rowIndex === rows.value.length - 1) {
        unusedEncodingProgress.value =
          rows.value.length === 0
            ? 100
            : 70 + Math.round(((rowIndex + 1) / rows.value.length) * 30);
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      }
    }

    unusedRows.sort((rowA, rowB) =>
      unusedEncodingSortOrder.value === "asc"
        ? rowA.rowNumber - rowB.rowNumber
        : rowB.rowNumber - rowA.rowNumber,
    );

    unusedEncodingResult.value = unusedRows
      .map(
        (row) =>
          `unused encoding "${displayUnmappedToken(row.character)}" code ${row.code || "(empty)"} in encoding row ${row.rowNumber}`,
      )
      .join("\n");
    unusedEncodingMessage.value =
      unusedRows.length === 0
        ? `${t("stats.noUnusedEncodingsFound")}; ${t("stats.textRowsScanned")}: ${sourceRows.length}.`
        : `${t("stats.foundUnusedEncodings")}: ${unusedRows.length}; ${t("stats.textRowsScanned")}: ${sourceRows.length}.`;
    statusMessage.value = unusedEncodingMessage.value;
  } finally {
    unusedEncodingProgress.value = 100;
    isCheckingUnusedEncodings.value = false;
  }
}

async function runLineLengthCheck() {
  if (isCheckingLineLength.value) return;

  isCheckingLineLength.value = true;
  lineLengthProgress.value = 0;
  lineLengthMessage.value = t("stats.checkingLineLength");
  errorMessage.value = "";
  await nextTick();

  const sourceRows = sentenceRowsForLineLengthCheck();
  const maxLength = Math.max(0, Math.floor(lineLengthMaxLength.value));
  const encodingWidths = encodingWidthMap();
  const overlongRows: string[] = [];

  try {
    // Natural lines are split by real newlines only. Visual newline markers in
    // the table are display hints and do not affect this measurement.
    for (let rowIndex = 0; rowIndex < sourceRows.length; rowIndex += 1) {
      const row = sourceRows[rowIndex];
      const naturalLines = row.translated_text.split(/\r\n|\r|\n/);

      naturalLines.forEach((line, lineIndex) => {
        const measuredLength = measureLineLength(line, encodingWidths);
        if (measuredLength > maxLength) {
          overlongRows.push(
            `row ${row.index + 1} line ${lineIndex + 1}: ${measuredLength} > ${maxLength}\t${line}`,
          );
        }
      });

      if (rowIndex % 120 === 0 || rowIndex === sourceRows.length - 1) {
        lineLengthProgress.value =
          sourceRows.length === 0
            ? 100
            : Math.round(((rowIndex + 1) / sourceRows.length) * 100);
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      }
    }

    lineLengthResult.value = overlongRows.join("\n");
    lineLengthMessage.value =
      overlongRows.length === 0
        ? `${t("stats.noOverlongNaturalLinesFound")}; ${t("stats.textRowsScanned")}: ${sourceRows.length}.`
        : `${t("stats.foundOverlongNaturalLines")}: ${overlongRows.length}; ${t("stats.textRowsScanned")}: ${sourceRows.length}.`;
    statusMessage.value = lineLengthMessage.value;
  } finally {
    lineLengthProgress.value = 100;
    isCheckingLineLength.value = false;
  }
}

function encodingWidthMap() {
  const widths = new Map<string, number>();
  rows.value.forEach((row) => {
    const character = row.original_char;
    if (character === "") return;
    const width = Number(row.width);
    widths.set(character, Number.isFinite(width) ? Math.max(0, width) : 0);
  });
  return widths;
}

function measureLineLength(line: string, encodingWidths: Map<string, number>) {
  let total = 0;
  let index = 0;

  while (index < line.length) {
    const bracketToken = lineLengthBracketedTokenAt(line, index);
    if (bracketToken) {
      total += lineLengthTokenWidth(bracketToken.token, "token", encodingWidths);
      index = bracketToken.endIndex;
      continue;
    }

    const character = Array.from(line.slice(index))[0] ?? "";
    index += character.length;
    total += lineLengthTokenWidth(
      character,
      lineLengthCharacterType(character),
      encodingWidths,
    );
  }

  return total;
}

function lineLengthTokenWidth(
  token: string,
  type: LineLengthCharacterType,
  encodingWidths: Map<string, number>,
) {
  const rule = lineLengthWidthRules.value[type];
  if (rule.mode === "fixed") return rule.fixed;
  return encodingWidths.get(token) ?? rule.fixed;
}

function lineLengthBracketedTokenAt(text: string, startIndex: number) {
  const pairs: Record<string, { close: string; type: LineLengthBracketTokenType }> = {
    "[": { close: "]", type: "square" },
    "{": { close: "}", type: "curly" },
    "<": { close: ">", type: "angle" },
  };
  const open = text[startIndex];
  const pair = pairs[open];
  if (!pair || !lineLengthBracketTokenTypes.value.includes(pair.type)) return null;

  const endIndex = text.indexOf(pair.close, startIndex + 1);
  if (endIndex === -1) return null;

  return {
    endIndex: endIndex + pair.close.length,
    token: text.slice(startIndex, endIndex + pair.close.length),
  };
}

function lineLengthCharacterType(character: string): LineLengthCharacterType {
  if (characterMatchesSingleUnmappedType(character, "fullwidth_letters")) return "fullwidth_letters";
  if (characterMatchesSingleUnmappedType(character, "western")) return "western";
  if (characterMatchesSingleUnmappedType(character, "han")) return "han";
  if (characterMatchesSingleUnmappedType(character, "kana")) return "kana";
  if (characterMatchesSingleUnmappedType(character, "hangul")) return "hangul";
  if (characterMatchesSingleUnmappedType(character, "fullwidth")) return "fullwidth";
  if (characterMatchesSingleUnmappedType(character, "halfwidth")) return "halfwidth";
  return "other";
}

function encodingCharacterStatsTokens(text: string) {
  const tokens: string[] = [];
  let index = 0;

  while (index < text.length) {
    const bracketToken = characterStatsBracketedTokenAt(text, index);
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
    if (characterMatchesCharacterStatsType(character)) {
      tokens.push(character);
    }
  }

  return tokens;
}

function characterStatsBracketedTokenAt(text: string, startIndex: number) {
  const pairs: Record<string, { close: string; type: CoverageBracketTokenType }> = {
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

function characterMatchesCharacterStatsType(character: string) {
  if (characterStatsIncludeAll.value) return true;
  if (characterStatsTypes.value.length === 0) return false;
  return characterStatsTypes.value.some((type) =>
    characterMatchesSingleUnmappedType(character, type),
  );
}

function unusedEncodingTextTokens(text: string) {
  const tokens: string[] = [];
  let index = 0;

  while (index < text.length) {
    const bracketToken = unusedEncodingBracketedTokenAt(text, index);
    if (bracketToken) {
      if (
        unusedEncodingIncludeAllCharacters.value ||
        unusedEncodingCharacterTypes.value.includes("token")
      ) {
        tokens.push(bracketToken.token);
      }
      index = bracketToken.endIndex;
      continue;
    }

    const character = Array.from(text.slice(index))[0] ?? "";
    index += character.length;
    if (unusedEncodingIgnoreWhitespace.value && /\s/u.test(character)) continue;
    if (characterMatchesUnusedEncodingType(character)) {
      tokens.push(character);
    }
  }

  return tokens;
}

function unusedEncodingBracketedTokenAt(text: string, startIndex: number) {
  const pairs: Record<string, { close: string; type: CoverageBracketTokenType }> = {
    "[": { close: "]", type: "square" },
    "{": { close: "}", type: "curly" },
    "<": { close: ">", type: "angle" },
  };
  const open = text[startIndex];
  const pair = pairs[open];
  if (!pair || !unusedEncodingBracketTokenTypes.value.includes(pair.type)) return null;

  const endIndex = text.indexOf(pair.close, startIndex + 1);
  if (endIndex === -1) return null;

  return {
    endIndex: endIndex + pair.close.length,
    token: text.slice(startIndex, endIndex + pair.close.length),
  };
}

function encodingCharacterMatchesUnusedSelection(character: string) {
  if (unusedEncodingIgnoreWhitespace.value && /^\s+$/u.test(character)) return false;

  if (isSelectedUnusedEncodingToken(character)) {
    return (
      unusedEncodingIncludeAllCharacters.value ||
      unusedEncodingCharacterTypes.value.includes("token")
    );
  }

  if (Array.from(character).length !== 1) {
    return unusedEncodingIncludeAllCharacters.value;
  }

  return characterMatchesUnusedEncodingType(character);
}

function isSelectedUnusedEncodingToken(character: string) {
  return (
    (/^\[[^\[\]]+\]$/.test(character) &&
      unusedEncodingBracketTokenTypes.value.includes("square")) ||
    (/^\{[^{}]+\}$/.test(character) &&
      unusedEncodingBracketTokenTypes.value.includes("curly")) ||
    (/^<[^<>]+>$/.test(character) &&
      unusedEncodingBracketTokenTypes.value.includes("angle"))
  );
}

function characterMatchesUnusedEncodingType(character: string) {
  if (unusedEncodingIncludeAllCharacters.value) return true;
  if (unusedEncodingCharacterTypes.value.length === 0) return false;
  return unusedEncodingCharacterTypes.value.some((type) =>
    characterMatchesSingleUnmappedType(character, type),
  );
}

function unmappedCharacterTokens(text: string) {
  const tokens: string[] = [];
  let index = 0;

  while (index < text.length) {
    const bracketToken = unmappedBracketedTokenAt(text, index);
    if (bracketToken) {
      if (unmappedIncludeAllCharacters.value || unmappedCharacterTypes.value.includes("token")) {
        tokens.push(bracketToken.token);
      }
      index = bracketToken.endIndex;
      continue;
    }

    const character = Array.from(text.slice(index))[0] ?? "";
    index += character.length;
    if (unmappedIgnoreWhitespace.value && /\s/u.test(character)) continue;
    if (characterMatchesUnmappedType(character)) {
      tokens.push(character);
    }
  }

  return tokens;
}

function unmappedBracketedTokenAt(text: string, startIndex: number) {
  const pairs: Record<string, { close: string; type: CoverageBracketTokenType }> = {
    "[": { close: "]", type: "square" },
    "{": { close: "}", type: "curly" },
    "<": { close: ">", type: "angle" },
  };
  const open = text[startIndex];
  const pair = pairs[open];
  if (!pair || !unmappedBracketTokenTypes.value.includes(pair.type)) return null;

  const endIndex = text.indexOf(pair.close, startIndex + 1);
  if (endIndex === -1) return null;

  return {
    endIndex: endIndex + pair.close.length,
    token: text.slice(startIndex, endIndex + pair.close.length),
  };
}

function characterMatchesUnmappedType(character: string) {
  if (unmappedIncludeAllCharacters.value) return true;
  if (unmappedCharacterTypes.value.length === 0) return false;
  return unmappedCharacterTypes.value.some((type) =>
    characterMatchesSingleUnmappedType(character, type),
  );
}

function characterMatchesSingleUnmappedType(
  character: string,
  type: CoverageCharacterType,
): boolean {
  switch (type) {
    case "western":
      return (
        /\p{Script=Latin}/u.test(character) &&
        !characterMatchesSingleUnmappedType(character, "fullwidth_letters")
      );
    case "han":
      return /\p{Script=Han}/u.test(character);
    case "kana":
      return /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(character);
    case "hangul":
      return /\p{Script=Hangul}/u.test(character);
    case "fullwidth_letters":
      return /[\uFF21-\uFF3A\uFF41-\uFF5A]/u.test(character);
    case "fullwidth":
      return /[\uFF10-\uFF19\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF65]/u.test(
        character,
      );
    case "halfwidth":
      return /[0-9!-\/:-@[-`{-~]/u.test(character);
    case "token":
      return false;
    case "other":
      return !(
        characterMatchesSingleUnmappedType(character, "western") ||
        characterMatchesSingleUnmappedType(character, "han") ||
        characterMatchesSingleUnmappedType(character, "kana") ||
        characterMatchesSingleUnmappedType(character, "hangul") ||
        characterMatchesSingleUnmappedType(character, "fullwidth_letters") ||
        characterMatchesSingleUnmappedType(character, "fullwidth") ||
        characterMatchesSingleUnmappedType(character, "halfwidth")
      );
  }
}

function displayUnmappedToken(token: string) {
  if (token === " ") return " ";
  if (token === "\t") return "\\t";
  if (token === "\r") return "\\r";
  if (token === "\n") return "\\n";
  if (token === "\"") return "\\\"";
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
    errorMessage.value =
      error instanceof Error ? error.message : t("message.failedCopyCharacterCount");
    statusMessage.value = "";
  }
}

async function copyUnmappedCharactersResult() {
  if (unmappedResult.value === "") return;

  try {
    await copyText(unmappedResult.value);
    unmappedMessage.value = t("stats.unmappedCharacterResultCopied");
    statusMessage.value = unmappedMessage.value;
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value =
      error instanceof Error
        ? error.message
        : t("stats.failedCopyUnmappedCharacterResult");
    statusMessage.value = "";
  }
}

async function copyUnusedEncodingsResult() {
  if (unusedEncodingResult.value === "") return;

  try {
    await copyText(unusedEncodingResult.value);
    unusedEncodingMessage.value = t("stats.unusedEncodingResultCopied");
    statusMessage.value = unusedEncodingMessage.value;
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("stats.failedCopyUnusedEncodingResult");
    statusMessage.value = "";
  }
}

async function copyLineLengthResult() {
  if (lineLengthResult.value === "") return;

  try {
    await copyText(lineLengthResult.value);
    lineLengthMessage.value = t("stats.lineLengthResultCopied");
    statusMessage.value = lineLengthMessage.value;
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("stats.failedCopyLineLengthResult");
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

async function browseImportPath() {
  const path = await openDialog({
    title: t("dialog.importTbl"),
    multiple: false,
    filters: [
      {
        name: t("dialog.textTable"),
        extensions: ["txt", "tbl"],
      },
    ],
  });

  if (typeof path === "string") {
    importPath.value = path;
  }
}

async function confirmImportText() {
  if (!canImportText.value) return;

  if (!importAppendRows.value && !(await confirmImportOverwrite(t("dialog.importTbl")))) {
    return;
  }

  errorMessage.value = "";
  statusMessage.value = "";
  isImportingText.value = true;

  try {
    const bytes = await readFile(importPath.value.trim());
    const text = decodeImportText(bytes);
    const importedRows = parseEncodingTableText(text);
    recordCurrentStateForUndo();
    rows.value = importAppendRows.value
      ? [...rows.value, ...importedRows]
      : importedRows;
    if (!importAppendRows.value) {
      jsonPath.value = "";
    }
    selectedRowIds.value = new Set();
    selectionAnchorRowId.value = null;
    pendingDeleteIndex.value = null;
    resetVirtualRowState();
    closeImportDialog();
    statusMessage.value = importAppendRows.value
      ? `${t("message.appended")}: ${importedRows.length} ${t("message.rows")}.`
      : `${t("message.imported")}: ${importedRows.length} ${t("message.rows")}.`;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("message.failedImportTextTable");
  } finally {
    isImportingText.value = false;
  }
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
    if (
      !excelImportAppendRows.value &&
      !(await confirmImportOverwrite(t("dialog.importExcel")))
    ) {
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
      jsonPath.value = "";
    }
    selectedRowIds.value = new Set();
    selectionAnchorRowId.value = null;
    pendingDeleteIndex.value = null;
    resetVirtualRowState();
    closeExcelImportDialog();
    statusMessage.value = excelImportAppendRows.value
      ? `${t("message.excelAppended")}: ${importedRows.length} ${t("message.rows")}.`
      : `${t("message.excelImported")}: ${importedRows.length} ${t("message.rows")}.`;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("message.failedImportExcel");
  } finally {
    isImportingExcel.value = false;
  }
}

async function rowsFromExcelImport() {
  const startRow = requiredPositiveInteger(excelImportStartRow.value, t("dialog.startRow"));
  const charColumn = requiredPositiveInteger(
    excelImportCharColumn.value,
    "char column",
  );
  const codeColumn = requiredPositiveInteger(
    excelImportCodeColumn.value,
    "code column",
  );
  const widthColumn = optionalPositiveInteger(
    excelImportWidthColumn.value,
    "width column",
  );
  const noteColumn = optionalPositiveInteger(
    excelImportNoteColumn.value,
    "note column",
  );
  const workbook = await readXlsxWorkbook(await readFile(excelImportPath.value.trim()));
  const outputRows: EncodingRow[] = [];

  for (const sheet of workbook) {
    for (let rowIndex = startRow - 1; rowIndex < sheet.rows.length; rowIndex += 1) {
      const cells = sheet.rows[rowIndex] ?? [];
      const originalChar = excelCellText(cells, charColumn);
      const code = normalizeCode(excelCellText(cells, codeColumn));
      const width = widthColumn ? excelCellText(cells, widthColumn) : "";
      const note = noteColumn ? excelCellText(cells, noteColumn) : "";

      if (originalChar === "" && code === "" && width === "" && note === "") {
        continue;
      }

      outputRows.push({
        original_char: originalChar,
        code,
        width,
        note,
      });
    }
  }

  return outputRows;
}

function decodeImportText(bytes: Uint8Array) {
  const encoding =
    importFileEncoding.value === "auto"
      ? detectTextEncoding(bytes)
      : importFileEncoding.value;

  if (encoding === "utf16le") {
    const offset = bytes[0] === 0xff && bytes[1] === 0xfe ? 2 : 0;
    return new TextDecoder("utf-16le").decode(bytes.slice(offset));
  }

  const offset = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  return new TextDecoder("utf-8").decode(bytes.slice(offset));
}

function detectTextEncoding(bytes: Uint8Array): "utf8" | "utf16le" {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "utf16le";
  if (bytes.length < 4) return "utf8";

  const sampleLength = Math.min(bytes.length, 200);
  let oddZeroCount = 0;
  for (let index = 1; index < sampleLength; index += 2) {
    if (bytes[index] === 0) oddZeroCount += 1;
  }

  return oddZeroCount > sampleLength / 8 ? "utf16le" : "utf8";
}

function formatMessageTimestamp() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function parseEncodingTableText(text: string) {
  const normalizedText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parsedRows: EncodingRow[] = [];

  normalizedText.split("\n").forEach((line, index) => {
    if (line === "") return;

    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) {
      throw new Error(`${t("message.lineDoesNotContainEqualsPrefix")} ${index + 1} ${t("message.lineDoesNotContainEqualsSuffix")}`);
    }

    const left = line.slice(0, equalsIndex);
    const right = line.slice(equalsIndex + 1);
    parsedRows.push({
      original_char: importDirection.value === "code_char" ? right : left,
      code: importDirection.value === "code_char" ? normalizeCode(left) : normalizeCode(right),
      width: "",
      note: "",
    });
  });

  return parsedRows;
}

function openExportDialog() {
  openEncodingDialog("exportText");
}

function closeExportDialog() {
  isExportDialogOpen.value = false;
}

function openExcelExportDialog() {
  openEncodingDialog("excelExport");
}

function closeExcelExportDialog() {
  isExcelExportDialogOpen.value = false;
}

async function browseExcelExportPath() {
  const path = await saveDialog({
    title: t("dialog.exportExcel"),
    defaultPath: excelExportPath.value.trim() || "encoding-table.xlsx",
    filters: [{ name: t("dialog.excelWorkbook"), extensions: ["xlsx"] }],
  });

  if (path) {
    excelExportPath.value = ensureXlsxExtension(path);
  }
}

async function confirmExcelExport() {
  if (!canExportExcel.value) return;

  errorMessage.value = "";
  statusMessage.value = "";
  isExportingExcel.value = true;

  try {
    const exportRows = rowsForExcelExport();
    const path = ensureXlsxExtension(excelExportPath.value.trim());
    await writeFile(path, buildEncodingXlsxWorkbook(exportRows, columnWidths.value));
    excelExportPath.value = path;
    closeExcelExportDialog();
    statusMessage.value = `${t("message.excelExported")}: ${exportRows.length} ${t("message.rows")}.`;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("message.failedExportExcel");
  } finally {
    isExportingExcel.value = false;
  }
}

function rowsForExcelExport() {
  if (excelExportScope.value === "filtered") {
    return filteredRows.value.map(({ row, index }) => ({ row, index }));
  }

  if (excelExportScope.value === "selected") {
    return rows.value
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => selectedRowIds.value.has(getRowIdentity(row)));
  }

  return rows.value.map((row, index) => ({ row, index }));
}

async function browseExportPath() {
  const path = await saveDialog({
    title: t("dialog.exportTbl"),
    defaultPath: exportPath.value.trim()
      ? ensureTextTableExtension(exportPath.value.trim())
      : defaultExportPath(),
    filters: [
      {
        name: t("dialog.textTable"),
        extensions: ["txt", "tbl"],
      },
    ],
  });

  if (path) {
    updateExportExtensionFromPath(path);
    exportPath.value = ensureTextTableExtension(path);
  }
}

async function confirmExportText() {
  if (!canExportText.value) return;

  errorMessage.value = "";
  statusMessage.value = "";
  isExportingText.value = true;

  try {
    const path = ensureTextTableExtension(exportPath.value.trim());
    const text = serializeEncodingTableRows(rowsForTextExport());
    await writeFile(path, encodeExportText(text));
    exportPath.value = path;
    closeExportDialog();
    statusMessage.value = `${t("message.exported")}: ${exportRowCount.value} ${t("message.rows")}.`;
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("message.failedExportTextTable");
  } finally {
    isExportingText.value = false;
  }
}

function rowsForTextExport() {
  if (exportScope.value === "filtered") {
    return filteredRows.value.map(({ row }) => row);
  }

  if (exportScope.value === "selected") {
    return rows.value.filter((row) => selectedRowIds.value.has(getRowIdentity(row)));
  }

  return rows.value;
}

function serializeEncodingTableRows(exportRows: EncodingRow[]) {
  const newline = exportNewline.value === "crlf" ? "\r\n" : "\n";
  const lines = exportRows.map((row) =>
    exportDirection.value === "code_char"
      ? `${row.code}=${row.original_char}`
      : `${row.original_char}=${row.code}`,
  );

  return `${lines.join(newline)}${lines.length > 0 ? newline : ""}`;
}

function encodeExportText(text: string) {
  if (exportFileEncoding.value === "utf8") {
    return new TextEncoder().encode(text);
  }

  const bytes = new Uint8Array(text.length * 2);
  for (let index = 0; index < text.length; index += 1) {
    const codeUnit = text.charCodeAt(index);
    bytes[index * 2] = codeUnit & 0xff;
    bytes[index * 2 + 1] = codeUnit >> 8;
  }
  return bytes;
}

function defaultExportPath() {
  return `encoding-table.${exportExtension.value}`;
}

function ensureTextTableExtension(path: string) {
  return path.replace(/\.(txt|tbl)$/i, "") + `.${exportExtension.value}`;
}

function updateExportExtensionFromPath(path: string) {
  if (/\.tbl$/i.test(path)) {
    exportExtension.value = "tbl";
  } else if (/\.txt$/i.test(path)) {
    exportExtension.value = "txt";
  }
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
}

async function clearRows() {
  if (rows.value.length === 0) return;

  const confirmed = await confirm(
    t("message.clearListConfirm"),
    {
      title: t("main.clearList"),
      kind: "warning",
    },
  );

  if (!confirmed) return;
  recordCurrentStateForUndo();
  rows.value = [];
  selectedRowIds.value = new Set();
  selectionAnchorRowId.value = null;
  pendingDeleteIndex.value = null;
  resetVirtualRowState();
  statusMessage.value = t("message.encodingListCleared");
}

async function deleteSelectedRows() {
  pruneSelectedRows(true);
  if (selectedRowIds.value.size === 0) {
    statusMessage.value = t("message.noRowsSelected");
    errorMessage.value = "";
    return;
  }

  const deleteCount = selectedRowIds.value.size;
  const confirmed = await confirm(
    `${t("message.deleteSelectedConfirmPrefix")} ${deleteCount} ${t("message.deleteSelectedConfirmSuffix")}`,
    {
      title: t("main.deleteSelected"),
      kind: "warning",
    },
  );

  if (!confirmed) return;

  recordCurrentStateForUndo();
  const idsToDelete = selectedRowIds.value;
  rows.value = rows.value.filter((row) => !idsToDelete.has(getRowIdentity(row)));
  selectedRowIds.value = new Set();
  selectionAnchorRowId.value = null;
  pendingDeleteIndex.value = null;
  pruneVirtualRowState();
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
    .map((column) => column.key as keyof EncodingRow);

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

function openBulkColumnDialog() {
  pruneSelectedRows(true);
  if (selectedRowIds.value.size === 0) {
    statusMessage.value = t("message.noRowsSelected");
    errorMessage.value = "";
    return;
  }

  if (!openEncodingDialog("bulkColumn")) return;
  bulkColumnValue.value = "";
}

function focusPasteCell(rowIndex: number, columnKey: keyof EncodingRow) {
  focusedPasteCell.value = { columnKey, rowIndex };
}

function editableEventTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest("input, textarea, select"));
}

function interactiveEventTarget(target: EventTarget | null) {
  const element = target as HTMLElement | null;
  return Boolean(element?.closest("button, input, textarea, select, [contenteditable='true']"));
}

function handleWindowPointerDownForTableKeyboard(event: PointerEvent) {
  const wrapper = tableWrap.value;
  const targetNode = event.target instanceof Node ? event.target : null;
  if (!wrapper || !targetNode || !wrapper.contains(targetNode)) {
    isTableKeyboardActive.value = false;
  }
}

function focusTableKeyboardSurface() {
  isTableKeyboardActive.value = true;
  nextTick(() => {
    if (!editingTableCell.value) {
      tableWrap.value?.focus({ preventScroll: true });
    }
  });
}

function isTableSelectionKeyboardTarget(event: KeyboardEvent) {
  const wrapper = tableWrap.value;
  if (!wrapper || !isTableKeyboardActive.value || interactiveEventTarget(event.target)) {
    return false;
  }

  const targetNode = event.target instanceof Node ? event.target : null;
  const activeNode = document.activeElement;
  return (
    (targetNode !== null && wrapper.contains(targetNode)) ||
    (activeNode !== null && wrapper.contains(activeNode))
  );
}

function tableCellKey(rowIndex: number, columnKey: keyof EncodingRow) {
  return `${rowIndex}:${columnKey}`;
}

function parseTableCellKey(key: string): EncodingTableCell | null {
  const separatorIndex = key.indexOf(":");
  if (separatorIndex === -1) return null;
  const rowIndex = Number.parseInt(key.slice(0, separatorIndex), 10);
  const columnKey = key.slice(separatorIndex + 1) as keyof EncodingRow;
  if (!Number.isInteger(rowIndex) || !selectableTableColumns.value.includes(columnKey)) {
    return null;
  }
  return { rowIndex, columnKey };
}

function visibleRowIndicesBetween(startRowIndex: number, endRowIndex: number) {
  const visibleRows = filteredRows.value.map((item) => item.index);
  const startVisibleIndex = visibleRows.indexOf(startRowIndex);
  const endVisibleIndex = visibleRows.indexOf(endRowIndex);
  if (startVisibleIndex === -1 || endVisibleIndex === -1) {
    const minRowIndex = Math.min(startRowIndex, endRowIndex);
    const maxRowIndex = Math.max(startRowIndex, endRowIndex);
    return visibleRows.filter((rowIndex) => rowIndex >= minRowIndex && rowIndex <= maxRowIndex);
  }

  const from = Math.min(startVisibleIndex, endVisibleIndex);
  const to = Math.max(startVisibleIndex, endVisibleIndex);
  return visibleRows.slice(from, to + 1);
}

function tableCellRange(anchor: EncodingTableCell, cell: EncodingTableCell) {
  const columns = selectableTableColumns.value;
  const anchorColumnIndex = columns.indexOf(anchor.columnKey);
  const cellColumnIndex = columns.indexOf(cell.columnKey);
  if (anchorColumnIndex === -1 || cellColumnIndex === -1) return new Set<string>();

  const fromColumn = Math.min(anchorColumnIndex, cellColumnIndex);
  const toColumn = Math.max(anchorColumnIndex, cellColumnIndex);
  const nextSelection = new Set<string>();
  visibleRowIndicesBetween(anchor.rowIndex, cell.rowIndex).forEach((rowIndex) => {
    columns.slice(fromColumn, toColumn + 1).forEach((columnKey) => {
      nextSelection.add(tableCellKey(rowIndex, columnKey));
    });
  });
  return nextSelection;
}

function selectTableCell(cell: EncodingTableCell, extendSelection = false) {
  exitTableCellEdit();
  focusTableKeyboardSurface();
  activeTableCell.value = cell;
  focusedPasteCell.value = cell;

  if (extendSelection && tableCellSelectionAnchor.value) {
    selectedTableCells.value = tableCellRange(tableCellSelectionAnchor.value, cell);
    syncRowSelectionFromTableCells();
    return;
  }

  tableCellSelectionAnchor.value = cell;
  selectedTableCells.value = new Set([tableCellKey(cell.rowIndex, cell.columnKey)]);
  syncRowSelectionFromTableCells();
}

function firstTableCellFromSelection(selection: Set<string>) {
  for (const key of selection) {
    const cell = parseTableCellKey(key);
    if (cell) return cell;
  }
  return null;
}

function toggleTableCellInSelection(cell: EncodingTableCell) {
  exitTableCellEdit();
  const key = tableCellKey(cell.rowIndex, cell.columnKey);
  const nextSelection = new Set(selectedTableCells.value);

  if (nextSelection.has(key)) {
    nextSelection.delete(key);
    const fallbackCell = firstTableCellFromSelection(nextSelection);
    activeTableCell.value = fallbackCell;
    tableCellSelectionAnchor.value = fallbackCell;
    focusedPasteCell.value = fallbackCell;
  } else {
    nextSelection.add(key);
    activeTableCell.value = cell;
    tableCellSelectionAnchor.value = cell;
    focusedPasteCell.value = cell;
  }

  selectedTableCells.value = nextSelection;
  syncRowSelectionFromTableCells();
}

function handleTableCellMouseDown(rowIndex: number, columnKey: keyof EncodingRow, event: MouseEvent) {
  if (tableInteractionMode.value !== "select") return;
  if (event.button !== 0) return;
  const target = event.target as HTMLElement | null;
  if (isTableCellEditing(rowIndex, columnKey) && target?.closest("textarea")) return;
  event.preventDefault();
  tableCellDragPointerX = event.clientX;
  tableCellDragPointerY = event.clientY;

  if (isDiscontiguousCellClickSelectionEnabled && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
    isDraggingTableCellSelection.value = false;
    toggleTableCellInSelection({ rowIndex, columnKey });
    return;
  }

  isDraggingTableCellSelection.value = true;
  tableCellAutoScrollStartedAt = performance.now();
  scheduleTableCellDragAutoScroll();
  selectTableCell({ rowIndex, columnKey }, event.shiftKey);
}

function handleWindowTableCellDragMouseMove(event: MouseEvent) {
  if (!isDraggingTableCellSelection.value) return;
  tableCellDragPointerX = event.clientX;
  tableCellDragPointerY = event.clientY;
  scheduleTableCellDragAutoScroll();
}

function handleTableCellMouseMove(rowIndex: number, columnKey: keyof EncodingRow, event: MouseEvent) {
  if (tableInteractionMode.value !== "select" || !isDraggingTableCellSelection.value) return;
  if (!tableCellSelectionAnchor.value) return;
  tableCellDragPointerX = event.clientX;
  tableCellDragPointerY = event.clientY;
  scheduleTableCellDragAutoScroll();
  selectTableCell({ rowIndex, columnKey }, true);
}

function handleTableCellDoubleClick(rowIndex: number, columnKey: keyof EncodingRow, event: MouseEvent) {
  if (tableInteractionMode.value !== "select") return;
  event.preventDefault();
  selectTableCell({ rowIndex, columnKey });
  enterTableCellEdit({ rowIndex, columnKey });
}

function endTableCellDragSelection() {
  isDraggingTableCellSelection.value = false;
  tableCellAutoScrollStartedAt = 0;
  stopTableCellDragAutoScroll();
}

function handleTableTextareaFocus(rowIndex: number, columnKey: keyof EncodingRow, event: FocusEvent) {
  if (tableInteractionMode.value === "select") {
    if (isTableCellEditing(rowIndex, columnKey)) {
      focusPasteCell(rowIndex, columnKey);
      return;
    }
    (event.target as HTMLTextAreaElement).blur();
    selectTableCell({ rowIndex, columnKey });
    return;
  }

  focusPasteCell(rowIndex, columnKey);
}

function handleTableTextareaBlur(row: EncodingRow, columnKey: keyof EncodingRow) {
  const editedColumn = editingTableCell.value?.columnKey;
  exitTableCellEdit(false);
  if ((editedColumn ?? columnKey) === "code") {
    normalizeEditedCode(row);
  }
}

function isTableCellSelected(rowIndex: number, columnKey: keyof EncodingRow) {
  return selectedTableCells.value.has(tableCellKey(rowIndex, columnKey));
}

function isActiveTableCell(rowIndex: number, columnKey: keyof EncodingRow) {
  return activeTableCell.value?.rowIndex === rowIndex && activeTableCell.value.columnKey === columnKey;
}

function isTableCellEditing(rowIndex: number, columnKey: keyof EncodingRow) {
  return editingTableCell.value?.rowIndex === rowIndex && editingTableCell.value.columnKey === columnKey;
}

function enterTableCellEdit(cell: EncodingTableCell) {
  editingTableCell.value = cell;
  activeTableCell.value = cell;
  focusedPasteCell.value = cell;
  nextTick(() => {
    const selector = `.textarea-cell[data-cell-row-index="${cell.rowIndex}"][data-cell-column="${cell.columnKey}"] textarea`;
    const textarea = tableWrap.value?.querySelector<HTMLTextAreaElement>(selector);
    textarea?.focus();
    textarea?.select();
  });
}

function exitTableCellEdit(blurTextarea = true) {
  const editingCell = editingTableCell.value;
  if (blurTextarea && editingCell) {
    const selector = `.textarea-cell[data-cell-row-index="${editingCell.rowIndex}"][data-cell-column="${editingCell.columnKey}"] textarea`;
    const textarea = tableWrap.value?.querySelector<HTMLTextAreaElement>(selector);
    if (textarea && document.activeElement === textarea) {
      textarea.blur();
    }
  }
  editingTableCell.value = null;
}

function toggleTableInteractionMode() {
  const nextMode: TableInteractionMode = tableInteractionMode.value === "edit" ? "select" : "edit";
  tableInteractionMode.value = nextMode;
  (document.activeElement as HTMLElement | null)?.blur();
  statusMessage.value =
    nextMode === "select" ? t("message.tableSelectMode") : t("message.tableEditMode");
  errorMessage.value = "";

  if (nextMode === "edit") {
    clearTableCellSelection();
    return;
  }

  if (nextMode === "select" && !activeTableCell.value) {
    const firstVisibleRow = filteredRows.value[0];
    const firstColumn = selectableTableColumns.value[0];
    if (firstVisibleRow && firstColumn) {
      selectTableCell({ rowIndex: firstVisibleRow.index, columnKey: firstColumn });
    }
  }
}

function clearTableCellSelection() {
  const hadTableCellSelection = selectedTableCells.value.size > 0;
  selectedTableCells.value = new Set();
  activeTableCell.value = null;
  tableCellSelectionAnchor.value = null;
  editingTableCell.value = null;
  isDraggingTableCellSelection.value = false;
  tableCellAutoScrollStartedAt = 0;
  stopTableCellDragAutoScroll();
  if (hadTableCellSelection) {
    selectedRowIds.value = new Set();
    selectionAnchorRowId.value = null;
  }
}

function syncRowSelectionFromTableCells() {
  const nextSelectedIds = new Set<number>();
  selectedTableCellList().forEach((cell) => {
    const row = rows.value[cell.rowIndex];
    if (row) nextSelectedIds.add(getRowIdentity(row));
  });
  selectedRowIds.value = nextSelectedIds;
  selectionAnchorRowId.value = nextSelectedIds.values().next().value ?? null;
}

function scheduleTableCellDragAutoScroll() {
  if (tableCellAutoScrollFrame !== undefined) return;
  tableCellAutoScrollFrame = window.requestAnimationFrame(runTableCellDragAutoScroll);
}

function stopTableCellDragAutoScroll() {
  if (tableCellAutoScrollFrame !== undefined) {
    window.cancelAnimationFrame(tableCellAutoScrollFrame);
    tableCellAutoScrollFrame = undefined;
  }
}

function runTableCellDragAutoScroll() {
  tableCellAutoScrollFrame = undefined;
  if (!isDraggingTableCellSelection.value || !tableWrap.value) return;

  const bounds = tableWrap.value.getBoundingClientRect();
  const edgeSize = 56;
  const topDistance = tableCellDragPointerY - bounds.top;
  const bottomDistance = bounds.bottom - tableCellDragPointerY;
  let delta = 0;

  if (topDistance < edgeSize) {
    delta = -tableCellDragAutoScrollStep(topDistance, edgeSize);
  } else if (bottomDistance < edgeSize) {
    delta = tableCellDragAutoScrollStep(bottomDistance, edgeSize);
  }

  if (delta !== 0) {
    tableWrap.value.scrollTop += delta;
    updateTableViewport();
    updateTableCellDragSelectionFromPointer();
  }
  scheduleTableCellDragAutoScroll();
}

function tableCellDragAutoScrollStep(edgeDistance: number, edgeSize: number) {
  const closeness = (edgeSize - Math.max(0, Math.min(edgeDistance, edgeSize))) / edgeSize;
  const distanceBoost = closeness * closeness;
  const elapsedMs = Math.max(0, performance.now() - tableCellAutoScrollStartedAt);
  const timeBoost = Math.min(3.2, 1 + elapsedMs / 650);
  return Math.max(2, Math.ceil((5 + distanceBoost * 18) * timeBoost));
}

function updateTableCellDragSelectionFromPointer() {
  if (!tableCellSelectionAnchor.value) return;
  const element = document
    .elementFromPoint(tableCellDragPointerX, tableCellDragPointerY)
    ?.closest<HTMLElement>(".textarea-cell[data-cell-row-index][data-cell-column]");
  if (!element) return;
  const rowIndex = Number.parseInt(element.dataset.cellRowIndex ?? "", 10);
  const columnKey = element.dataset.cellColumn as keyof EncodingRow | undefined;
  if (!Number.isInteger(rowIndex) || !columnKey || !selectableTableColumns.value.includes(columnKey)) {
    return;
  }
  selectTableCell({ rowIndex, columnKey }, true);
}

function selectedTableCellList() {
  return [...selectedTableCells.value]
    .map(parseTableCellKey)
    .filter((cell): cell is EncodingTableCell => cell !== null && rows.value[cell.rowIndex] !== undefined);
}

async function copySelectedTableCells() {
  const cells = selectedTableCellList();
  if (cells.length === 0) return;

  const rowIndices = [...new Set(cells.map((cell) => cell.rowIndex))].sort((a, b) => a - b);
  const columns = selectableTableColumns.value;
  const selectedColumnIndexes = cells
    .map((cell) => columns.indexOf(cell.columnKey))
    .filter((index) => index >= 0);
  const fromColumn = Math.min(...selectedColumnIndexes);
  const toColumn = Math.max(...selectedColumnIndexes);
  const selectedKeys = selectedTableCells.value;

  const text = rowIndices
    .map((rowIndex) =>
      columns
        .slice(fromColumn, toColumn + 1)
        .map((columnKey) =>
          selectedKeys.has(tableCellKey(rowIndex, columnKey))
            ? spreadsheetCellText(rows.value[rowIndex]?.[columnKey] ?? "")
            : "",
        )
        .join("\t"),
    )
    .join("\n");

  try {
    await copyText(text);
    statusMessage.value = `${t("message.copiedSelectedRows")}: ${cells.length}.`;
    errorMessage.value = "";
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("message.failedCopySelectedRows");
    statusMessage.value = "";
  }
}

function clearSelectedTableCells() {
  const cells = selectedTableCellList();
  if (cells.length === 0) return;

  const changedCells = cells.filter((cell) => rows.value[cell.rowIndex][cell.columnKey] !== "");
  if (changedCells.length === 0) return;

  recordCurrentStateForUndo();
  changedCells.forEach((cell) => {
    rows.value[cell.rowIndex][cell.columnKey] = "";
  });
  rows.value = [...rows.value];
}

function moveActiveTableCell(rowDelta: number, columnDelta: number, extendSelection: boolean) {
  const visibleRows = filteredRows.value.map((item) => item.index);
  const columns = selectableTableColumns.value;
  if (visibleRows.length === 0 || columns.length === 0) return;

  const currentCell = activeTableCell.value ?? {
    rowIndex: visibleRows[0],
    columnKey: columns[0],
  };
  const currentVisibleRowIndex = Math.max(0, visibleRows.indexOf(currentCell.rowIndex));
  const currentColumnIndex = Math.max(0, columns.indexOf(currentCell.columnKey));
  const nextVisibleRowIndex = Math.min(
    visibleRows.length - 1,
    Math.max(0, currentVisibleRowIndex + rowDelta),
  );
  const nextColumnIndex = Math.min(columns.length - 1, Math.max(0, currentColumnIndex + columnDelta));

  selectTableCell(
    { rowIndex: visibleRows[nextVisibleRowIndex], columnKey: columns[nextColumnIndex] },
    extendSelection,
  );
  scrollTableCellRowIntoView(visibleRows[nextVisibleRowIndex]);
}

function scrollTableCellRowIntoView(rowIndex: number) {
  const wrapper = tableWrap.value;
  if (!wrapper) return;

  const filteredIndex = filteredRows.value.findIndex((item) => item.index === rowIndex);
  if (filteredIndex < 0) return;

  const headerHeight = wrapper.querySelector<HTMLElement>(".header-row")?.offsetHeight ?? 0;
  const rowTop = sumRowHeights(filteredRows.value, 0, filteredIndex);
  const rowBottom = rowTop + rowHeight(filteredRows.value[filteredIndex].row);
  const visibleTop = wrapper.scrollTop;
  const visibleBottom = wrapper.scrollTop + wrapper.clientHeight - headerHeight;

  if (rowTop < visibleTop) {
    wrapper.scrollTop = rowTop;
  } else if (rowBottom > visibleBottom) {
    wrapper.scrollTop = Math.max(0, rowBottom - wrapper.clientHeight + headerHeight);
  }
  updateTableViewport();
}

function selectAllVisibleTableCells() {
  exitTableCellEdit();
  const columns = selectableTableColumns.value;
  const nextSelection = new Set<string>();
  filteredRows.value.forEach(({ index }) => {
    columns.forEach((columnKey) => nextSelection.add(tableCellKey(index, columnKey)));
  });
  selectedTableCells.value = nextSelection;
  syncRowSelectionFromTableCells();
  const firstRow = filteredRows.value[0];
  const firstColumn = columns[0];
  if (firstRow && firstColumn) {
    activeTableCell.value = { rowIndex: firstRow.index, columnKey: firstColumn };
    tableCellSelectionAnchor.value = activeTableCell.value;
    focusedPasteCell.value = activeTableCell.value;
  }
}

function handleTableSelectionKeydown(event: KeyboardEvent) {
  const key = event.key;
  const commandKey = isMacPlatform() ? event.metaKey : event.ctrlKey;

  if (commandKey && key.toLowerCase() === "a") {
    event.preventDefault();
    selectAllVisibleTableCells();
    return true;
  }

  if (commandKey && key.toLowerCase() === "c") {
    event.preventDefault();
    void copySelectedTableCells();
    return true;
  }

  if (commandKey && key.toLowerCase() === "v") {
    event.preventDefault();
    void pasteClipboardAsTable();
    return true;
  }

  if (
    (key === "Backspace" || key === "Delete") &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey
  ) {
    event.preventDefault();
    clearSelectedTableCells();
    return true;
  }

  if (key === "Enter" && activeTableCell.value) {
    event.preventDefault();
    enterTableCellEdit(activeTableCell.value);
    return true;
  }

  const movementByKey: Record<string, [number, number]> = {
    ArrowUp: [-1, 0],
    ArrowDown: [1, 0],
    ArrowLeft: [0, -1],
    ArrowRight: [0, 1],
  };
  const movement = movementByKey[key];
  if (movement) {
    event.preventDefault();
    moveActiveTableCell(movement[0], movement[1], event.shiftKey);
    return true;
  }

  return false;
}

function closeBulkColumnDialog() {
  isBulkColumnDialogOpen.value = false;
}

function openCodeShiftDialog() {
  pruneSelectedRows(true);
  if (selectedRowIds.value.size === 0) {
    statusMessage.value = t("message.noRowsSelected");
    errorMessage.value = "";
    return;
  }

  if (!openEncodingDialog("codeShift")) return;
}

function closeCodeShiftDialog() {
  isCodeShiftDialogOpen.value = false;
}

async function confirmCodeShift() {
  pruneSelectedRows(true);
  const selectedIds = selectedRowIds.value;
  if (selectedIds.size === 0) {
    closeCodeShiftDialog();
    return;
  }

  const x = parseCodeShiftInput(codeShiftXValue.value, codeShiftBase.value);
  const y = parseCodeShiftInput(codeShiftYValue.value, codeShiftBase.value);
  if (x === null || y === null) {
    errorMessage.value = t("encoding.codeShiftInvalidInput");
    statusMessage.value = "";
    return;
  }

  const delta = x + 0x100 * y;
  const signedDelta = codeShiftOperation.value === "add" ? delta : -delta;
  const confirmed = await confirm(
    `${t("encoding.codeShiftConfirm")} ${t("bulk.selectedRows")}: ${selectedIds.size}.`,
    {
      title: t("encoding.codeShiftTitle"),
      kind: "warning",
    },
  );
  if (!confirmed) return;

  const historySnapshot = createTableSnapshot();
  let changedCount = 0;
  let skippedCount = 0;
  rows.value.forEach((row) => {
    if (!selectedIds.has(getRowIdentity(row))) return;

    const sourceCode = parseCodeValue(row[codeShiftColumn.value]);
    if (sourceCode === null) {
      skippedCount += 1;
      return;
    }

    const nextCode = sourceCode + signedDelta;
    if (nextCode < 0) {
      skippedCount += 1;
      return;
    }

    row[codeShiftColumn.value] =
      codeShiftColumn.value === "code"
        ? formatCodeValue(nextCode, row[codeShiftColumn.value])
        : formatHexCellValue(nextCode, row[codeShiftColumn.value]);
    changedCount += 1;
  });

  if (changedCount > 0) {
    recordHistoryStep(historySnapshot);
  }
  rows.value = [...rows.value];
  pruneSelectedRows(true);
  closeCodeShiftDialog();
  statusMessage.value = `${t("encoding.codeShiftChanged")}: ${changedCount}; ${t("encoding.codeShiftSkipped")}: ${skippedCount}.`;
  errorMessage.value = "";
}

function parseCodeShiftInput(value: string, base: CodeShiftBase) {
  const trimmed = value.trim();
  if (trimmed === "") return 0;

  if (base === "hex") {
    const normalized = trimmed.replace(/^0x/i, "");
    if (!/^[0-9a-f]+$/i.test(normalized)) return null;
    return Number.parseInt(normalized, 16);
  }

  if (!/^\d+$/u.test(trimmed)) return null;
  return Number.parseInt(trimmed, 10);
}

function parseCodeValue(value: string) {
  const normalized = value.trim().replace(/^0x/i, "");
  if (normalized === "" || !/^[0-9a-f]+$/i.test(normalized)) return null;
  return Number.parseInt(normalized, 16);
}

function formatCodeValue(value: number, sourceCode: string) {
  const sourceLength = normalizeCode(sourceCode).length;
  const minLength = Math.max(2, sourceLength);
  const hex = value.toString(16).toUpperCase();
  const paddedLength = Math.max(minLength, hex.length % 2 === 0 ? hex.length : hex.length + 1);
  return hex.padStart(paddedLength, "0");
}

function formatHexCellValue(value: number, sourceValue: string) {
  const source = sourceValue.trim().replace(/^0x/i, "");
  const minLength = Math.max(2, source.length);
  const hex = value.toString(16).toUpperCase();
  const paddedLength = Math.max(minLength, hex.length % 2 === 0 ? hex.length : hex.length + 1);
  return hex.padStart(paddedLength, "0");
}

async function confirmBulkColumnChange() {
  pruneSelectedRows(true);
  const selectedIds = selectedRowIds.value;
  if (selectedIds.size === 0) {
    closeBulkColumnDialog();
    return;
  }

  const columnKey = bulkColumnKey.value as keyof EncodingRow;
  const confirmed = await confirm(
    `${t("bulk.columnConfirmPrefix")} ${selectedIds.size} ${t("bulk.columnConfirmMiddle")} ${columnKey}${t("bulk.columnConfirmSuffix")}`,
    {
      title: t("bulk.columnTitle"),
      kind: "warning",
    },
  );

  if (!confirmed) return;

  const historySnapshot = createTableSnapshot();
  let changedCount = 0;
  rows.value.forEach((row) => {
    if (!selectedIds.has(getRowIdentity(row))) return;
    changedCount += 1;
    row[columnKey] = columnKey === "code" ? normalizeCode(bulkColumnValue.value) : bulkColumnValue.value;
  });
  if (changedCount > 0) {
    recordHistoryStep(historySnapshot);
  }
  rows.value = [...rows.value];
  pruneSelectedRows(true);
  closeBulkColumnDialog();
  statusMessage.value = `${t("bulk.changedColumnPrefix")}: ${changedCount}; ${columnKey} = ${bulkColumnValue.value}.`;
  errorMessage.value = "";
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

function toggleRowSelectionRange(row: EncodingRow, checked: boolean) {
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
  if (selectedTableCells.value.size > 0) {
    clearTableCellSelection();
    statusMessage.value = t("message.deselectedAllRows");
    errorMessage.value = "";
    return;
  }
  selectedRowIds.value = new Set();
  selectionAnchorRowId.value = null;
  statusMessage.value = t("message.deselectedAllRows");
  errorMessage.value = "";
}

function handleFilteredSelectionChange(event?: Event) {
  event?.preventDefault();
  toggleFilteredRowSelection(!isEveryFilteredRowSelected.value);
}

function applyRowSelection(row: EncodingRow, checked: boolean, shiftKey: boolean) {
  if (shiftKey) {
    toggleRowSelectionRange(row, checked);
  } else {
    toggleRowSelection(row, checked);
  }
  selectionAnchorRowId.value = getRowIdentity(row);
}

function handleRowSelectionChange(row: EncodingRow, event: MouseEvent) {
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

function handleRowNumberCellClick(row: EncodingRow, event: MouseEvent) {
  if (isInteractiveRowNumberTarget(event)) return;

  const rowId = getRowIdentity(row);
  applyRowSelection(row, !selectedRowIds.value.has(rowId), event.shiftKey);
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

function openGoToRowDialog() {
  openEncodingDialog("goToRow");
}

function openLanguageDialog() {
  openEncodingDialog("language");
}

function closeLanguageDialog() {
  isLanguageDialogOpen.value = false;
}

function selectLanguage(language: AppLanguage) {
  setAppLanguage(language);
  closeLanguageDialog();
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
        ? t("message.noRowsToJump")
        : `${t("message.enterRowRangePrefix")} ${rows.value.length}${t("message.enterRowRangeSuffix")}`;
    return false;
  }

  const targetRowIndex = targetRowNumber - 1;
  const visibleIndex = filteredRows.value.findIndex(
    (item) => item.index === targetRowIndex,
  );

  if (visibleIndex === -1) {
    statusMessage.value = "";
    errorMessage.value = `${t("message.rowHiddenByFiltersPrefix")} ${targetRowNumber} ${t("message.rowHiddenByFiltersSuffix")}`;
    return false;
  }

  errorMessage.value = "";
  statusMessage.value = `${t("message.jumpedToRow")} ${targetRowNumber}.`;

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

function openFindReplaceBar() {
  isFindReplaceOpen.value = true;
  if (findReplaceColumns.value.length === 0) {
    findReplaceColumns.value = availableFindReplaceColumns.value.map(
      (column) => column.key as keyof EncodingRow,
    );
  }
  nextTick(() => {
    void jumpToFindReplaceMatch(currentFindMatchIndex.value);
  });
}

function toggleFindReplaceBar() {
  if (isFindReplaceOpen.value) {
    closeFindReplaceBar();
    return;
  }
  openFindReplaceBar();
}

function closeFindReplaceBar() {
  isFindReplaceOpen.value = false;
}

function findReplaceCellMatches(value: string, query: string) {
  const source = isFindReplaceCaseSensitive.value ? value : value.toLocaleLowerCase();
  const needle = isFindReplaceCaseSensitive.value ? query : query.toLocaleLowerCase();
  return findReplaceMatchMode.value === "exact"
    ? source === needle
    : source.includes(needle);
}

function replacementForFindCell(value: string, columnKey: keyof EncodingRow) {
  const replaced =
    findReplaceMatchMode.value === "exact"
      ? findReplaceReplacement.value
      : value.replace(
          new RegExp(escapeRegExp(findReplaceQuery.value), isFindReplaceCaseSensitive.value ? "g" : "gi"),
          findReplaceReplacement.value,
        );

  return columnKey === "code" ? normalizeCode(replaced) : replaced;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function showPreviousFindReplaceMatch() {
  if (findReplaceMatches.value.length === 0) return;
  currentFindMatchIndex.value =
    (currentFindMatchIndex.value - 1 + findReplaceMatches.value.length) %
    findReplaceMatches.value.length;
  await jumpToFindReplaceMatch(currentFindMatchIndex.value);
}

async function showNextFindReplaceMatch() {
  if (findReplaceMatches.value.length === 0) return;
  currentFindMatchIndex.value =
    (currentFindMatchIndex.value + 1) % findReplaceMatches.value.length;
  await jumpToFindReplaceMatch(currentFindMatchIndex.value);
}

async function jumpToFindReplaceMatch(matchIndex: number) {
  const match = findReplaceMatches.value[matchIndex];
  if (!match) return;

  const nextScrollTop = sumRowHeights(filteredRows.value, 0, match.filteredIndex);
  tableScrollTop.value = nextScrollTop;
  if (tableWrap.value) {
    tableWrap.value.scrollTop = nextScrollTop;
  }
  updateTableViewport();
  await nextTick();
  alignRenderedRow(match.row);
  await nextTick();
  alignRenderedFindCell(match);
}

function alignRenderedFindCell(match: EncodingFindReplaceMatch) {
  const rowElement = rowElements.get(getRowIdentity(match.row));
  const wrapper = tableWrap.value;
  if (!rowElement || !wrapper) return;

  const cell = rowElement.querySelector<HTMLElement>(
    `[data-cell-column="${match.columnKey}"]`,
  );
  if (!cell) return;

  const wrapperRect = wrapper.getBoundingClientRect();
  const cellRect = cell.getBoundingClientRect();
  if (cellRect.left < wrapperRect.left || cellRect.right > wrapperRect.right) {
    wrapper.scrollLeft += cellRect.left - wrapperRect.left - 12;
  }
}

function isCurrentFindReplaceCell(row: EncodingRow, columnKey: EncodingColumnKey) {
  const match = currentFindReplaceMatch.value;
  return (
    Boolean(match) &&
    match?.row === row &&
    match.columnKey === columnKey
  );
}

function replaceCurrentFindReplaceMatch() {
  const match = currentFindReplaceMatch.value;
  if (!match) return;

  const currentValue = match.row[match.columnKey];
  const nextValue = replacementForFindCell(currentValue, match.columnKey);
  if (nextValue === currentValue) return;

  recordCurrentStateForUndo();
  match.row[match.columnKey] = nextValue;
  statusMessage.value = `${t("find.replacedCells")}: 1.`;
  errorMessage.value = "";
}

async function replaceAllFindReplaceMatches() {
  if (findReplaceMatches.value.length === 0) return;

  const shouldReplace = await confirm(t("find.replaceAllConfirm"), {
    title: t("find.replaceAllTitle"),
  });
  if (!shouldReplace) return;

  const uniqueCells = new Map<string, EncodingFindReplaceMatch>();
  for (const match of findReplaceMatches.value) {
    uniqueCells.set(`${getRowIdentity(match.row)}:${match.columnKey}`, match);
  }

  const historySnapshot = createTableSnapshot();
  let changedCount = 0;
  for (const match of uniqueCells.values()) {
    const currentValue = match.row[match.columnKey];
    const nextValue = replacementForFindCell(currentValue, match.columnKey);
    if (nextValue === currentValue) continue;
    match.row[match.columnKey] = nextValue;
    changedCount += 1;
  }

  if (changedCount > 0) {
    recordHistoryStep(historySnapshot);
  }
  currentFindMatchIndex.value = 0;
  statusMessage.value = `${t("find.replacedCells")}: ${changedCount}.`;
  errorMessage.value = "";
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

function clearRowFilter() {
  rowFilterStart.value = "";
  rowFilterEnd.value = "";
}

function resetSearchFilters() {
  searchText.value = "";
  isCaseSensitiveSearch.value = false;
  selectedSearchColumns.value = [...searchableColumns];
  activeFilters.value = [];
  rowFilterStart.value = "";
  rowFilterEnd.value = "";
}

function rowMatchesFilter(row: EncodingRow, filter: EncodingFilter) {
  const text = row.original_char;
  switch (filter) {
    case "duplicate_character":
      return duplicateCharacterIds.value.has(getRowIdentity(row));
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

function rowMatchesSearch(row: EncodingRow, query: string) {
  return (
    query === "" ||
    selectedSearchColumns.value.some((key) =>
      normalizeSearchValue(row[key]).includes(query),
    )
  );
}

function normalizeSearchValue(value: string) {
  return isCaseSensitiveSearch.value ? value : value.toLowerCase();
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
    void persistEncodingDraft();
  }, 250);
}

async function persistEncodingDraft() {
  try {
    if (rows.value.length === 0 && jsonPath.value === "") {
      await invoke("delete_app_draft", { name: "encoding" });
      window.localStorage.removeItem(draftStorageKey);
      return;
    }

    await invoke("write_app_draft", {
      contents: JSON.stringify({
        jsonPath: jsonPath.value,
        rows: rows.value,
      }),
      name: "encoding",
    });
    window.localStorage.removeItem(draftStorageKey);
    statusMessage.value = t("message.autoSavedLocal");
  } catch (error) {
    errorMessage.value =
      error instanceof Error ? error.message : t("message.failedAutoSave");
  }
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

async function restoreEncodingDraft() {
  try {
    const backendDraft = await invoke<string | null>("read_app_draft", { name: "encoding" });
    const legacyDraft = window.localStorage.getItem(draftStorageKey);
    const rawRows = backendDraft ?? legacyDraft;
    if (!rawRows) return;
    const parsed = JSON.parse(rawRows) as unknown;
    const rowSource = Array.isArray(parsed)
      ? parsed
      : isRecord(parsed) && Array.isArray(parsed.rows)
        ? parsed.rows
        : [];

    jsonPath.value = isRecord(parsed) ? toText(parsed.jsonPath) : "";
    rows.value = await normalizeEncodingRowsInChunks(rowSource);
    statusMessage.value = t("message.restoredLocalDraft");
    if (!backendDraft && legacyDraft) {
      // Migrate older localStorage drafts into Tauri app data after restore.
      window.localStorage.removeItem(draftStorageKey);
      queuePersistRows();
    }
  } catch {
    window.localStorage.removeItem(draftStorageKey);
    invoke("delete_app_draft", { name: "encoding" }).catch(() => {});
  }
}

async function normalizeEncodingRowsInChunks(rowSource: unknown[]) {
  const normalizedRows: EncodingRow[] = [];
  for (let index = 0; index < rowSource.length; index += 1) {
    normalizedRows.push(normalizeEncodingJsonRow(rowSource[index]));
    if (index % 1000 === 999) {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    }
  }
  return normalizedRows;
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

function adjustColumnFontSize(columnIndex: number, delta: number) {
  const currentSize = columnFontSizes.value[columnIndex];
  columnFontSizes.value[columnIndex] = Math.min(
    40,
    Math.max(8, currentSize + delta),
  );
  persistColumnFontSizes();
  resetVirtualRowState();
  updateTableViewport();
}

function persistColumnFontSizes() {
  window.localStorage.setItem(
    columnFontSizeStorageKey,
    JSON.stringify(columnFontSizes.value),
  );
}

function restoreColumnFontSizes() {
  try {
    const rawFontSizes = window.localStorage.getItem(columnFontSizeStorageKey);
    if (!rawFontSizes) return [...defaultColumnFontSizes];
    const parsed = JSON.parse(rawFontSizes) as unknown;
    if (!Array.isArray(parsed)) return [...defaultColumnFontSizes];

    return defaultColumnFontSizes.map((defaultSize, index) => {
      const value = parsed[index];
      return typeof value === "number" && Number.isFinite(value)
        ? Math.min(40, Math.max(8, Math.round(value)))
        : defaultSize;
    });
  } catch {
    window.localStorage.removeItem(columnFontSizeStorageKey);
    return [...defaultColumnFontSizes];
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

function restoreBulkColumnKey(): BulkEditableColumn {
  const storedColumn = window.localStorage.getItem(bulkColumnStorageKey);
  const matchedColumn = bulkEditableColumns.find((column) => column.key === storedColumn);
  return matchedColumn?.key ?? "original_char";
}

function persistBulkColumnKey() {
  window.localStorage.setItem(bulkColumnStorageKey, bulkColumnKey.value);
}

function restoreExportScope(storageKey: string): ExportScope {
  const storedScope = window.localStorage.getItem(storageKey);
  return storedScope === "all" || storedScope === "filtered" || storedScope === "selected"
    ? storedScope
    : "all";
}

function persistExportScope(storageKey: string, scope: ExportScope) {
  window.localStorage.setItem(storageKey, scope);
}

function restoreThemeMode(): ThemeMode {
  const storedTheme = window.localStorage.getItem(themeStorageKey);
  return storedTheme === "system" || storedTheme === "dark" || storedTheme === "light"
    ? storedTheme
    : "system";
}

function restoreTopPanelVisible() {
  const storedValue = window.localStorage.getItem(topPanelVisibleStorageKey);
  if (storedValue === "true") return true;
  if (storedValue === "false") return false;
  return false;
}

function toggleTopPanel() {
  isTopPanelVisible.value = !isTopPanelVisible.value;
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

function encodingFilterLabel(filter: EncodingFilter) {
  const labels: Record<EncodingFilter, string> = {
    duplicate_character: t("encoding.duplicateCharacter"),
    duplicate_code: t("encoding.duplicateCode"),
    empty_character: t("encoding.emptyCharacter"),
    empty_code: t("encoding.emptyCode"),
    punctuation: t("encoding.punctuation"),
    han: t("encoding.han"),
    kana: t("encoding.kana"),
    hangul: t("encoding.hangul"),
    latin: t("encoding.latin"),
    special: t("encoding.special"),
  };
  return labels[filter];
}

function emptyEncodingFilterCounts() {
  return Object.fromEntries(filterOptions.map((filter) => [filter, 0])) as Record<
    EncodingFilter,
    number
  >;
}

function queueRefreshFilterCounts() {
  if (filterCountRefreshFrame !== undefined) {
    window.cancelAnimationFrame(filterCountRefreshFrame);
  }
  filterCountRefreshRun += 1;
  const runId = filterCountRefreshRun;

  filterCountRefreshFrame = window.requestAnimationFrame(() => {
    filterCountRefreshFrame = undefined;
    void refreshFilterCounts(runId);
  });
}

async function refreshFilterCounts(runId: number) {
  const counts = emptyEncodingFilterCounts();
  const baseRows = textFilteredRows.value;
  for (let index = 0; index < baseRows.length; index += 1) {
    if (runId !== filterCountRefreshRun) return;
    const { row } = baseRows[index];
    for (const filter of filterOptions) {
      if (rowMatchesFilter(row, filter)) {
        counts[filter] += 1;
      }
    }
    if (index % 500 === 499) {
      filterCounts.value = { ...counts };
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
    }
  }
  if (runId !== filterCountRefreshRun) return;
  filterCounts.value = counts;
}

function rowNumberStyle() {
  return {
    fontSize: `${columnFontSizes.value[0]}px`,
  };
}

function columnIndexByKey(key: EncodingColumnKey) {
  return columns.findIndex((column) => column.key === key);
}

function movableColumn(key: EncodingColumnKey) {
  return key !== "row_number";
}

function restoreColumnOrder(): EncodingColumnKey[] {
  const defaultOrder = columns.map((column) => column.key);
  try {
    const rawOrder = window.localStorage.getItem(columnOrderStorageKey);
    if (!rawOrder) return defaultOrder;
    const parsed = JSON.parse(rawOrder) as unknown;
    if (!Array.isArray(parsed)) return defaultOrder;

    const knownKeys = new Set(defaultOrder);
    const restored = parsed.filter(
      (key): key is EncodingColumnKey =>
        typeof key === "string" && knownKeys.has(key as EncodingColumnKey),
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

function persistColumnOrder() {
  window.localStorage.setItem(columnOrderStorageKey, JSON.stringify(columnOrder.value));
}

function startColumnReorder(columnKey: EncodingColumnKey, event: PointerEvent) {
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

function columnKeyFromPoint(x: number, y: number): EncodingColumnKey | null {
  const element = document
    .elementFromPoint(x, y)
    ?.closest<HTMLElement>("[data-column-key]");
  const key = element?.dataset.columnKey;
  return columns.some((column) => column.key === key) ? (key as EncodingColumnKey) : null;
}

function finishColumnReorder(event: PointerEvent) {
  lastColumnPointerX = event.clientX;
  lastColumnPointerY = event.clientY;
  const sourceKey = draggedColumnKey;
  const targetKey = columnKeyFromPoint(lastColumnPointerX, lastColumnPointerY);
  cancelColumnReorder();
  if (!sourceKey) {
    if (targetKey) selectVisibleTableColumn(targetKey, event.shiftKey);
    return;
  }
  if (!sourceKey || !targetKey || sourceKey === targetKey || !movableColumn(targetKey)) return;

  const nextOrder = columnOrder.value.filter((key) => key !== sourceKey);
  const targetIndex = nextOrder.indexOf(targetKey);
  if (targetIndex < 0) return;
  nextOrder.splice(targetIndex, 0, sourceKey);
  columnOrder.value = nextOrder;
  persistColumnOrder();
}

function selectVisibleTableColumn(columnKey: EncodingColumnKey, extendSelection = false) {
  if (tableInteractionMode.value !== "select") return;
  if (columnKey === "row_number") return;

  const selectableColumn = columnKey as keyof EncodingRow;
  if (!selectableTableColumns.value.includes(selectableColumn)) return;

  exitTableCellEdit();
  const columns = selectableTableColumns.value;
  const anchorColumn = tableCellSelectionAnchor.value?.columnKey;
  const anchorColumnIndex = anchorColumn ? columns.indexOf(anchorColumn) : -1;
  const targetColumnIndex = columns.indexOf(selectableColumn);
  const selectedColumns =
    extendSelection && anchorColumnIndex >= 0
      ? columns.slice(
          Math.min(anchorColumnIndex, targetColumnIndex),
          Math.max(anchorColumnIndex, targetColumnIndex) + 1,
        )
      : [selectableColumn];
  const nextSelection = new Set<string>();
  filteredRows.value.forEach(({ index }) => {
    selectedColumns.forEach((selectedColumn) => {
      nextSelection.add(tableCellKey(index, selectedColumn));
    });
  });
  selectedTableCells.value = nextSelection;

  const firstRow = filteredRows.value[0];
  if (firstRow) {
    activeTableCell.value = { rowIndex: firstRow.index, columnKey: selectableColumn };
    tableCellSelectionAnchor.value = activeTableCell.value;
    focusedPasteCell.value = activeTableCell.value;
  } else {
    activeTableCell.value = null;
    tableCellSelectionAnchor.value = null;
    focusedPasteCell.value = null;
  }

  syncRowSelectionFromTableCells();
}

function cellStyle(columnIndex: number, fallbackColumn?: "character" | "note") {
  return {
    fontFamily: fallbackColumn ? cjkFontFamily(fallbackPrefs.value[fallbackColumn]) : undefined,
    fontSize: `${columnFontSizes.value[columnIndex]}px`,
  };
}

function encodingCellStyle(key: keyof EncodingRow) {
  const columnIndex = columnIndexByKey(key);
  if (key === "original_char") return cellStyle(columnIndex, "character");
  if (key === "note") return cellStyle(columnIndex, "note");
  return cellStyle(columnIndex);
}

function disablesTextCorrection(key: keyof EncodingRow) {
  return key === "original_char";
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

async function syncWindowTheme() {
  try {
    const nativeTheme = themeMode.value === "system" ? null : themeMode.value;
    await setAppTheme(nativeTheme);
    await appWindow.setTheme(nativeTheme);
  } catch (error) {
    console.warn("Failed to sync native window theme.", error);
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
  const command = isMacPlatform() ? "set_app_language_menu" : "attach_encoding_manager_menu";
  invoke(command, { language: currentLanguage.value, forceRebuild }).catch((error) => {
    console.warn("Failed to sync app language menu.", error);
  });
}

async function syncNativeChrome() {
  await syncWindowTheme();
  syncAppLanguageMenu(true);
}

function syncHistoryMenuState() {
  invoke("set_history_menu_enabled", {
    canUndo: canUndoTableChange.value,
    canRedo: canRedoTableChange.value,
    target: "encoding",
  }).catch((error) => {
    console.warn("Failed to sync encoding history menu state.", error);
  });
}

function refreshDefaultCheckMessages() {
  const defaultMessages = new Set(["Not checked yet.", "尚未检查。"]);
  const defaultStatsMessages = new Set(["Not counted yet.", "尚未统计。"]);
  if (defaultStatsMessages.has(characterStatsMessage.value)) {
    characterStatsMessage.value = t("stats.notCountedYet");
  }
  if (defaultMessages.has(unmappedMessage.value)) {
    unmappedMessage.value = t("message.notCheckedYet");
  }
  if (defaultMessages.has(unusedEncodingMessage.value)) {
    unusedEncodingMessage.value = t("message.notCheckedYet");
  }
  if (defaultMessages.has(lineLengthMessage.value)) {
    lineLengthMessage.value = t("message.notCheckedYet");
  }
}

</script>

<template>
  <main class="encoding-shell" :class="appShellClasses">
    <div v-if="!isTopPanelVisible" class="compact-top-bar">
      <button
        class="top-panel-toggle"
        type="button"
        @click="toggleTopPanel"
      >
        {{ t("common.showControls") }}
      </button>
      <p class="compact-file-path">{{ displayedJsonPath }}</p>
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

    <section v-if="isTopPanelVisible" class="encoding-top-panel">
      <header class="encoding-toolbar">
        <div class="encoding-toolbar-controls">
          <select v-model="themeMode" class="theme-select" :aria-label="t('common.theme')">
            <option value="system">{{ t("theme.system") }}</option>
            <option value="light">{{ t("theme.light") }}</option>
            <option value="dark">{{ t("theme.dark") }}</option>
          </select>
          <label class="fallback-setting">
            <span>{{ t("encoding.character") }}</span>
            <select
              v-model="fallbackPrefs.character"
              aria-label="char fallback font preference"
            >
              <option
                v-for="option in cjkFallbackOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ fontOptionLabel(option.value) }}
              </option>
            </select>
          </label>
          <label class="fallback-setting">
            <span>{{ t("encoding.note") }}</span>
            <select
              v-model="fallbackPrefs.note"
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
          </label>
          <button type="button" @click="openJsonFile">{{ t("encoding.readJson") }}</button>
          <button type="button" :disabled="!canSaveJson" @click="saveJsonFile">
            {{ isSavingJson ? t("common.saving") : t("encoding.saveJson") }}
          </button>
          <button type="button" :disabled="!canUndoTableChange" @click="undoTableChange">
            {{ t("common.undo") }}
          </button>
          <button type="button" :disabled="!canRedoTableChange" @click="redoTableChange">
            {{ t("common.redo") }}
          </button>
          <button type="button" @click="openImportDialog">{{ t("encoding.importTbl") }}</button>
          <button type="button" @click="openExportDialog">{{ t("encoding.exportTbl") }}</button>
          <button type="button" @click="openExcelImportDialog">{{ t("encoding.importExcel") }}</button>
          <button type="button" @click="openExcelExportDialog">{{ t("encoding.exportExcel") }}</button>
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
        <p class="encoding-file-status">{{ displayedJsonPath }}</p>
      </header>

      <EncodingSearchControls
        ref="topSearchControls"
        v-model:search-text="searchText"
        v-model:is-case-sensitive-search="isCaseSensitiveSearch"
        v-model:selected-search-columns="selectedSearchColumns"
        v-model:row-filter-start="rowFilterStart"
        v-model:row-filter-end="rowFilterEnd"
        v-model:go-to-row-value="goToRowValue"
        :active-filters="activeFilters"
        :displayed-message="displayedMessage"
        :error-message="errorMessage"
        :filter-counts="filterCounts"
        :filter-label="encodingFilterLabel"
        :filter-options="filterOptions"
        :filtered-rows-length="filteredRows.length"
        :go-to-max-row="rows.length"
        :has-active-row-filter="hasActiveRowFilter"
        :rows-length="rows.length"
        :searchable-columns="searchableColumns"
        @clear-filters="activeFilters = []"
        @clear-row-filter="clearRowFilter"
        @go-to-row="goToRow"
        @reset-search="resetSearchFilters"
        @toggle-filter="toggleFilter"
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
        <EncodingSearchControls
          ref="overlaySearchControls"
          v-model:search-text="searchText"
          v-model:is-case-sensitive-search="isCaseSensitiveSearch"
          v-model:selected-search-columns="selectedSearchColumns"
          v-model:row-filter-start="rowFilterStart"
          v-model:row-filter-end="rowFilterEnd"
          v-model:go-to-row-value="goToRowValue"
          :active-filters="activeFilters"
          :displayed-message="displayedMessage"
          :error-message="errorMessage"
          :filter-counts="filterCounts"
          :filter-label="encodingFilterLabel"
          :filter-options="filterOptions"
          :filtered-rows-length="filteredRows.length"
          :go-to-max-row="rows.length"
          :has-active-row-filter="hasActiveRowFilter"
          :rows-length="rows.length"
          :searchable-columns="searchableColumns"
          @clear-filters="activeFilters = []"
          @clear-row-filter="clearRowFilter"
          @go-to-row="goToRow"
          @reset-search="resetSearchFilters"
          @toggle-filter="toggleFilter"
        />
        </section>
      </div>
    </div>

    <FindReplaceBar
      v-if="isFindReplaceOpen"
      v-model:query="findReplaceQuery"
      v-model:replacement="findReplaceReplacement"
      v-model:selected-columns="findReplaceColumns"
      v-model:match-mode="findReplaceMatchMode"
      v-model:case-sensitive="isFindReplaceCaseSensitive"
      v-model:scope="findReplaceScope"
      :columns="availableFindReplaceColumns"
      :current-match-index="currentFindMatchIndex"
      :match-count="findReplaceMatches.length"
      @close="closeFindReplaceBar"
      @find-next="showNextFindReplaceMatch"
      @find-previous="showPreviousFindReplaceMatch"
      @replace="replaceCurrentFindReplaceMatch"
      @replace-all="replaceAllFindReplaceMatches"
    />

    <section
      ref="tableWrap"
      class="encoding-table-wrap"
      :aria-label="t('encoding.encodingList')"
      tabindex="0"
      @scroll="handleTableScroll"
    >
      <div class="encoding-grid header-row" :style="{ gridTemplateColumns }">
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
            <span>{{ column.label }}</span>
            <div v-if="column.key === 'row_number'" class="header-row-actions">
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
                @click="openInsertRowsDialog('start')"
              >
                +
              </button>
              <span class="font-size-readout">{{ columnFontSizes[columnIndexByKey(column.key)] }}px</span>
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
        {{ t("message.addEncodingRowsToStart") }}
      </div>
      <div v-else-if="filteredRows.length === 0" class="empty-state">
        {{ t("message.noMatchingEncodingRows") }}
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
          <template v-for="column in displayedColumns" :key="column.key">
            <div
              v-if="column.key === 'row_number'"
              class="row-number-cell"
              :style="rowNumberStyle()"
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
              v-else
              class="textarea-cell"
              :class="{
                'find-current-cell': isCurrentFindReplaceCell(row, column.key),
                'table-cell-selected': isTableCellSelected(rowIndex, column.key),
                'table-cell-active': isActiveTableCell(rowIndex, column.key),
                'table-cell-editing': isTableCellEditing(rowIndex, column.key),
              }"
              :data-cell-column="column.key"
              :data-cell-row-index="rowIndex"
              :style="encodingCellStyle(column.key)"
              @mousedown="handleTableCellMouseDown(rowIndex, column.key, $event)"
              @mousemove="handleTableCellMouseMove(rowIndex, column.key, $event)"
              @dblclick="handleTableCellDoubleClick(rowIndex, column.key, $event)"
            >
              <textarea
                v-model="row[column.key]"
                :aria-label="column.label"
                :autocapitalize="disablesTextCorrection(column.key) ? 'off' : undefined"
                :autocorrect="disablesTextCorrection(column.key) ? 'off' : undefined"
                :readonly="tableInteractionMode === 'select' && !isTableCellEditing(rowIndex, column.key)"
                :spellcheck="disablesTextCorrection(column.key) ? false : undefined"
                :tabindex="
                  tableInteractionMode === 'select' && !isTableCellEditing(rowIndex, column.key)
                    ? -1
                    : 0
                "
                @focus="handleTableTextareaFocus(rowIndex, column.key, $event)"
                @blur="handleTableTextareaBlur(row, column.key)"
              />
              <div class="textarea-measure">{{ row[column.key] || " " }}</div>
            </div>
          </template>
          <div class="table-end-spacer" aria-hidden="true" />
        </div>

        <div
          class="virtual-spacer"
          :style="{ height: `${virtualRange.bottomPadding}px` }"
        />
        <div class="table-footer-actions">
          <button type="button" class="footer-insert-btn" @click="openInsertRowsDialog('end')">
            +
          </button>
        </div>
      </div>
    </section>

    <GoToRowDialog
      v-if="isGoToRowDialogOpen"
      v-model="goToRowValue"
      :max-row="rows.length"
      @close="closeGoToRowDialog"
      @confirm="confirmGoToRowDialog"
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

    <EncodingCodeShiftDialog
      v-if="isCodeShiftDialogOpen"
      v-model:column="codeShiftColumn"
      v-model:operation="codeShiftOperation"
      v-model:base="codeShiftBase"
      v-model:x-value="codeShiftXValue"
      v-model:y-value="codeShiftYValue"
      :columns="bulkEditableColumns"
      :selected-count="selectedRowCount"
      @close="closeCodeShiftDialog"
      @confirm="confirmCodeShift"
    />

    <InsertRowsDialog
      v-if="isInsertRowsDialogOpen"
      v-model:target-row="insertRowsTargetRow"
      v-model:count="insertRowsCount"
      :max-row="rows.length + 1"
      @close="closeInsertRowsDialog"
      @confirm="confirmInsertRows"
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
      v-model:text-scope="characterStatsTextScope"
      v-model:include-all-characters="characterStatsIncludeAll"
      v-model:character-types="characterStatsTypes"
      v-model:sort-order="characterStatsSortOrder"
      v-model:bracket-token-types="characterStatsBracketTokenTypes"
      v-model:ignore-whitespace="characterStatsIgnoreWhitespace"
      :title="t('stats.characterCount')"
      always-show-progress
      :can-copy="characterStatsResult !== ''"
      :is-running="isCountingCharacterStats"
      :message="characterStatsMessage"
      :progress-value="characterStatsProgress"
      :result="characterStatsResult"
      :row-count-label="t('stats.encodingRows')"
      :row-count="characterStatsRowCount"
      :text-row-count="characterStatsTextRowCount"
      show-ignore-whitespace
      show-text-scope
      @close="closeCharacterStatsDialog"
      @copy="copyCharacterStatsResult"
      @run="runCharacterStats"
    />

    <CharacterStatsDialog
      v-if="isUnmappedCharactersDialogOpen"
      v-model:scope="unmappedScope"
      v-model:include-all-characters="unmappedIncludeAllCharacters"
      v-model:character-types="unmappedCharacterTypes"
      v-model:sort-order="unmappedSortOrder"
      v-model:bracket-token-types="unmappedBracketTokenTypes"
      v-model:ignore-whitespace="unmappedIgnoreWhitespace"
      :title="t('stats.unmappedCharacters')"
      :run-label="t('common.check')"
      always-show-progress
      :can-copy="unmappedResult !== ''"
      :is-running="isCheckingUnmappedCharacters"
      :message="unmappedMessage"
      :progress-value="unmappedProgress"
      :result="unmappedResult"
      :row-count="unmappedRowCount"
      show-ignore-whitespace
      @close="closeUnmappedCharactersDialog"
      @copy="copyUnmappedCharactersResult"
      @run="runUnmappedCharactersCheck"
    />

    <CharacterStatsDialog
      v-if="isUnusedEncodingsDialogOpen"
      v-model:scope="unusedEncodingScope"
      v-model:include-all-characters="unusedEncodingIncludeAllCharacters"
      v-model:character-types="unusedEncodingCharacterTypes"
      v-model:sort-order="unusedEncodingSortOrder"
      v-model:bracket-token-types="unusedEncodingBracketTokenTypes"
      v-model:ignore-whitespace="unusedEncodingIgnoreWhitespace"
      :title="t('stats.unusedEncodings')"
      :run-label="t('common.check')"
      :row-count-label="t('stats.textRowsScanned')"
      always-show-progress
      :can-copy="unusedEncodingResult !== ''"
      :is-running="isCheckingUnusedEncodings"
      :message="unusedEncodingMessage"
      :progress-value="unusedEncodingProgress"
      :result="unusedEncodingResult"
      :row-count="unusedEncodingTextRowCount"
      show-ignore-whitespace
      @close="closeUnusedEncodingsDialog"
      @copy="copyUnusedEncodingsResult"
      @run="runUnusedEncodingsCheck"
    />

    <EncodingLineLengthDialog
      v-if="isLineLengthDialogOpen"
      v-model:scope="lineLengthScope"
      v-model:max-length="lineLengthMaxLength"
      v-model:bracket-token-types="lineLengthBracketTokenTypes"
      v-model:width-rules="lineLengthWidthRules"
      :can-copy="lineLengthResult !== ''"
      :is-running="isCheckingLineLength"
      :message="lineLengthMessage"
      :progress-value="lineLengthProgress"
      :result="lineLengthResult"
      :row-count="lineLengthRowCount"
      @close="closeLineLengthDialog"
      @copy="copyLineLengthResult"
      @run="runLineLengthCheck"
    />

    <EncodingImportDialog
      v-if="isImportDialogOpen"
      v-model:path="importPath"
      v-model:direction="importDirection"
      v-model:file-encoding="importFileEncoding"
      v-model:append-rows="importAppendRows"
      :can-import="canImportText"
      :is-error="errorMessage !== ''"
      :is-importing="isImportingText"
      :message="displayedMessage"
      @browse="browseImportPath"
      @close="closeImportDialog"
      @confirm="confirmImportText"
    />

    <EncodingExcelImportDialog
      v-if="isExcelImportDialogOpen"
      v-model:path="excelImportPath"
      v-model:start-row="excelImportStartRow"
      v-model:char-column="excelImportCharColumn"
      v-model:code-column="excelImportCodeColumn"
      v-model:width-column="excelImportWidthColumn"
      v-model:note-column="excelImportNoteColumn"
      v-model:append-rows="excelImportAppendRows"
      :can-import="canImportExcel"
      :is-error="errorMessage !== ''"
      :is-importing="isImportingExcel"
      :message="displayedMessage"
      @browse="browseExcelImportPath"
      @close="closeExcelImportDialog"
      @confirm="confirmExcelImport"
    />

    <EncodingExportDialog
      v-if="isExportDialogOpen"
      v-model:path="exportPath"
      v-model:scope="exportScope"
      v-model:extension="exportExtension"
      v-model:direction="exportDirection"
      v-model:newline="exportNewline"
      v-model:file-encoding="exportFileEncoding"
      :can-export="canExportText"
      :is-error="errorMessage !== ''"
      :is-exporting="isExportingText"
      :message="displayedMessage"
      :row-count="exportRowCount"
      @browse="browseExportPath"
      @close="closeExportDialog"
      @confirm="confirmExportText"
    />

    <EncodingExcelExportDialog
      v-if="isExcelExportDialogOpen"
      v-model:path="excelExportPath"
      v-model:scope="excelExportScope"
      :can-export="canExportExcel"
      :is-error="errorMessage !== ''"
      :is-exporting="isExportingExcel"
      :message="displayedMessage"
      :row-count="excelExportRowCount"
      @browse="browseExcelExportPath"
      @close="closeExcelExportDialog"
      @confirm="confirmExcelExport"
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

.encoding-shell.top-panel-hidden {
  gap: 6px;
  padding-top: 6px;
}

.encoding-shell .compact-top-bar {
  display: grid;
  grid-template-columns: max-content minmax(90px, 1fr) max-content minmax(90px, 0.75fr);
  gap: 6px;
  align-items: center;
  min-height: 26px;
  min-width: 0;
}

.encoding-shell .top-panel-toggle {
  align-self: flex-start;
  min-height: 22px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 2px 6px;
  color: var(--control-text);
  background: var(--panel-bg);
  font-size: 11px;
  font-weight: 650;
  line-height: 1.2;
  white-space: nowrap;
}

.encoding-shell .top-panel-toggle:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--control-hover-bg);
}

.encoding-shell .compact-file-path,
.encoding-shell .compact-message {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.encoding-shell .compact-file-path,
.encoding-shell .compact-result-count {
  color: var(--muted);
  font-size: 11px;
}

.encoding-shell .compact-result-count {
  white-space: nowrap;
}

.encoding-shell .compact-message {
  min-height: 22px;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 11px;
  line-height: 1.25;
}

.encoding-shell .compact-message.empty {
  border-color: var(--info-border);
  color: transparent;
  background: var(--info-bg);
}

.encoding-shell .search-overlay-backdrop {
  position: fixed;
  inset: 0;
  z-index: 35;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgb(15 23 42 / 45%);
}

.encoding-shell .search-overlay-stack {
  display: grid;
  width: min(960px, 100%);
  max-height: calc(100vh - 24px);
  gap: 8px;
}

.encoding-shell .search-overlay-panel {
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

.encoding-shell.theme-dark .search-overlay-panel {
  border-color: #475569;
  background: #111827;
  box-shadow: 0 18px 60px rgb(0 0 0 / 42%);
}

.encoding-shell .search-overlay-close {
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

.encoding-shell .search-overlay-close:hover {
  border-color: var(--danger);
  color: var(--danger);
  background: var(--danger-bg-soft);
}

.encoding-shell .search-overlay-panel .search-panel {
  display: grid;
  gap: 8px;
  padding-right: 28px;
}

.encoding-shell .search-overlay-panel .search-columns,
.encoding-shell .search-overlay-panel .stats-list {
  gap: 6px 10px;
}

.encoding-shell .search-overlay-panel .message-tools-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  margin-top: 8px;
}

.encoding-shell .search-overlay-panel .message-slot {
  min-height: 29px;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 5px 8px;
  font-size: 12px;
  line-height: 1.25;
}

.encoding-shell .search-overlay-panel .message-slot.empty {
  border-color: var(--info-border);
  color: transparent;
  background: var(--info-bg);
}

.encoding-shell .search-overlay-panel .secondary-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
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
.encoding-shell .text-search-group input[type="search"],
.encoding-shell .go-to-row input {
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

.encoding-file-status {
  min-width: 0;
  margin: 5px 0 0;
  overflow: hidden;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.encoding-toolbar .danger-btn {
  border-color: var(--danger-hover);
  background: var(--danger);
}

.encoding-toolbar .danger-btn:hover {
  background: var(--danger-hover);
}

.encoding-shell .search-panel {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.encoding-shell .search-summary-row {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) max-content auto;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.encoding-shell .filter-group {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.encoding-shell .filter-group-label {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 11px;
  font-weight: 750;
  white-space: nowrap;
}

.encoding-shell .text-search-group input[type="search"] {
  appearance: none;
  -webkit-appearance: none;
  min-width: 150px;
  flex: 1 1 190px;
  min-height: 30px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 5px 8px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-size: 13px;
}

.encoding-shell .text-search-group input[type="search"]:focus {
  outline: 2px solid var(--primary);
  outline-offset: -1px;
}

.encoding-shell .text-search-group input[type="search"]::-webkit-search-cancel-button,
.encoding-shell .text-search-group input[type="search"]::-webkit-search-decoration {
  -webkit-appearance: none;
}

.encoding-shell .result-count {
  justify-self: end;
  color: var(--muted);
  font-size: 12px;
  white-space: nowrap;
}

.encoding-shell .checkbox-label,
.encoding-shell .go-to-row {
  color: var(--text-soft);
  font-size: 12px;
}

.encoding-shell .search-columns {
  display: flex;
  flex-wrap: wrap;
  gap: 5px 12px;
  min-width: 0;
  max-width: 100%;
}

.encoding-shell .search-columns .checkbox-label {
  max-width: 100%;
}

.encoding-shell .stats-panel {
  display: block;
  width: 100%;
  min-width: 0;
}

.encoding-shell .stats-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  width: 100%;
  min-width: 0;
  max-width: 100%;
}

.encoding-shell .message-tools-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  grid-column: 1 / -1;
  min-width: 0;
}

.encoding-shell .message-slot {
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

.encoding-shell .message-slot.empty {
  border-color: var(--info-border);
  color: transparent;
  background: var(--info-bg);
}

.encoding-shell .secondary-actions {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.encoding-shell .stats-list button,
.encoding-shell .go-to-row button,
.encoding-shell .reset-search-btn {
  flex: 0 1 auto;
  max-width: 100%;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 3px 7px;
  color: var(--text-soft);
  background: var(--header-bg);
  font-size: 11px;
  line-height: 1.2;
  white-space: nowrap;
}

.encoding-shell .reset-search-btn {
  min-height: 30px;
  padding: 5px 10px;
  font-size: 12px;
}

.encoding-shell .stats-list button:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.encoding-shell .reset-search-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--control-hover-bg);
}

.encoding-shell .stats-list button.active {
  border-color: var(--primary);
  color: var(--on-accent);
  background: var(--primary);
}

.encoding-shell .go-to-row,
.encoding-shell .row-range-filter {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  color: var(--text-soft);
  font-size: 12px;
  white-space: nowrap;
}

.encoding-shell .go-to-row input,
.encoding-shell .row-range-filter input {
  width: 72px;
  min-height: 28px;
  border: 1px solid var(--control-border);
  border-radius: 6px;
  padding: 4px 6px;
  color: var(--input-text);
  background: var(--panel-bg);
  font-size: 12px;
}

.encoding-shell .go-to-row input:focus,
.encoding-shell .row-range-filter input:focus {
  outline: 2px solid var(--primary);
  outline-offset: -1px;
}

.encoding-shell .go-to-row button,
.encoding-shell .row-range-filter button {
  min-height: 28px;
  padding: 4px 10px;
  font-size: 12px;
}

.encoding-shell .row-range-filter button:disabled {
  color: var(--muted);
  background: var(--disabled-bg);
  cursor: not-allowed;
}

.encoding-shell .checkbox-label {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.encoding-shell .case-checkbox {
  white-space: nowrap;
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

.encoding-table-wrap:focus {
  outline: none;
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

.header-row-actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

.font-size-readout {
  color: var(--muted);
  font-size: 11px;
  font-weight: 650;
  white-space: nowrap;
}

.font-size-controls {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 650;
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
  line-height: 20px;
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
  border-right-color: transparent;
}

.table-end-spacer {
  min-height: 42px;
  background: var(--panel-bg);
  pointer-events: none;
  user-select: none;
}

.table-footer-actions {
  display: flex;
  align-items: center;
  min-height: 34px;
  padding: 4px 10px;
  background: var(--panel-bg);
}

.footer-insert-btn {
  width: 24px;
  min-height: 24px;
  border: 1px solid var(--success);
  border-radius: 6px;
  color: var(--on-accent);
  background: var(--success);
  font-weight: 700;
}

.header-row .table-end-spacer {
  background: var(--header-bg);
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

.textarea-cell.find-current-cell {
  outline: 2px solid var(--warning);
  outline-offset: -2px;
  background: var(--warning-bg);
}

.textarea-cell.table-cell-selected {
  background: color-mix(in srgb, var(--primary) 18%, var(--panel-bg));
}

.textarea-cell.table-cell-active {
  outline: 2px solid var(--primary);
  outline-offset: -2px;
}

.textarea-cell.table-cell-editing {
  outline: 2px solid var(--success);
  outline-offset: -2px;
  background: color-mix(in srgb, var(--success) 14%, var(--panel-bg));
}

.table-select-mode .textarea-cell {
  cursor: cell;
  user-select: none;
  -webkit-user-select: none;
}

.table-select-mode .textarea-cell > textarea {
  cursor: cell;
  user-select: none;
  -webkit-user-select: none;
}

.table-select-mode .textarea-cell.table-cell-editing > textarea {
  cursor: text;
  user-select: text;
  -webkit-user-select: text;
}

.table-select-mode .textarea-cell.table-cell-editing > textarea:focus {
  box-shadow: inset 0 0 0 2px var(--success);
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
  box-sizing: border-box;
  width: 100%;
  padding: 9px 10px;
  font-size: inherit;
  line-height: 1.45;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.textarea-cell > textarea {
  position: absolute;
  inset: 0;
  width: auto;
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
  outline: none;
  box-shadow: inset 0 0 0 2px var(--primary);
}

.table-select-mode .textarea-cell.table-cell-editing > textarea:focus {
  box-shadow: inset 0 0 0 2px var(--success);
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
  .encoding-shell .search-summary-row,
  .encoding-shell .message-tools-row {
    grid-template-columns: 1fr;
  }

  .encoding-top-panel {
    grid-template-columns: 1fr;
  }
}
</style>
