export function parseClipboardTable(text: string) {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    const nextCharacter = normalized[index + 1];

    if (character === "\"") {
      if (inQuotes && nextCharacter === "\"") {
        cell += "\"";
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && character === "\t") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!inQuotes && character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += character;
  }

  row.push(cell);
  rows.push(row);

  if (rows.length > 1 && rows[rows.length - 1]?.length === 1 && rows[rows.length - 1]?.[0] === "") {
    rows.pop();
  }

  return rows;
}
