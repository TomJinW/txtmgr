import { columns, excelDataColumnKeys } from "./constants";
import type {
  ExcelColumnKey,
  ExcelSheet,
  ImportedExcelSheet,
  SentenceRow,
  ZipEntry,
} from "./types";

export function ensureXlsxExtension(path: string) {
  return /\.xlsx$/i.test(path) ? path : `${path}.xlsx`;
}

export function excelCellText(cells: string[], oneBasedColumn: number) {
  return cells[oneBasedColumn - 1] ?? "";
}

export function requiredPositiveInteger(value: unknown, label: string) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a number from 1.`);
  }

  return parsed;
}

export function optionalPositiveInteger(value: unknown, label: string) {
  const text = String(value).trim();
  if (text === "") return null;
  return requiredPositiveInteger(text, label);
}

export function excelSheetsForRows(
  exportRows: { row: SentenceRow; index: number }[],
  splitByFileName: boolean,
): ExcelSheet[] {
  if (!splitByFileName) {
    return [{ name: "Sentences", rows: exportRows }];
  }

  const groups = new Map<string, { row: SentenceRow; index: number }[]>();
  for (const item of exportRows) {
    const sheetKey = item.row.file_name.trim() || "unamedsheet";
    groups.set(sheetKey, [...(groups.get(sheetKey) ?? []), item]);
  }

  return Array.from(groups, ([name, sheetRows]) => ({
    name,
    rows: sheetRows,
  }));
}

export function buildXlsxWorkbook(
  sheets: ExcelSheet[],
  includeRowNumber: boolean,
  columnWidths: number[],
) {
  const safeSheets = uniqueSheetNames(sheets);
  const files: { path: string; content: string | Uint8Array }[] = [
    { path: "[Content_Types].xml", content: xlsxContentTypesXml(safeSheets.length) },
    { path: "_rels/.rels", content: xlsxRootRelsXml() },
    { path: "xl/workbook.xml", content: xlsxWorkbookXml(safeSheets) },
    {
      path: "xl/_rels/workbook.xml.rels",
      content: xlsxWorkbookRelsXml(safeSheets.length),
    },
    { path: "xl/styles.xml", content: xlsxStylesXml() },
  ];

  safeSheets.forEach((sheet, index) => {
    files.push({
      path: `xl/worksheets/sheet${index + 1}.xml`,
      content: xlsxWorksheetXml(sheet.rows, includeRowNumber, columnWidths),
    });
  });

  return createZipFile(files);
}

export async function readXlsxWorkbook(bytes: Uint8Array) {
  const zipFiles = await unzipXlsxFiles(bytes);
  const workbookXml = zipText(zipFiles, "xl/workbook.xml");
  const workbookRelsXml = zipText(zipFiles, "xl/_rels/workbook.xml.rels");
  const sharedStringsXml = zipFiles.get("xl/sharedStrings.xml");
  const sharedStrings = sharedStringsXml
    ? parseSharedStrings(sharedStringsXml)
    : [];
  const workbookDoc = parseXml(workbookXml);
  const relTargets = parseWorkbookRelationships(workbookRelsXml);
  const sheets = Array.from(workbookDoc.getElementsByTagName("sheet"));
  const importedSheets: ImportedExcelSheet[] = [];

  for (const sheet of sheets) {
    const relationshipId = sheet.getAttribute("r:id");
    const target = relationshipId ? relTargets.get(relationshipId) : null;
    if (!target) continue;

    const sheetXml = zipText(zipFiles, normalizeZipPath(`xl/${target}`));
    importedSheets.push({
      name: sheet.getAttribute("name") || `Sheet${importedSheets.length + 1}`,
      rows: parseWorksheetRows(sheetXml, sharedStrings),
    });
  }

  return importedSheets;
}

function uniqueSheetNames(sheets: ExcelSheet[]) {
  const used = new Set<string>();

  return sheets.map((sheet, index) => {
    const fallbackName = `Sheet${index + 1}`;
    const baseName = sanitizeExcelSheetName(sheet.name) || fallbackName;
    let nextName = baseName;
    let suffix = 2;

    while (used.has(nextName.toLowerCase())) {
      const suffixText = ` ${suffix}`;
      nextName = `${baseName.slice(0, 31 - suffixText.length)}${suffixText}`;
      suffix += 1;
    }

    used.add(nextName.toLowerCase());
    return { ...sheet, name: nextName };
  });
}

function sanitizeExcelSheetName(name: string) {
  return name.replace(/[\\/?*:[\]]/g, " ").trim().slice(0, 31);
}

function xlsxWorksheetXml(
  exportRows: { row: SentenceRow; index: number }[],
  includeRowNumber: boolean,
  columnWidths: number[],
) {
  const columnKeys: ExcelColumnKey[] = [
    ...(includeRowNumber ? (["row_number"] as const) : []),
    ...excelDataColumnKeys,
  ];
  const headerRow = xlsxRowXml(
    1,
    columnKeys.map((key) => excelColumnLabel(key)),
    1,
  );
  const dataRows = exportRows
    .map(({ row, index }, rowOffset) =>
      xlsxRowXml(
        rowOffset + 2,
        columnKeys.map((key) => excelCellValue(row, index, key)),
        2,
      ),
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cols>${columnKeys.map((key, index) => excelColumnWidthXml(key, index, columnWidths)).join("")}</cols>
  <sheetData>${headerRow}${dataRows}</sheetData>
</worksheet>`;
}

function excelColumnLabel(key: ExcelColumnKey) {
  return key === "row_number" ? "#" : key;
}

function excelCellValue(row: SentenceRow, rowIndex: number, key: ExcelColumnKey) {
  return key === "row_number" ? String(rowIndex + 1) : row[key];
}

function excelColumnWidthXml(
  key: ExcelColumnKey,
  index: number,
  columnWidths: number[],
) {
  const widthIndex =
    key === "row_number" ? 0 : columns.findIndex((column) => column.key === key);
  const pixelWidth = columnWidths[widthIndex] ?? columnWidths[index] ?? 140;
  const excelWidth = Math.max(
    8,
    Math.min(80, Math.round((pixelWidth / 7) * 10) / 10),
  );
  const columnNumber = index + 1;

  return `<col min="${columnNumber}" max="${columnNumber}" width="${excelWidth}" customWidth="1"/>`;
}

function xlsxRowXml(rowNumber: number, values: string[], styleIndex: number) {
  return `<row r="${rowNumber}">${values
    .map((value, columnIndex) =>
      xlsxCellXml(columnName(columnIndex + 1), rowNumber, value, styleIndex),
    )
    .join("")}</row>`;
}

function xlsxCellXml(
  column: string,
  rowNumber: number,
  value: string,
  styleIndex: number,
) {
  return `<c r="${column}${rowNumber}" t="inlineStr" s="${styleIndex}"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
}

function columnName(columnNumber: number) {
  let name = "";
  let value = columnNumber;

  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }

  return name;
}

function xlsxContentTypesXml(sheetCount: number) {
  const worksheetOverrides = Array.from({ length: sheetCount }, (_value, index) =>
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  ).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${worksheetOverrides}
</Types>`;
}

function xlsxRootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function xlsxWorkbookXml(sheets: ExcelSheet[]) {
  const sheetNodes = sheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheetNodes}</sheets>
</workbook>`;
}

function xlsxWorkbookRelsXml(sheetCount: number) {
  const sheetRelationships = Array.from({ length: sheetCount }, (_value, index) =>
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
  ).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheetRelationships}
  <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function xlsxStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><name val="Calibri"/></font>
    <font><b/><sz val="11"/><name val="Calibri"/></font>
  </fonts>
  <fills count="2">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
  </fills>
  <borders count="1"><border/></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

async function unzipXlsxFiles(bytes: Uint8Array) {
  const entries = zipEntries(bytes);
  const files = new Map<string, string>();
  const decoder = new TextDecoder();

  for (const entry of entries) {
    if (!entry.name.endsWith(".xml") && !entry.name.endsWith(".rels")) continue;

    const content = await zipEntryBytes(bytes, entry);
    files.set(normalizeZipPath(entry.name), decoder.decode(content));
  }

  return files;
}

function zipEntries(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findZipEndRecord(bytes);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  let directoryOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(directoryOffset, true) !== 0x02014b50) {
      throw new Error("Invalid Excel ZIP central directory.");
    }

    const compressionMethod = view.getUint16(directoryOffset + 10, true);
    const compressedSize = view.getUint32(directoryOffset + 20, true);
    const size = view.getUint32(directoryOffset + 24, true);
    const nameLength = view.getUint16(directoryOffset + 28, true);
    const extraLength = view.getUint16(directoryOffset + 30, true);
    const commentLength = view.getUint16(directoryOffset + 32, true);
    const offset = view.getUint32(directoryOffset + 42, true);
    const nameStart = directoryOffset + 46;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));

    entries.push({
      compressedSize,
      compressionMethod,
      name: normalizeZipPath(name),
      offset,
      size,
    });
    directoryOffset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

function findZipEndRecord(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minOffset = Math.max(0, bytes.length - 0xffff - 22);

  for (let offset = bytes.length - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) return offset;
  }

  throw new Error("Invalid Excel ZIP file.");
}

async function zipEntryBytes(bytes: Uint8Array, entry: ZipEntry) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(entry.offset, true) !== 0x04034b50) {
    throw new Error(`Invalid ZIP entry: ${entry.name}`);
  }

  const nameLength = view.getUint16(entry.offset + 26, true);
  const extraLength = view.getUint16(entry.offset + 28, true);
  const dataStart = entry.offset + 30 + nameLength + extraLength;
  const compressed = bytes.slice(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) return compressed;
  if (entry.compressionMethod === 8) return inflateRawZipEntry(compressed, entry.size);

  throw new Error(`Unsupported Excel ZIP compression method: ${entry.compressionMethod}`);
}

async function inflateRawZipEntry(bytes: Uint8Array, expectedSize: number) {
  if (!("DecompressionStream" in globalThis)) {
    throw new Error("This platform cannot decompress standard Excel files.");
  }

  const stream = new Blob([bytes]).stream().pipeThrough(
    new DecompressionStream("deflate-raw"),
  );
  const decompressed = new Uint8Array(await new Response(stream).arrayBuffer());
  if (expectedSize > 0 && decompressed.length !== expectedSize) {
    throw new Error("Excel ZIP entry did not decompress correctly.");
  }

  return decompressed;
}

function zipText(files: Map<string, string>, path: string) {
  const normalizedPath = normalizeZipPath(path);
  const text = files.get(normalizedPath);
  if (text === undefined) {
    throw new Error(`Excel file is missing ${normalizedPath}.`);
  }

  return text;
}

function normalizeZipPath(path: string) {
  const parts: string[] = [];
  for (const part of path.replace(/\\/g, "/").split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }

  return parts.join("/");
}

function parseXml(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error("Excel XML could not be parsed.");
  }

  return document;
}

function parseWorkbookRelationships(xml: string) {
  const document = parseXml(xml);
  const relationships = new Map<string, string>();

  for (const relationship of Array.from(document.getElementsByTagName("Relationship"))) {
    const id = relationship.getAttribute("Id");
    const target = relationship.getAttribute("Target");
    if (id && target) relationships.set(id, target);
  }

  return relationships;
}

function parseSharedStrings(xml: string) {
  const document = parseXml(xml);

  return Array.from(document.getElementsByTagName("si")).map((item) =>
    Array.from(item.getElementsByTagName("t"))
      .map((textNode) => textNode.textContent ?? "")
      .join(""),
  );
}

function parseWorksheetRows(xml: string, sharedStrings: string[]) {
  const document = parseXml(xml);
  const rowElements = Array.from(document.getElementsByTagName("row"));
  const parsedRows: string[][] = [];

  for (const rowElement of rowElements) {
    const rowNumber = Number.parseInt(rowElement.getAttribute("r") ?? "", 10);
    const rowIndex = Number.isInteger(rowNumber) && rowNumber > 0
      ? rowNumber - 1
      : parsedRows.length;
    const values = parsedRows[rowIndex] ?? [];

    Array.from(rowElement.getElementsByTagName("c")).forEach((cell, cellIndex) => {
      const cellReference = cell.getAttribute("r") ?? "";
      const columnIndex = columnIndexFromCellReference(cellReference) ?? cellIndex;
      values[columnIndex] = parseWorksheetCell(cell, sharedStrings);
    });

    parsedRows[rowIndex] = values;
  }

  return parsedRows;
}

function parseWorksheetCell(cell: Element, sharedStrings: string[]) {
  const type = cell.getAttribute("t");
  const inlineText = cell.getElementsByTagName("is")[0];
  const value = directChildText(cell, "v");

  if (type === "inlineStr" && inlineText) {
    return Array.from(inlineText.getElementsByTagName("t"))
      .map((textNode) => textNode.textContent ?? "")
      .join("");
  }

  if (type === "s") {
    const sharedStringIndex = Number.parseInt(value, 10);
    return sharedStrings[sharedStringIndex] ?? "";
  }

  if (type === "str") return value;
  if (type === "b") return value === "1" ? "TRUE" : "FALSE";
  return value;
}

function directChildText(element: Element, tagName: string) {
  const child = Array.from(element.childNodes).find(
    (node) =>
      node.nodeType === Node.ELEMENT_NODE &&
      (node as Element).localName === tagName,
  ) as Element | undefined;

  return child?.textContent ?? "";
}

function columnIndexFromCellReference(reference: string) {
  const match = /^([A-Z]+)/i.exec(reference);
  if (!match) return null;

  return lettersToColumnNumber(match[1]) - 1;
}

function lettersToColumnNumber(letters: string) {
  let value = 0;
  for (const letter of letters.toUpperCase()) {
    value = value * 26 + letter.charCodeAt(0) - 64;
  }

  return value;
}

function createZipFile(files: { path: string; content: string | Uint8Array }[]) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const contentBytes =
      typeof file.content === "string" ? encoder.encode(file.content) : file.content;
    const crc = crc32(contentBytes);
    const localHeader = zipLocalHeader(nameBytes, contentBytes.length, crc);
    const centralHeader = zipCentralHeader(
      nameBytes,
      contentBytes.length,
      crc,
      offset,
    );

    localParts.push(localHeader, contentBytes);
    centralParts.push(centralHeader);
    offset += localHeader.length + contentBytes.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralParts.reduce(
    (total, part) => total + part.length,
    0,
  );
  const endRecord = zipEndRecord(
    files.length,
    centralDirectorySize,
    centralDirectoryOffset,
  );

  return concatUint8Arrays([...localParts, ...centralParts, endRecord]);
}

function zipLocalHeader(nameBytes: Uint8Array, size: number, crc: number) {
  const header = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true);
  header.set(nameBytes, 30);

  return header;
}

function zipCentralHeader(
  nameBytes: Uint8Array,
  size: number,
  crc: number,
  offset: number,
) {
  const header = new Uint8Array(46 + nameBytes.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
  header.set(nameBytes, 46);

  return header;
}

function zipEndRecord(
  fileCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number,
) {
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);

  return header;
}

function concatUint8Arrays(parts: Uint8Array[]) {
  const totalLength = parts.reduce((total, part) => total + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
