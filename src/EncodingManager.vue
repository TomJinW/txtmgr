<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import {
  confirm,
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readFile, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import {
  cjkFallbackOptions,
  draftStorageKey as sentenceDraftStorageKey,
} from "./constants";
import {
  currentLanguage,
  normalizeAppLanguage,
  setAppLanguage,
  t,
  type AppLanguage,
} from "./i18n";
import { windowsShortcutMatches, type ShortcutAction } from "./shortcuts";
import {
  buildEncodingXlsxWorkbook,
  ensureXlsxExtension,
  excelCellText,
  optionalPositiveInteger,
  readXlsxWorkbook,
  requiredPositiveInteger,
} from "./excel";
import CharacterStatsDialog from "./components/CharacterStatsDialog.vue";
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
import GoToRowDialog from "./components/GoToRowDialog.vue";
import LanguageDialog from "./components/LanguageDialog.vue";
import type { CjkFallbackMode, EncodingRow, SentenceRow, StoredDraft, ThemeMode } from "./types";

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
  | "fullwidth"
  | "halfwidth"
  | "token";

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

const draftStorageKey = "txtmgr.encodingRows.v1";
const columnWidthStorageKey = "txtmgr.encodingColumnWidths.v3";
const columnFontSizeStorageKey = "txtmgr.encodingColumnFontSizes.v1";
const fallbackStorageKey = "txtmgr.encodingFallback.v2";
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
const searchableColumns: (keyof EncodingRow)[] = [
  "original_char",
  "code",
  "width",
  "note",
];

const rows = ref<EncodingRow[]>([]);
const jsonPath = ref("");
const columnWidths = ref(restoreColumnWidths());
const columnFontSizes = ref(restoreColumnFontSizes());
const fallbackPrefs = ref(restoreFallbackPrefs());
const themeMode = ref<ThemeMode>(restoreThemeMode());
const searchText = ref("");
const isCaseSensitiveSearch = ref(false);
const selectedSearchColumns = ref<(keyof EncodingRow)[]>([...searchableColumns]);
const activeFilters = ref<EncodingFilter[]>([]);
const selectedRowIds = ref<Set<number>>(new Set());
const pendingDeleteIndex = ref<number | null>(null);
const goToRowValue = ref("");
const rowFilterStart = ref("");
const rowFilterEnd = ref("");
const isGoToRowDialogOpen = ref(false);
const isUnmappedCharactersDialogOpen = ref(false);
const isUnusedEncodingsDialogOpen = ref(false);
const isLineLengthDialogOpen = ref(false);
const isLanguageDialogOpen = ref(false);
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
const exportFilteredOnly = ref(false);
const exportExtension = ref<"txt" | "tbl">("txt");
const exportDirection = ref<"code_char" | "char_code">("code_char");
const exportNewline = ref<"crlf" | "lf">("crlf");
const exportFileEncoding = ref<"utf8" | "utf16le">("utf8");
const isExcelExportDialogOpen = ref(false);
const isExportingExcel = ref(false);
const excelExportPath = ref("");
const excelExportFilteredOnly = ref(false);
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
const tableScrollTop = ref(0);
const tableViewportHeight = ref(600);
const rowHeights = ref<Record<number, number>>({});
let nextRowIdentity = 1;
let autoSaveTimer: number | undefined;
let columnWidthSaveTimer: number | undefined;
let unlistenEncodingReadJson: UnlistenFn | undefined;
let unlistenEncodingSaveJson: UnlistenFn | undefined;
let unlistenEncodingSaveJsonAs: UnlistenFn | undefined;
let unlistenEncodingImport: UnlistenFn | undefined;
let unlistenEncodingImportExcel: UnlistenFn | undefined;
let unlistenEncodingExport: UnlistenFn | undefined;
let unlistenEncodingExportExcel: UnlistenFn | undefined;
let unlistenEncodingOpenUnmappedCharacters: UnlistenFn | undefined;
let unlistenEncodingOpenUnusedEncodings: UnlistenFn | undefined;
let unlistenEncodingOpenLineLength: UnlistenFn | undefined;
let unlistenEncodingOpenGoToRow: UnlistenFn | undefined;
let unlistenEncodingClearList: UnlistenFn | undefined;
let unlistenEncodingDeleteSelected: UnlistenFn | undefined;
let unlistenSetLanguage: UnlistenFn | undefined;
let unlistenOpenLanguageDialog: UnlistenFn | undefined;
const rowResizeObservers = new Map<number, ResizeObserver>();
const rowElements = new Map<number, HTMLElement>();

// Encoding rows are edited in place; WeakMap identities let selection survive
// edits without adding internal ids to user-exported JSON/TBL data.
const rowIdentities = new WeakMap<EncodingRow, number>();
const appWindow = getCurrentWindow();
const tableEndSpacerWidth = 24;
let filterCountRefreshFrame: number | undefined;
let filterCountRefreshRun = 0;

const appShellClasses = computed(() => [
  `theme-${themeMode.value}`,
  { "platform-linux": isLinuxPlatform() },
]);
const showsInWindowMenu = computed(() => !isMacPlatform());

const gridTemplateColumns = computed(() =>
  [
    ...columnWidths.value.map((width) => `${width}px`),
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

const unmappedRowCount = computed(() => sentenceRowsForUnmappedCheck().length);
const unusedEncodingTextRowCount = computed(() => sentenceRowsForUnusedEncodingCheck().length);
const lineLengthRowCount = computed(() => sentenceRowsForLineLengthCheck().length);

const exportRowCount = computed(() =>
  exportFilteredOnly.value ? filteredRows.value.length : rows.value.length,
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
  excelExportFilteredOnly.value ? filteredRows.value.length : rows.value.length,
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
  syncWindowTheme();
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
syncAppLanguageMenu();
window.addEventListener("focus", syncAppLanguageMenu);
window.addEventListener("keydown", handleWindowsMenuShortcut);

onBeforeUnmount(() => {
  window.clearTimeout(autoSaveTimer);
  window.clearTimeout(columnWidthSaveTimer);
  if (filterCountRefreshFrame !== undefined) {
    window.cancelAnimationFrame(filterCountRefreshFrame);
  }
  unlistenEncodingReadJson?.();
  unlistenEncodingSaveJson?.();
  unlistenEncodingSaveJsonAs?.();
  unlistenEncodingImport?.();
  unlistenEncodingImportExcel?.();
  unlistenEncodingExport?.();
  unlistenEncodingExportExcel?.();
  unlistenEncodingOpenUnmappedCharacters?.();
  unlistenEncodingOpenUnusedEncodings?.();
  unlistenEncodingOpenLineLength?.();
  unlistenEncodingOpenGoToRow?.();
  unlistenEncodingClearList?.();
  unlistenEncodingDeleteSelected?.();
  unlistenSetLanguage?.();
  unlistenOpenLanguageDialog?.();
  window.removeEventListener("focus", syncAppLanguageMenu);
  rowResizeObservers.forEach((observer) => observer.disconnect());
  rowResizeObservers.clear();
  rowElements.clear();
  window.removeEventListener("keydown", handleWindowsMenuShortcut);
});

function isWindowsPlatform() {
  return /Windows/i.test(window.navigator.userAgent);
}

function isMacPlatform() {
  return /Macintosh|Mac OS X/i.test(window.navigator.userAgent);
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
    { action: "encoding_clear_list", run: () => void clearRows() },
    { action: "encoding_delete_selected", run: () => void deleteSelectedRows() },
    { action: "encoding_unmapped_characters", run: () => void openUnmappedCharactersDialog() },
    { action: "encoding_unused_encodings", run: () => void openUnusedEncodingsDialog() },
    { action: "encoding_line_length", run: () => void openLineLengthDialog() },
    { action: "open_language_dialog", run: () => openLanguageDialog() },
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

  listen("encoding-export-excel", () => {
    openExcelExportDialog();
  })
    .then((unlisten) => {
      unlistenEncodingExportExcel = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register encoding export Excel menu listener.", error);
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

  listen<{ language: AppLanguage }>("set-language", (event) => {
    setAppLanguage(normalizeAppLanguage(event.payload?.language));
  })
    .then((unlisten) => {
      unlistenSetLanguage = unlisten;
    })
    .catch((error) => {
      console.warn("Failed to register language menu listener.", error);
    });

  listen<{ target?: string }>("open-language-dialog", (event) => {
    if (event.payload?.target !== "encoding") return;
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

function addRowAtEnd() {
  rows.value.push(createEmptyRow());
  statusMessage.value = t("message.rowAdded");
}

function addRowAfter(rowIndex: number) {
  rows.value.splice(rowIndex + 1, 0, createEmptyRow());
  if (pendingDeleteIndex.value !== null && pendingDeleteIndex.value > rowIndex) {
    pendingDeleteIndex.value += 1;
  }
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

    rows.value = importedRows;
    jsonPath.value = path;
    selectedRowIds.value = new Set();
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
  | "excelExport"
  | "excelImport"
  | "exportText"
  | "goToRow"
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
  isExcelExportDialogOpen.value = false;
  isExcelImportDialogOpen.value = false;
  isExportDialogOpen.value = false;
  isGoToRowDialogOpen.value = false;
  isImportDialogOpen.value = false;
  isLanguageDialogOpen.value = false;
  isLineLengthDialogOpen.value = false;
  isUnmappedCharactersDialogOpen.value = false;
  isUnusedEncodingsDialogOpen.value = false;
}

function hasActiveEncodingDialogTask() {
  return (
    isCheckingUnmappedCharacters.value ||
    isCheckingUnusedEncodings.value ||
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
  if (characterMatchesSingleUnmappedType(character, "western")) return "western";
  if (characterMatchesSingleUnmappedType(character, "han")) return "han";
  if (characterMatchesSingleUnmappedType(character, "kana")) return "kana";
  if (characterMatchesSingleUnmappedType(character, "hangul")) return "hangul";
  if (characterMatchesSingleUnmappedType(character, "fullwidth")) return "fullwidth";
  if (characterMatchesSingleUnmappedType(character, "halfwidth")) return "halfwidth";
  return "other";
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

function displayUnmappedToken(token: string) {
  if (token === " ") return " ";
  if (token === "\t") return "\\t";
  if (token === "\r") return "\\r";
  if (token === "\n") return "\\n";
  if (token === "\"") return "\\\"";
  return token;
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
    rows.value = importAppendRows.value
      ? [...rows.value, ...importedRows]
      : importedRows;
    if (!importAppendRows.value) {
      jsonPath.value = "";
    }
    selectedRowIds.value = new Set();
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

    rows.value = excelImportAppendRows.value
      ? [...rows.value, ...importedRows]
      : importedRows;
    if (!excelImportAppendRows.value) {
      jsonPath.value = "";
    }
    selectedRowIds.value = new Set();
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
  return excelExportFilteredOnly.value
    ? filteredRows.value.map(({ row, index }) => ({ row, index }))
    : rows.value.map((row, index) => ({ row, index }));
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
  return exportFilteredOnly.value
    ? filteredRows.value.map(({ row }) => row)
    : rows.value;
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
  rows.value = [];
  selectedRowIds.value = new Set();
  pendingDeleteIndex.value = null;
  resetVirtualRowState();
  statusMessage.value = t("message.encodingListCleared");
}

async function deleteSelectedRows() {
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

  const idsToDelete = selectedRowIds.value;
  rows.value = rows.value.filter((row) => !idsToDelete.has(getRowIdentity(row)));
  selectedRowIds.value = new Set();
  pendingDeleteIndex.value = null;
  pruneVirtualRowState();
  statusMessage.value = `${t("message.deletedSelected")}: ${deleteCount} ${t("message.rows")}.`;
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

function handleFilteredSelectionChange(event?: Event) {
  event?.preventDefault();
  toggleFilteredRowSelection(!isEveryFilteredRowSelected.value);
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

function cellStyle(columnIndex: number, fallbackColumn?: "character" | "note") {
  return {
    fontFamily: fallbackColumn ? cjkFontFamily(fallbackPrefs.value[fallbackColumn]) : undefined,
    fontSize: `${columnFontSizes.value[columnIndex]}px`,
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

function syncAppLanguageMenu() {
  invoke("set_app_language_menu", { language: currentLanguage.value }).catch((error) => {
    console.warn("Failed to sync app language menu.", error);
  });
}

function refreshDefaultCheckMessages() {
  const defaultMessages = new Set(["Not checked yet.", "尚未检查。"]);
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
    <nav v-if="showsInWindowMenu" class="encoding-window-menu" aria-label="Encoding menu">
      <details>
        <summary>{{ t("menu.file") }}</summary>
        <div class="encoding-window-menu-panel">
          <button type="button" @click="openJsonFile">{{ t("encoding.readJson") }}</button>
          <button type="button" :disabled="!canSaveJson" @click="saveJsonFile">
            {{ t("encoding.saveJson") }}
          </button>
          <button type="button" @click="saveJsonFileAs">{{ t("main.saveJsonAs") }}</button>
          <button type="button" @click="openImportDialog">{{ t("encoding.importTbl") }}</button>
          <button type="button" @click="openExportDialog">{{ t("encoding.exportTbl") }}</button>
          <button type="button" @click="openExcelImportDialog">{{ t("encoding.importExcel") }}</button>
          <button type="button" @click="openExcelExportDialog">{{ t("encoding.exportExcel") }}</button>
        </div>
      </details>

      <details>
        <summary>{{ t("menu.tools") }}</summary>
        <div class="encoding-window-menu-panel">
          <button type="button" @click="openGoToRowDialog">{{ t("main.goToRow") }}</button>
          <button type="button" @click="openLanguageDialog">{{ t("app.language") }}</button>
          <button type="button" :disabled="rows.length === 0" @click="clearRows">
            {{ t("main.clearList") }}
          </button>
          <button type="button" :disabled="selectedRowCount === 0" @click="deleteSelectedRows">
            {{ t("main.deleteSelected") }}
          </button>
        </div>
      </details>

      <details>
        <summary>{{ t("menu.statistics") }}</summary>
        <div class="encoding-window-menu-panel">
          <button type="button" @click="openUnmappedCharactersDialog">
            {{ t("stats.unmappedCharacters") }}
          </button>
          <button type="button" @click="openUnusedEncodingsDialog">
            {{ t("stats.unusedEncodings") }}
          </button>
          <button type="button" @click="openLineLengthDialog">
            {{ t("lineLength.title") }}
          </button>
        </div>
      </details>
    </nav>

    <section class="encoding-top-panel">
      <header class="encoding-toolbar">
        <div class="encoding-toolbar-controls">
          <select v-model="themeMode" class="theme-select" :aria-label="t('common.theme')">
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
        </div>
        <p class="encoding-file-status">{{ displayedJsonPath }}</p>
      </header>

      <div class="encoding-search-panel">
        <div class="search-main">
          <input
            v-model="searchText"
            type="search"
            :placeholder="t('common.searchText')"
            :aria-label="t('common.searchText')"
          />
          <label class="checkbox-label case-checkbox">
            <input v-model="isCaseSensitiveSearch" type="checkbox" />
            <span>{{ t("main.caseSensitive") }}</span>
          </label>
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
              {{ t("common.all") }} {{ rows.length }}
            </button>
            <button
              v-for="filter in filterOptions"
              :key="filter"
              type="button"
              :class="{ active: activeFilters.includes(filter) }"
              @click="toggleFilter(filter)"
            >
              {{ encodingFilterLabel(filter) }} {{ filterCounts[filter] }}
            </button>
          </div>

        </div>
      </div>

      <div class="encoding-message-tools-row">
        <p
          class="encoding-message-slot"
          :class="{
            'error-message': errorMessage,
            'status-message': !errorMessage && statusMessage,
            empty: !displayedMessage,
          }"
        >
          {{ displayedMessage || "\u00a0" }}
        </p>
        <div class="encoding-row-tools">
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
            <button type="button" :disabled="!hasActiveRowFilter" @click="clearRowFilter">
              {{ t("common.clear") }}
            </button>
          </div>

          <form class="go-to-row" aria-label="Go to row" @submit.prevent="goToRow">
            <label for="encoding-go-to-row">{{ t("main.goToRow") }}</label>
            <input
              id="encoding-go-to-row"
              v-model="goToRowValue"
              type="number"
              min="1"
              :max="rows.length || undefined"
              inputmode="numeric"
            />
            <button type="submit" :disabled="rows.length === 0">{{ t("main.go") }}</button>
          </form>
        </div>
      </div>
    </section>

    <section
      ref="tableWrap"
      class="encoding-table-wrap"
      :aria-label="t('encoding.encodingList')"
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
              <span class="font-size-readout">{{ columnFontSizes[index] }}px</span>
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
            class="resize-handle"
            type="button"
            :aria-label="`Resize ${column.label}`"
            @pointerdown="startResize(index, $event)"
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
          <div class="row-number-cell" :style="rowNumberStyle()">
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
          <div class="textarea-cell" :style="cellStyle(1, 'character')">
            <textarea v-model="row.original_char" aria-label="char" />
            <div class="textarea-measure">{{ row.original_char || " " }}</div>
          </div>
          <div class="textarea-cell" :style="cellStyle(2)">
            <textarea
              v-model="row.code"
              aria-label="code"
              @blur="normalizeEditedCode(row)"
            />
            <div class="textarea-measure">{{ row.code || " " }}</div>
          </div>
          <div class="textarea-cell" :style="cellStyle(3)">
            <textarea v-model="row.width" aria-label="width" />
            <div class="textarea-measure">{{ row.width || " " }}</div>
          </div>
          <div class="textarea-cell" :style="cellStyle(4, 'note')">
            <textarea v-model="row.note" aria-label="note" />
            <div class="textarea-measure">{{ row.note || " " }}</div>
          </div>
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
      v-model:filtered-only="exportFilteredOnly"
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
      v-model:filtered-only="excelExportFilteredOnly"
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

.encoding-window-menu {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 28px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px 4px;
  background: var(--panel-bg);
}

.encoding-window-menu details {
  position: relative;
}

.encoding-window-menu summary {
  min-width: 54px;
  border-radius: 4px;
  padding: 4px 8px;
  color: var(--text);
  font-size: 12px;
  line-height: 1.25;
  list-style: none;
  cursor: pointer;
  user-select: none;
}

.encoding-window-menu summary::-webkit-details-marker {
  display: none;
}

.encoding-window-menu details[open] summary,
.encoding-window-menu summary:hover {
  background: var(--control-hover-bg);
}

.encoding-window-menu-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 20;
  display: grid;
  min-width: 190px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px;
  background: var(--panel-bg);
  box-shadow: 0 12px 30px rgb(15 23 42 / 18%);
}

.encoding-window-menu-panel button {
  min-height: 28px;
  border: 0;
  border-radius: 4px;
  padding: 5px 8px;
  color: var(--text);
  background: transparent;
  font-size: 12px;
  text-align: left;
}

.encoding-window-menu-panel button:hover:not(:disabled) {
  background: var(--control-hover-bg);
}

.encoding-window-menu-panel button:disabled {
  color: var(--muted);
  cursor: not-allowed;
  opacity: 0.65;
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

.encoding-search-panel {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}

.search-main {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) max-content auto;
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

.encoding-row-tools {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.encoding-message-tools-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  grid-column: 1 / -1;
  min-width: 0;
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

.go-to-row,
.row-range-filter {
  display: inline-flex;
  gap: 6px;
  align-items: center;
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
  padding: 4px 10px;
  font-size: 12px;
}

.row-range-filter button:disabled {
  color: var(--muted);
  background: var(--disabled-bg);
  cursor: not-allowed;
}

.checkbox-label {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.case-checkbox {
  white-space: nowrap;
}

.encoding-message-slot {
  margin: 0;
  min-height: 27px;
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

.encoding-message-slot.empty {
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
  .encoding-message-tools-row {
    grid-template-columns: 1fr;
  }

  .encoding-top-panel {
    grid-template-columns: 1fr;
  }
}
</style>
