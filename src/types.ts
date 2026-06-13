export type StateValue =
  | "❓unmarked"
  | "✅passed"
  | "⚠️warning"
  | "❌error"
  | "⭕️temp"
  | "1️⃣custom1"
  | "2️⃣custom2"
  | "3️⃣custom3";

// SentenceRow is the canonical table/document row shape used by JSON,
// Excel/SRT conversion, filtering, and AI translation.
export type SentenceRow = {
  title_addr: string;
  original_text: string;
  translated_text: string;
  note: string;
  state: StateValue;
  file_name: string;
  ai_output: string;
};

// EncodingRow is intentionally small: export-to-TBL uses char/code only, while
// state/width/note drive coverage, byte, and line-length checks inside the app.
export type EncodingRow = {
  original_char: string;
  code: string;
  width: string;
  state: EncodingStateValue;
  note: string;
};

export type EncodingStateValue = "original" | "translated" | "both";

// Input files historically wrap fields in a Sentence object; parsing code keeps
// accepting partial rows so older or hand-edited JSON can still load.
export type SentenceInput = {
  Sentence?: Partial<Record<keyof SentenceRow, unknown>>;
};

// StoredDraft is persisted through Tauri app data. localStorage may still hold
// older drafts briefly during migration.
export type StoredDraft = {
  fileName: string;
  jsonPath?: string;
  rows: SentenceRow[];
};

export type TableSnapshot = {
  fileName: string;
  jsonPath?: string;
  rows: SentenceRow[];
};

export type TextSearchKey =
  | "title_addr"
  | "original_text"
  | "translated_text"
  | "note"
  | "file_name"
  | "ai_output";

export type ThemeMode = "system" | "light" | "dark";
export type TextMatchMode = "contains" | "exact";
export type CjkFallbackMode = "default" | "sc" | "tc" | "jp" | "kr";
export type CjkFallbackColumn = "original" | "translated" | "note";
export type ExportScope = "all" | "filtered" | "selected";
export type ExcelColumnKey = "row_number" | keyof SentenceRow;
export type FileNameImportMode = "none" | "column" | "sheet";

export type ExcelSheet = {
  name: string;
  rows: { row: SentenceRow; index: number }[];
};

export type ImportedExcelSheet = {
  name: string;
  rows: string[][];
};

export type ZipEntry = {
  compressedSize: number;
  compressionMethod: number;
  name: string;
  offset: number;
  size: number;
};

// Stat filters are stored as structured objects because state filters carry a
// value and the other filters are countable categories.
export type StatFilter =
  | { type: "state"; state: StateValue }
  | { type: "empty_translation" }
  | { type: "not_translated" }
  | { type: "original_equals_translated" }
  | { type: "has_note" }
  | { type: "duplicate_title_addr" };

export type StatSnapshot = {
  duplicateTitleAddresses: number;
  emptyTranslations: number;
  originalEqualsTranslated: number;
  memberships: Map<string, Set<number>>;
  notTranslated: number;
  rowsWithNotes: number;
  stateCounts: Record<StateValue, number>;
  total: number;
};
