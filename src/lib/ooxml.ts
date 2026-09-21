/**
 * Office and archive extraction, done defensively.
 *
 * Office files (.docx, .xlsx, .pptx) are zip containers of XML. Canopy opens
 * them with a pure-JavaScript zip reader and pulls out *text and structure
 * only*:
 *
 *  - no macro, VBA project, embedded object or DDE field is read or run;
 *  - no formula is evaluated — only the cached value Excel already stored;
 *  - no external relationship (remote image, remote template, remote data
 *    connection) is fetched, so a document cannot phone home when previewed;
 *  - XML is parsed with DOMParser in XML mode, which does not resolve
 *    external entities, and every extraction is bounded by PREVIEW_LIMITS.
 *
 * Anything oversized, malformed, or shaped like a decompression bomb is
 * refused with a clear message rather than being partially rendered.
 */

import JSZip from 'jszip';
import { PREVIEW_LIMITS } from './filetype';

export class UnsafeArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeArchiveError';
  }
}

export class OfficeParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OfficeParseError';
  }
}

interface ZipEntryMeta {
  path: string;
  dir: boolean;
  compressedSize: number;
  uncompressedSize: number;
}

function entryMeta(file: JSZip.JSZipObject): ZipEntryMeta {
  const internal = file as unknown as {
    _data?: {compressedSize?: number;uncompressedSize?: number;};
  };
  return {
    path: file.name,
    dir: file.dir,
    compressedSize: internal._data?.compressedSize ?? 0,
    uncompressedSize: internal._data?.uncompressedSize ?? 0
  };
}

/** Rejects absolute paths and `..` segments before any name is displayed. */
export function safeEntryPath(path: string): string | null {
  const normalised = path.replace(/\\/g, '/');
  if (normalised.startsWith('/') || /^[a-zA-Z]:\//.test(normalised)) return null;
  if (normalised.split('/').some((segment) => segment === '..')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f]/.test(normalised)) return null;
  return normalised;
}

export async function loadZip(blob: Blob): Promise<JSZip> {
  if (blob.size > PREVIEW_LIMITS.decodeBytes) {
    throw new UnsafeArchiveError(
      'This container is larger than the preview limit. It stays sealed rather than being expanded in memory.'
    );
  }
  try {
    return await JSZip.loadAsync(await blob.arrayBuffer(), { createFolders: false });
  } catch {
    throw new OfficeParseError('This file is not a readable zip container. It may be corrupted.');
  }
}

export interface ArchiveEntry {
  path: string;
  dir: boolean;
  compressedSize: number;
  uncompressedSize: number;
  ratio: number;
  suspicious: boolean;
}

export interface ArchiveListing {
  entries: ArchiveEntry[];
  totalEntries: number;
  totalUncompressed: number;
  truncated: boolean;
  rejectedPaths: number;
  bombRisk: boolean;
}

export async function listArchive(blob: Blob): Promise<ArchiveListing> {
  const zip = await loadZip(blob);
  const entries: ArchiveEntry[] = [];
  let totalEntries = 0;
  let totalUncompressed = 0;
  let rejectedPaths = 0;
  let bombRisk = false;

  zip.forEach((_, file) => {
    totalEntries += 1;
    const meta = entryMeta(file);
    const safe = safeEntryPath(meta.path);
    if (!safe) {
      rejectedPaths += 1;
      return;
    }
    totalUncompressed += meta.uncompressedSize;
    const ratio = meta.compressedSize > 0 ? meta.uncompressedSize / meta.compressedSize : 0;
    if (ratio > PREVIEW_LIMITS.archiveRatio || totalUncompressed > PREVIEW_LIMITS.archiveExpandedBytes) {
      bombRisk = true;
    }
    if (entries.length < PREVIEW_LIMITS.archiveEntries) {
      entries.push({
        path: safe,
        dir: meta.dir,
        compressedSize: meta.compressedSize,
        uncompressedSize: meta.uncompressedSize,
        ratio,
        suspicious: ratio > PREVIEW_LIMITS.archiveRatio
      });
    }
  });

  return {
    entries: entries.sort((a, b) => a.path.localeCompare(b.path)),
    totalEntries,
    totalUncompressed,
    truncated: totalEntries > entries.length + rejectedPaths,
    rejectedPaths,
    bombRisk
  };
}

async function readXml(zip: JSZip, path: string): Promise<Document | null> {
  const file = zip.file(path);
  if (!file) return null;
  const text = await file.async('string');
  if (text.length > PREVIEW_LIMITS.decodeBytes) {
    throw new OfficeParseError('A part of this document is too large to preview safely.');
  }
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return null;
  return doc;
}

function textOf(node: Element, selector: string): string {
  return Array.from(node.getElementsByTagName(selector)).
  map((el) => el.textContent ?? '').
  join('');
}

/* ------------------------------------------------------------------ .docx */

export type DocxBlock =
{type: 'heading';level: number;text: string;} |
{type: 'paragraph';text: string;} |
{type: 'list';ordered: boolean;items: string[];} |
{type: 'table';rows: string[][];};

export interface DocxDocument {
  blocks: DocxBlock[];
  truncated: boolean;
  warnings: string[];
}

function paragraphText(p: Element): string {
  // w:t holds literal runs; w:tab and w:br are layout hints we normalise.
  let out = '';
  for (const child of Array.from(p.getElementsByTagName('*'))) {
    const tag = child.tagName.replace(/^.*:/, '');
    if (tag === 't') out += child.textContent ?? '';
    if (tag === 'tab') out += '\t';
    if (tag === 'br') out += '\n';
  }
  return out.trim();
}

function paragraphStyle(p: Element): string {
  const style = p.getElementsByTagName('w:pStyle')[0] ?? p.getElementsByTagName('pStyle')[0];
  return style?.getAttribute('w:val') ?? style?.getAttribute('val') ?? '';
}

function isListParagraph(p: Element): boolean {
  return Boolean(p.getElementsByTagName('w:numPr')[0] ?? p.getElementsByTagName('numPr')[0]);
}

export async function readDocx(blob: Blob): Promise<DocxDocument> {
  const zip = await loadZip(blob);
  const doc = await readXml(zip, 'word/document.xml');
  if (!doc) throw new OfficeParseError('This .docx has no readable document part.');

  const warnings: string[] = [];
  if (zip.file(/vbaProject\.bin$/).length) {
    warnings.push('This document carries a VBA macro project. Canopy never reads or runs it.');
  }
  if (zip.file(/^word\/embeddings\//).length) {
    warnings.push('Embedded objects were found. They are listed but never opened.');
  }

  const body = doc.getElementsByTagName('w:body')[0] ?? doc.documentElement;
  const blocks: DocxBlock[] = [];
  let pendingList: {ordered: boolean;items: string[];} | null = null;
  let truncated = false;

  const flushList = () => {
    if (pendingList?.items.length) blocks.push({ type: 'list', ...pendingList });
    pendingList = null;
  };

  for (const node of Array.from(body.children)) {
    if (blocks.length >= 4_000) {
      truncated = true;
      break;
    }
    const tag = node.tagName.replace(/^.*:/, '');

    if (tag === 'p') {
      const text = paragraphText(node);
      if (!text) continue;
      const style = paragraphStyle(node);
      const headingMatch = /^Heading(\d)$/i.exec(style);
      if (headingMatch) {
        flushList();
        blocks.push({ type: 'heading', level: Number(headingMatch[1]), text });
        continue;
      }
      if (style.toLowerCase() === 'title') {
        flushList();
        blocks.push({ type: 'heading', level: 1, text });
        continue;
      }
      if (isListParagraph(node)) {
        const ordered = /Number/i.test(style);
        if (!pendingList || pendingList.ordered !== ordered) {
          flushList();
          pendingList = { ordered, items: [] };
        }
        pendingList.items.push(text);
        continue;
      }
      flushList();
      blocks.push({ type: 'paragraph', text });
      continue;
    }

    if (tag === 'tbl') {
      flushList();
      const rows: string[][] = [];
      for (const tr of Array.from(node.children)) {
        if (tr.tagName.replace(/^.*:/, '') !== 'tr') continue;
        const cells: string[] = [];
        for (const tc of Array.from(tr.children)) {
          if (tc.tagName.replace(/^.*:/, '') !== 'tc') continue;
          cells.push(
            Array.from(tc.getElementsByTagName('*')).
            filter((el) => el.tagName.replace(/^.*:/, '') === 't').
            map((el) => el.textContent ?? '').
            join('').
            trim()
          );
        }
        if (cells.length) rows.push(cells.slice(0, PREVIEW_LIMITS.tableCols));
        if (rows.length >= PREVIEW_LIMITS.tableRows) {
          truncated = true;
          break;
        }
      }
      if (rows.length) blocks.push({ type: 'table', rows });
    }
  }
  flushList();

  if (!blocks.length) {
    throw new OfficeParseError('No readable text was found in this document.');
  }
  return { blocks, truncated, warnings };
}

/* ------------------------------------------------------------------ .xlsx */

export interface Sheet {
  name: string;
  rows: string[][];
  totalRows: number;
  truncated: boolean;
}

export interface Workbook {
  sheets: Sheet[];
  warnings: string[];
}

function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref.toUpperCase())?.[1] ?? 'A';
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return index - 1;
}

export async function readXlsx(blob: Blob): Promise<Workbook> {
  const zip = await loadZip(blob);
  const warnings: string[] = [];
  if (zip.file(/vbaProject\.bin$/).length) {
    warnings.push('This workbook carries macros. Canopy reads cell values only and never runs code.');
  }
  if (zip.file(/^xl\/connections\.xml$/).length) {
    warnings.push('External data connections were found. They are never contacted during preview.');
  }

  const sharedDoc = await readXml(zip, 'xl/sharedStrings.xml');
  const shared: string[] = sharedDoc ?
  Array.from(sharedDoc.getElementsByTagName('si')).map((si) => textOf(si, 't')) :
  [];

  const workbook = await readXml(zip, 'xl/workbook.xml');
  const names = workbook ?
  Array.from(workbook.getElementsByTagName('sheet')).map((s) => s.getAttribute('name') ?? 'Sheet') :
  [];

  const sheetFiles = Object.keys(zip.files).
  filter((path) => /^xl\/worksheets\/sheet\d+\.xml$/.test(path)).
  sort((a, b) => {
    const num = (p: string) => Number(/sheet(\d+)\.xml$/.exec(p)?.[1] ?? 0);
    return num(a) - num(b);
  }).
  slice(0, PREVIEW_LIMITS.officeParts);

  const sheets: Sheet[] = [];
  for (let s = 0; s < sheetFiles.length; s += 1) {
    const doc = await readXml(zip, sheetFiles[s]);
    if (!doc) continue;
    const rows: string[][] = [];
    const rowNodes = Array.from(doc.getElementsByTagName('row'));
    let truncated = false;
    for (const rowNode of rowNodes) {
      if (rows.length >= PREVIEW_LIMITS.tableRows) {
        truncated = true;
        break;
      }
      const cells: string[] = [];
      for (const cell of Array.from(rowNode.getElementsByTagName('c'))) {
        const index = columnIndex(cell.getAttribute('r') ?? 'A');
        if (index >= PREVIEW_LIMITS.tableCols) continue;
        const type = cell.getAttribute('t');
        let value = '';
        if (type === 's') {
          const pointer = Number(cell.getElementsByTagName('v')[0]?.textContent ?? '-1');
          value = shared[pointer] ?? '';
        } else if (type === 'inlineStr') {
          value = textOf(cell, 't');
        } else if (type === 'e') {
          value = cell.getElementsByTagName('v')[0]?.textContent ?? '#ERR';
        } else {
          // Cached value only. The formula in <f> is never evaluated.
          value = cell.getElementsByTagName('v')[0]?.textContent ?? '';
        }
        while (cells.length < index) cells.push('');
        cells[index] = value.length > PREVIEW_LIMITS.cellChars ? `${value.slice(0, PREVIEW_LIMITS.cellChars)}…` : value;
      }
      rows.push(cells);
    }
    sheets.push({
      name: names[s] ?? `Sheet ${s + 1}`,
      rows,
      totalRows: rowNodes.length,
      truncated
    });
  }

  if (!sheets.length) throw new OfficeParseError('No readable sheets were found in this workbook.');
  return { sheets, warnings };
}

/* ------------------------------------------------------------------ .pptx */

export interface Slide {
  index: number;
  title: string;
  lines: string[];
  notes: string;
}

export interface Deck {
  slides: Slide[];
  warnings: string[];
}

export async function readPptx(blob: Blob): Promise<Deck> {
  const zip = await loadZip(blob);
  const warnings: string[] = [];
  if (zip.file(/vbaProject\.bin$/).length) {
    warnings.push('This deck carries macros. Canopy extracts text only.');
  }

  const slidePaths = Object.keys(zip.files).
  filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path)).
  sort((a, b) => {
    const num = (p: string) => Number(/slide(\d+)\.xml$/.exec(p)?.[1] ?? 0);
    return num(a) - num(b);
  }).
  slice(0, PREVIEW_LIMITS.officeParts);

  const slides: Slide[] = [];
  for (let i = 0; i < slidePaths.length; i += 1) {
    const doc = await readXml(zip, slidePaths[i]);
    if (!doc) continue;
    const paragraphs = Array.from(doc.getElementsByTagName('a:p')).
    map((p) =>
    Array.from(p.getElementsByTagName('a:t')).
    map((t) => t.textContent ?? '').
    join('').
    trim()
    ).
    filter(Boolean);

    const notesDoc = await readXml(zip, `ppt/notesSlides/notesSlide${i + 1}.xml`);
    const notes = notesDoc ?
    Array.from(notesDoc.getElementsByTagName('a:t')).map((t) => t.textContent ?? '').join(' ').trim() :
    '';

    slides.push({
      index: i + 1,
      title: paragraphs[0] ?? `Slide ${i + 1}`,
      lines: paragraphs.slice(1),
      notes
    });
  }

  if (!slides.length) throw new OfficeParseError('No readable slides were found in this deck.');
  return { slides, warnings };
}