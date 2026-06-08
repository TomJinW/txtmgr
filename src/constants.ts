import type {
  CjkFallbackMode,
  SentenceRow,
  StateValue,
  TextMatchMode,
  TextSearchKey,
  ThemeMode,
} from "./types";

// Legacy draft key is kept only for one-time migration into Tauri app data.
// Table contents should not be written back to localStorage anymore.
export const draftStorageKey = "txtmgr.currentDraft.v1";

// UI preferences stay in localStorage because they are browser-window scoped
// settings, not user document data.
export const columnFontSizeStorageKey = "txtmgr.columnFontSizes.v1";
export const columnOrderStorageKey = "txtmgr.columnOrder.v1";
export const columnVisibilityStorageKey = "txtmgr.columnVisibility.v1";
export const columnWidthStorageKey = "txtmgr.columnWidths.v1";
export const cjkFallbackStorageKey = "txtmgr.cjkFallback.v1";
export const encodingExcelExportScopeStorageKey = "txtmgr.encodingExcelExportScope.v1";
export const encodingTextExportScopeStorageKey = "txtmgr.encodingTextExportScope.v1";
export const mainExcelExportScopeStorageKey = "txtmgr.mainExcelExportScope.v1";
export const mainSrtExportScopeStorageKey = "txtmgr.mainSrtExportScope.v1";
export const topPanelVisibleStorageKey = "txtmgr.topPanelVisible.v1";
export const themeStorageKey = "txtmgr.theme.v1";
export const maxHistorySteps = 1;
export const defaultColumnFontSizes = [10, 14, 14, 14, 14, 14, 14, 14];
export const defaultColumnWidths = [138, 180, 280, 280, 220, 140, 180, 220];
export const minColumnWidths = [128, 90, 90, 90, 90, 90, 90, 90];
export const estimatedRowHeight = 72;
export const virtualOverscanRows = 12;

// These labels are data values saved into JSON, so changing them is a data
// migration concern, not just a UI translation change.
export const stateOptions: StateValue[] = [
  "❓unmarked",
  "✅passed",
  "⚠️warning",
  "❌error",
  "⭕️temp",
  "1️⃣custom1",
  "2️⃣custom2",
  "3️⃣custom3",
];

export const themeOptions: { label: string; value: ThemeMode }[] = [
  { label: "System", value: "system" },
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
];

export const textMatchOptions: { label: string; value: TextMatchMode }[] = [
  { label: "Contains", value: "contains" },
  { label: "Exact", value: "exact" },
];

export const cjkFallbackOptions: { label: string; value: CjkFallbackMode }[] = [
  { label: "Default", value: "default" },
  { label: "S.Chinese", value: "sc" },
  { label: "T.Chinese", value: "tc" },
  { label: "Japanese", value: "jp" },
  { label: "Korean", value: "kr" },
];

// The app's Sentence JSON order is mirrored here for JSON/Excel import/export
// and for table rendering.
export const excelDataColumnKeys: (keyof SentenceRow)[] = [
  "title_addr",
  "original_text",
  "translated_text",
  "note",
  "state",
  "file_name",
  "ai_output",
];

export const columns = [
  { key: "row_number", label: "#" },
  { key: "title_addr", label: "title_addr" },
  { key: "original_text", label: "original_text" },
  { key: "translated_text", label: "translated_text" },
  { key: "note", label: "note" },
  { key: "state", label: "state" },
  { key: "file_name", label: "file_name" },
  { key: "ai_output", label: "ai_output" },
] as const;

export const textSearchColumns: { key: TextSearchKey; label: string }[] = [
  { key: "title_addr", label: "title_addr" },
  { key: "original_text", label: "original_text" },
  { key: "translated_text", label: "translated_text" },
  { key: "note", label: "note" },
  { key: "file_name", label: "file_name" },
  { key: "ai_output", label: "ai_output" },
];
