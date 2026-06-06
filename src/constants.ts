import type {
  CjkFallbackMode,
  SentenceRow,
  StateValue,
  TextMatchMode,
  TextSearchKey,
  ThemeMode,
} from "./types";

export const draftStorageKey = "txtmgr.currentDraft.v1";
export const columnFontSizeStorageKey = "txtmgr.columnFontSizes.v1";
export const columnWidthStorageKey = "txtmgr.columnWidths.v1";
export const cjkFallbackStorageKey = "txtmgr.cjkFallback.v1";
export const themeStorageKey = "txtmgr.theme.v1";
export const maxHistorySteps = 2;
export const defaultColumnFontSizes = [10, 14, 14, 14, 14, 14, 14];
export const defaultColumnWidths = [138, 180, 280, 280, 220, 140, 180];
export const minColumnWidths = [128, 90, 90, 90, 90, 90, 90];
export const estimatedRowHeight = 72;
export const virtualOverscanRows = 12;

export const stateOptions: StateValue[] = [
  "❓unmarked",
  "✅passed",
  "⚠️warning",
  "❌error",
];

export const themeOptions: { label: string; value: ThemeMode }[] = [
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

export const excelDataColumnKeys: (keyof SentenceRow)[] = [
  "title_addr",
  "original_text",
  "translated_text",
  "note",
  "state",
  "file_name",
];

export const columns = [
  { key: "row_number", label: "#" },
  { key: "title_addr", label: "title_addr" },
  { key: "original_text", label: "original_text" },
  { key: "translated_text", label: "translated_text" },
  { key: "note", label: "note" },
  { key: "state", label: "state" },
  { key: "file_name", label: "file_name" },
] as const;

export const textSearchColumns: { key: TextSearchKey; label: string }[] = [
  { key: "title_addr", label: "title_addr" },
  { key: "original_text", label: "original_text" },
  { key: "translated_text", label: "translated_text" },
  { key: "note", label: "note" },
  { key: "file_name", label: "file_name" },
];
