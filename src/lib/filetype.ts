/**
 * Safe file-type resolution for the in-app preview system.
 *
 * Uploaded bytes are untrusted input. Three rules hold everywhere below:
 *  1. The declared MIME type and the file extension are HINTS, never proof.
 *     Content sniffing (magic bytes) wins whenever the two disagree, and the
 *     disagreement is surfaced to the reader rather than hidden.
 *  2. Nothing here ever executes, evaluates, or hands content to another
 *     application. Detection only reads a 64-byte header slice.
 *  3. Anything that cannot be classified confidently is routed to the
 *     "binary" fallback, which refuses to render rather than guessing.
 */

export type PreviewKind =
'image' |
'pdf' |
'audio' |
'video' |
'text' |
'markdown' |
'code' |
'csv' |
'json' |
'xml' |
'html' |
'docx' |
'xlsx' |
'pptx' |
'legacy-office' |
'archive' |
'executable' |
'binary';

export interface FileSignature {
  kind: PreviewKind;
  /** Human label shown in the viewer chrome, e.g. "Word document (.docx)". */
  label: string;
  /** The type Canopy actually trusts after sniffing. */
  mime: string;
  ext: string;
  /** True when magic bytes positively identified the format. */
  sniffed: boolean;
  /** True when the declared MIME type contradicts the bytes on disk. */
  mismatch: boolean;
  /** Renderers that stream from a blob URL rather than decoding in JS. */
  streamed: boolean;
  language?: string;
}

/**
 * Hard ceilings. Every one of these exists to stop a hostile or simply huge
 * file from exhausting memory or locking the main thread.
 */
export const PREVIEW_LIMITS = {
  /** Largest blob we will decode in JavaScript (parsers, not streams). */
  decodeBytes: 32 * 1024 * 1024,
  /** Characters of text held in the DOM at once. */
  textChars: 400_000,
  /** Rows rendered from a table-shaped file. */
  tableRows: 2_000,
  /** Columns rendered from a table-shaped file. */
  tableCols: 120,
  /** Characters kept per table cell. */
  cellChars: 512,
  /** Entries listed from an archive. */
  archiveEntries: 400,
  /** Uncompressed:compressed ratio above which we call it a zip bomb. */
  archiveRatio: 250,
  /** Total uncompressed bytes an archive may claim before we refuse. */
  archiveExpandedBytes: 512 * 1024 * 1024,
  /** Slides or sheets parsed from an Office document. */
  officeParts: 120
} as const;

const CODE_LANGUAGES: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', mjs: 'JavaScript',
  py: 'Python', ipynb: 'Notebook', r: 'R', rmd: 'R Markdown', m: 'MATLAB', jl: 'Julia',
  java: 'Java', c: 'C', h: 'C header', cpp: 'C++', cc: 'C++', hpp: 'C++ header', cs: 'C#',
  go: 'Go', rs: 'Rust', rb: 'Ruby', php: 'PHP', swift: 'Swift', kt: 'Kotlin', scala: 'Scala',
  sh: 'Shell', bash: 'Shell', zsh: 'Shell', ps1: 'PowerShell', sql: 'SQL', css: 'CSS',
  scss: 'SCSS', yml: 'YAML', yaml: 'YAML', toml: 'TOML', ini: 'INI', env: 'Env', cfg: 'Config',
  conf: 'Config', tex: 'LaTeX', bib: 'BibTeX', do: 'Stata', sas: 'SAS', f90: 'Fortran',
  nf: 'Nextflow', cwl: 'CWL', dockerfile: 'Dockerfile', make: 'Makefile', gradle: 'Gradle'
};

const PLAIN_TEXT_EXT = new Set(['txt', 'log', 'text', 'nfo', 'readme', 'me', 'fasta', 'fa', 'gff', 'vcf', 'bed', 'pdb']);
const TABLE_EXT = new Set(['csv', 'tsv', 'psv']);

export function extensionOfName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot <= 0 ? '' : base.slice(dot + 1).toLowerCase();
}

interface Magic {
  kind: PreviewKind;
  label: string;
  mime: string;
  streamed?: boolean;
  /** Byte pattern; null entries are wildcards. */
  bytes: (number | null)[];
  offset?: number;
}

const ASCII = (s: string): number[] => Array.from(s).map((c) => c.charCodeAt(0));

const MAGICS: Magic[] = [
{ kind: 'pdf', label: 'PDF document', mime: 'application/pdf', streamed: true, bytes: ASCII('%PDF-') },
{ kind: 'image', label: 'PNG image', mime: 'image/png', streamed: true, bytes: [0x89, 0x50, 0x4e, 0x47] },
{ kind: 'image', label: 'JPEG image', mime: 'image/jpeg', streamed: true, bytes: [0xff, 0xd8, 0xff] },
{ kind: 'image', label: 'GIF image', mime: 'image/gif', streamed: true, bytes: ASCII('GIF8') },
{ kind: 'image', label: 'BMP image', mime: 'image/bmp', streamed: true, bytes: ASCII('BM') },
{ kind: 'image', label: 'TIFF image', mime: 'image/tiff', streamed: true, bytes: [0x49, 0x49, 0x2a, 0x00] },
{ kind: 'image', label: 'TIFF image', mime: 'image/tiff', streamed: true, bytes: [0x4d, 0x4d, 0x00, 0x2a] },
{ kind: 'image', label: 'Icon', mime: 'image/x-icon', streamed: true, bytes: [0x00, 0x00, 0x01, 0x00] },
{ kind: 'audio', label: 'FLAC audio', mime: 'audio/flac', streamed: true, bytes: ASCII('fLaC') },
{ kind: 'audio', label: 'MP3 audio', mime: 'audio/mpeg', streamed: true, bytes: ASCII('ID3') },
{ kind: 'video', label: 'Matroska video', mime: 'video/webm', streamed: true, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
{ kind: 'video', label: 'MPEG-4 video', mime: 'video/mp4', streamed: true, bytes: ASCII('ftyp'), offset: 4 },
{ kind: 'legacy-office', label: 'Legacy Office document', mime: 'application/x-ole-storage', bytes: [0xd0, 0xcf, 0x11, 0xe0] },
{ kind: 'executable', label: 'Executable', mime: 'application/x-msdownload', bytes: [0x4d, 0x5a] },
{ kind: 'executable', label: 'Executable', mime: 'application/x-elf', bytes: [0x7f, 0x45, 0x4c, 0x46] },
{ kind: 'executable', label: 'Mach-O executable', mime: 'application/x-mach-binary', bytes: [0xcf, 0xfa, 0xed, 0xfe] },
{ kind: 'archive', label: 'Gzip archive', mime: 'application/gzip', bytes: [0x1f, 0x8b] },
{ kind: 'archive', label: 'RAR archive', mime: 'application/vnd.rar', bytes: ASCII('Rar!') },
{ kind: 'archive', label: '7-Zip archive', mime: 'application/x-7z-compressed', bytes: [0x37, 0x7a, 0xbc, 0xaf] },
{ kind: 'archive', label: 'Zstandard archive', mime: 'application/zstd', bytes: [0x28, 0xb5, 0x2f, 0xfd] },
{ kind: 'archive', label: 'XZ archive', mime: 'application/x-xz', bytes: [0xfd, 0x37, 0x7a, 0x58, 0x5a] },
{ kind: 'archive', label: 'Bzip2 archive', mime: 'application/x-bzip2', bytes: ASCII('BZh') }];


function matches(head: Uint8Array, magic: Magic): boolean {
  const offset = magic.offset ?? 0;
  if (head.length < offset + magic.bytes.length) return false;
  return magic.bytes.every((byte, i) => byte === null || head[offset + i] === byte);
}

function isRiff(head: Uint8Array): 'audio' | 'video' | 'image' | null {
  if (head.length < 12) return null;
  const tag = String.fromCharCode(...head.subarray(0, 4));
  if (tag !== 'RIFF') return null;
  const form = String.fromCharCode(...head.subarray(8, 12));
  if (form === 'WAVE') return 'audio';
  if (form === 'AVI ') return 'video';
  if (form === 'WEBP') return 'image';
  return null;
}

function isOgg(head: Uint8Array): boolean {
  return head.length >= 4 && String.fromCharCode(...head.subarray(0, 4)) === 'OggS';
}

function isZip(head: Uint8Array): boolean {
  return head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && (
  head[2] === 3 || head[2] === 5 || head[2] === 7) && (
  head[3] === 4 || head[3] === 6 || head[3] === 8);
}

/** Cheap printability test used to separate text from opaque binary. */
function looksTextual(head: Uint8Array): boolean {
  if (!head.length) return false;
  let printable = 0;
  for (const byte of head) {
    if (byte === 0) return false;
    if (byte === 9 || byte === 10 || byte === 13 || byte >= 32 && byte <= 126 || byte >= 0xa0) {
      printable += 1;
    }
  }
  return printable / head.length > 0.9;
}

const OOXML_BY_EXT: Record<string, {kind: PreviewKind;label: string;mime: string;}> = {
  docx: { kind: 'docx', label: 'Word document (.docx)', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  docm: { kind: 'docx', label: 'Word document (macro-enabled)', mime: 'application/vnd.ms-word.document.macroenabled.12' },
  dotx: { kind: 'docx', label: 'Word template (.dotx)', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template' },
  xlsx: { kind: 'xlsx', label: 'Excel workbook (.xlsx)', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
  xlsm: { kind: 'xlsx', label: 'Excel workbook (macro-enabled)', mime: 'application/vnd.ms-excel.sheet.macroenabled.12' },
  pptx: { kind: 'pptx', label: 'PowerPoint deck (.pptx)', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
  pptm: { kind: 'pptx', label: 'PowerPoint deck (macro-enabled)', mime: 'application/vnd.ms-powerpoint.presentation.macroenabled.12' },
  odt: { kind: 'archive', label: 'OpenDocument text', mime: 'application/vnd.oasis.opendocument.text' },
  ods: { kind: 'archive', label: 'OpenDocument spreadsheet', mime: 'application/vnd.oasis.opendocument.spreadsheet' },
  odp: { kind: 'archive', label: 'OpenDocument presentation', mime: 'application/vnd.oasis.opendocument.presentation' }
};

const LEGACY_BY_EXT: Record<string, string> = {
  doc: 'Word 97–2003 document (.doc)',
  xls: 'Excel 97–2003 workbook (.xls)',
  ppt: 'PowerPoint 97–2003 deck (.ppt)',
  msg: 'Outlook message (.msg)'
};

function textKindFor(ext: string, mime: string): FileSignature | null {
  if (ext === 'md' || ext === 'markdown' || ext === 'mdown') {
    return base('markdown', 'Markdown document', 'text/markdown', ext);
  }
  if (ext === 'json' || ext === 'jsonl' || ext === 'ndjson' || ext === 'geojson' || mime === 'application/json') {
    return base('json', 'JSON data', 'application/json', ext);
  }
  if (ext === 'xml' || ext === 'svg' || ext === 'rss' || ext === 'xsd' || ext === 'kml' || mime.includes('xml')) {
    // SVG is XML, but it can carry script. It is rendered as an image only
    // through <img>, which is a non-scripting context; as a document we show
    // its source instead.
    return base('xml', ext === 'svg' ? 'SVG source' : 'XML document', 'application/xml', ext);
  }
  if (ext === 'html' || ext === 'htm' || ext === 'xhtml' || mime === 'text/html') {
    return base('html', 'HTML source', 'text/html', ext);
  }
  if (TABLE_EXT.has(ext) || mime === 'text/csv') {
    return base('csv', ext === 'tsv' ? 'Tab-separated data' : 'Comma-separated data', 'text/csv', ext);
  }
  if (CODE_LANGUAGES[ext]) {
    const sig = base('code', `${CODE_LANGUAGES[ext]} source`, 'text/plain', ext);
    sig.language = CODE_LANGUAGES[ext];
    return sig;
  }
  if (PLAIN_TEXT_EXT.has(ext) || mime.startsWith('text/')) {
    return base('text', 'Plain text', 'text/plain', ext);
  }
  return null;
}

function base(kind: PreviewKind, label: string, mime: string, ext: string, streamed = false): FileSignature {
  return { kind, label, mime, ext, sniffed: false, mismatch: false, streamed };
}

export async function readHeader(blob: Blob, bytes = 64): Promise<Uint8Array> {
  const slice = blob.slice(0, Math.min(bytes, blob.size));
  return new Uint8Array(await slice.arrayBuffer());
}

/**
 * Resolves what a file really is. `blob` may be omitted when only a label is
 * needed (list rows); detection then falls back to name and declared type,
 * and `sniffed` stays false so callers know the answer is unverified.
 */
export async function detectFileType(
name: string,
declaredMime: string,
blob?: Blob | null)
: Promise<FileSignature> {
  const ext = extensionOfName(name);
  const mime = (declaredMime || '').toLowerCase().split(';')[0].trim();
  const head = blob && blob.size > 0 ? await readHeader(blob) : null;

  if (head) {
    for (const magic of MAGICS) {
      if (!matches(head, magic)) continue;
      const sig: FileSignature = {
        kind: magic.kind,
        label: magic.kind === 'legacy-office' ? LEGACY_BY_EXT[ext] ?? magic.label : magic.label,
        mime: magic.mime,
        ext,
        sniffed: true,
        mismatch: Boolean(mime) && mime !== magic.mime && !mime.startsWith(magic.mime.split('/')[0]),
        streamed: Boolean(magic.streamed)
      };
      return sig;
    }

    const riff = isRiff(head);
    if (riff) {
      return {
        kind: riff,
        label: riff === 'image' ? 'WebP image' : riff === 'audio' ? 'WAV audio' : 'AVI video',
        mime: riff === 'image' ? 'image/webp' : riff === 'audio' ? 'audio/wav' : 'video/x-msvideo',
        ext,
        sniffed: true,
        mismatch: Boolean(mime) && !mime.startsWith(riff),
        streamed: true
      };
    }

    if (isOgg(head)) {
      const video = ext === 'ogv' || mime.startsWith('video/');
      return {
        kind: video ? 'video' : 'audio',
        label: video ? 'Ogg video' : 'Ogg audio',
        mime: video ? 'video/ogg' : 'audio/ogg',
        ext,
        sniffed: true,
        mismatch: false,
        streamed: true
      };
    }

    if (isZip(head)) {
      const ooxml = OOXML_BY_EXT[ext];
      return {
        kind: ooxml?.kind ?? 'archive',
        label: ooxml?.label ?? 'Zip archive',
        mime: ooxml?.mime ?? 'application/zip',
        ext,
        sniffed: true,
        mismatch: false,
        streamed: false
      };
    }

    // Some MP3s start straight into a frame sync rather than an ID3 tag.
    if (head.length > 1 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0 && (ext === 'mp3' || mime.startsWith('audio/'))) {
      return { kind: 'audio', label: 'MP3 audio', mime: 'audio/mpeg', ext, sniffed: true, mismatch: false, streamed: true };
    }
  }

  const textual = textKindFor(ext, mime);
  if (textual) {
    // A file claiming to be text but full of NULs is not text.
    if (head && !looksTextual(head)) {
      return { kind: 'binary', label: 'Unrecognised binary', mime: 'application/octet-stream', ext, sniffed: Boolean(head), mismatch: true, streamed: false };
    }
    return { ...textual, sniffed: Boolean(head), mismatch: false };
  }

  if (LEGACY_BY_EXT[ext]) {
    return { kind: 'legacy-office', label: LEGACY_BY_EXT[ext], mime: 'application/x-ole-storage', ext, sniffed: false, mismatch: false, streamed: false };
  }
  if (OOXML_BY_EXT[ext]) {
    const ooxml = OOXML_BY_EXT[ext];
    return { kind: ooxml.kind, label: ooxml.label, mime: ooxml.mime, ext, sniffed: false, mismatch: false, streamed: false };
  }
  if (mime.startsWith('image/')) return { ...base('image', 'Image', mime, ext, true), mismatch: Boolean(head) };
  if (mime.startsWith('audio/')) return { ...base('audio', 'Audio', mime, ext, true), mismatch: Boolean(head) };
  if (mime.startsWith('video/')) return { ...base('video', 'Video', mime, ext, true), mismatch: Boolean(head) };

  if (head && looksTextual(head)) {
    return { kind: 'text', label: 'Plain text (detected)', mime: 'text/plain', ext, sniffed: true, mismatch: false, streamed: false };
  }

  return {
    kind: 'binary',
    label: ext ? `Unrecognised .${ext} file` : 'Unrecognised file',
    mime: mime || 'application/octet-stream',
    ext,
    sniffed: Boolean(head),
    mismatch: false,
    streamed: false
  };
}

/** Decodes bytes as UTF-8 without throwing on malformed input. */
export async function decodeText(blob: Blob, limit: number = PREVIEW_LIMITS.textChars): Promise<{text: string;truncated: boolean;}> {
  if (blob.size > PREVIEW_LIMITS.decodeBytes) {
    const head = blob.slice(0, PREVIEW_LIMITS.decodeBytes);
    const text = new TextDecoder('utf-8', { fatal: false }).decode(await head.arrayBuffer());
    return { text: text.slice(0, limit), truncated: true };
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(await blob.arrayBuffer());
  return { text: text.slice(0, limit), truncated: text.length > limit };
}