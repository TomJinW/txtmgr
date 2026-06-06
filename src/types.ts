export type StateValue = "❓unmarked" | "✅passed" | "⚠️warning" | "❌error";

export type SentenceRow = {
  title_addr: string;
  original_text: string;
  translated_text: string;
  note: string;
  state: StateValue;
  file_name: string;
};

export type EncodingRow = {
  original_char: string;
  code: string;
  width: string;
  note: string;
};

export type SentenceInput = {
  Sentence?: Partial<Record<keyof SentenceRow, unknown>>;
};

export type StoredDraft = {
  fileName: string;
  rows: SentenceRow[];
};

export type TableSnapshot = {
  fileName: string;
  rows: SentenceRow[];
};

export type TextSearchKey =
  | "title_addr"
  | "original_text"
  | "translated_text"
  | "note"
  | "file_name";

export type ThemeMode = "light" | "dark";
export type TextMatchMode = "contains" | "exact";
export type CjkFallbackMode = "default" | "sc" | "tc" | "jp" | "kr";
export type CjkFallbackColumn = "original" | "translated" | "note";
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

export type StatFilter =
  | { type: "state"; state: StateValue }
  | { type: "empty_translation" }
  | { type: "not_translated" }
  | { type: "has_note" }
  | { type: "duplicate_title_addr" };

export type StatSnapshot = {
  duplicateTitleAddresses: number;
  emptyTranslations: number;
  memberships: Map<string, Set<number>>;
  notTranslated: number;
  rowsWithNotes: number;
  stateCounts: Record<StateValue, number>;
  total: number;
};
