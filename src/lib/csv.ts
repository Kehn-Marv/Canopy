/**
 * A small RFC 4180 parser.
 *
 * Written by hand rather than pulled in as a dependency because the preview
 * path must stay predictable: it never evaluates content, it caps rows and
 * columns before they reach the DOM, and it degrades to plain text instead of
 * throwing on malformed input.
 */

import { PREVIEW_LIMITS } from './filetype';

export interface ParsedTable {
  header: string[];
  rows: string[][];
  totalRows: number;
  truncated: boolean;
  delimiter: string;
}

/** Guesses the delimiter from the first non-empty line. */
export function sniffDelimiter(sample: string): string {
  const line = sample.split(/\r?\n/).find((l) => l.trim().length) ?? '';
  const candidates = [',', '\t', ';', '|'];
  let best = ',';
  let bestCount = 0;
  for (const candidate of candidates) {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') quoted = !quoted;else
      if (char === candidate && !quoted) count += 1;
    }
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

export function parseDelimited(text: string, delimiter?: string): ParsedTable {
  const sep = delimiter ?? sniffDelimiter(text.slice(0, 8_000));
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let truncated = false;
  let totalRows = 0;

  const pushField = () => {
    row.push(field.length > PREVIEW_LIMITS.cellChars ? `${field.slice(0, PREVIEW_LIMITS.cellChars)}…` : field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    totalRows += 1;
    if (rows.length < PREVIEW_LIMITS.tableRows + 1) {
      rows.push(row.slice(0, PREVIEW_LIMITS.tableCols));
    } else {
      truncated = true;
    }
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === sep) {
      pushField();
      continue;
    }
    if (char === '\n') {
      pushRow();
      continue;
    }
    if (char === '\r') continue;
    field += char;
  }
  if (field.length || row.length) pushRow();

  const nonEmpty = rows.filter((r) => r.some((cell) => cell.trim().length));
  const [header = [], ...body] = nonEmpty;
  return {
    header,
    rows: body,
    totalRows: Math.max(0, totalRows - 1),
    truncated,
    delimiter: sep
  };
}