/**
 * Parses pasted spreadsheet cells (tab-separated) or CSV text into rows of cells.
 * Handles quoted fields with commas, tabs, doubled quotes and newlines. Blank rows are dropped.
 */
export function parseTable(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const delim = (src.split(/\r?\n/, 1)[0] ?? "").includes("\t") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    if (row.some((c) => c.trim() !== "")) rows.push(row.map((c) => c.trim()));
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) endCell();
    else if (ch === "\n") endRow();
    else if (ch !== "\r") cell += ch;
  }
  endRow();
  return rows;
}
