const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes: number, precision = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes === 0) return '0 B';
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), UNITS.length - 1);
  const value = bytes / 1024 ** i;
  return `${value.toFixed(i === 0 ? 0 : precision)} ${UNITS[i]}`;
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit'
  });
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function relativeTime(ts: number, now = Date.now()): string {
  const delta = ts - now;
  const abs = Math.abs(delta);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  if (abs < minute) return delta >= 0 ? 'in a moment' : 'just now';
  if (abs < hour) return rtf.format(Math.round(delta / minute), 'minute');
  if (abs < day) return rtf.format(Math.round(delta / hour), 'hour');
  if (abs < 30 * day) return rtf.format(Math.round(delta / day), 'day');
  return rtf.format(Math.round(delta / (30 * day)), 'month');
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return 'expired';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function formatRate(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '—';
  return `${formatBytes(bytesPerSecond, 1)}/s`;
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function initials(name: string): string {
  return name.
  split(/\s+/).
  filter(Boolean).
  slice(0, 2).
  map((part) => part[0]?.toUpperCase() ?? '').
  join('');
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

const EXT_KIND: Record<string, string> = {
  pdf: 'document',
  doc: 'document',
  docx: 'document',
  txt: 'document',
  md: 'document',
  rtf: 'document',
  csv: 'dataset',
  tsv: 'dataset',
  json: 'dataset',
  xlsx: 'dataset',
  parquet: 'dataset',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  tif: 'image',
  tiff: 'image',
  zip: 'archive',
  gz: 'archive',
  tar: 'archive',
  '7z': 'archive'
};

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

export function kindFor(name: string, mime: string): 'document' | 'dataset' | 'image' | 'archive' | 'other' {
  if (mime.startsWith('image/')) return 'image';
  const byExt = EXT_KIND[extensionOf(name)];
  if (byExt) return byExt as 'document' | 'dataset' | 'image' | 'archive' | 'other';
  if (mime.startsWith('text/')) return 'document';
  if (mime === 'application/pdf') return 'document';
  return 'other';
}

/** Guards against path traversal and control characters in user-supplied names. */
export function sanitiseFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'untitled';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  return (cleaned || 'untitled').slice(0, 180);
}

/** Escapes text before it is rendered into a preview surface. */
export function escapeHtml(value: string): string {
  return value.
  replace(/&/g, '&amp;').
  replace(/</g, '&lt;').
  replace(/>/g, '&gt;').
  replace(/"/g, '&quot;').
  replace(/'/g, '&#39;');
}