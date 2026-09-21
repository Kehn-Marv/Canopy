/**
 * A deliberately small Markdown reader.
 *
 * It produces a typed block list, never an HTML string. Nothing is passed to
 * `dangerouslySetInnerHTML`, raw HTML in the source is shown as literal text,
 * and link targets are only kept when they use a safe scheme — the renderer
 * still shows them as text rather than as navigable anchors.
 */

export type Inline =
{type: 'text';value: string;} |
{type: 'strong';value: string;} |
{type: 'em';value: string;} |
{type: 'code';value: string;} |
{type: 'link';value: string;href: string | null;};

export type Block =
{type: 'heading';level: number;content: Inline[];} |
{type: 'paragraph';content: Inline[];} |
{type: 'list';ordered: boolean;items: Inline[][];} |
{type: 'code';language: string;value: string;} |
{type: 'quote';content: Inline[];} |
{type: 'table';header: string[];rows: string[][];} |
{type: 'rule';};

const SAFE_SCHEME = /^(https?:|mailto:|#|\/)/i;

function safeHref(href: string): string | null {
  const trimmed = href.trim();
  return SAFE_SCHEME.test(trimmed) ? trimmed : null;
}

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*]+\*)|(_[^_]+_)|(\[[^\]]+\]\([^)\s]+\))/;
  let rest = source;

  while (rest.length) {
    const match = pattern.exec(rest);
    if (!match || match.index === undefined) {
      out.push({ type: 'text', value: rest });
      break;
    }
    if (match.index > 0) out.push({ type: 'text', value: rest.slice(0, match.index) });
    const token = match[0];
    if (token.startsWith('`')) {
      out.push({ type: 'code', value: token.slice(1, -1) });
    } else if (token.startsWith('**') || token.startsWith('__')) {
      out.push({ type: 'strong', value: token.slice(2, -2) });
    } else if (token.startsWith('[')) {
      const split = token.indexOf('](');
      out.push({
        type: 'link',
        value: token.slice(1, split),
        href: safeHref(token.slice(split + 2, -1))
      });
    } else {
      out.push({ type: 'em', value: token.slice(1, -1) });
    }
    rest = rest.slice(match.index + token.length);
  }
  return out.filter((token) => token.type !== 'text' || token.value.length > 0);
}

function splitRow(line: string): string[] {
  return line.
  replace(/^\s*\|/, '').
  replace(/\|\s*$/, '').
  split('|').
  map((cell) => cell.trim());
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'paragraph', content: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];

    if (/^```/.test(line)) {
      flushParagraph();
      const language = line.slice(3).trim();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) {
        body.push(lines[i]);
        i += 1;
      }
      blocks.push({ type: 'code', language, value: body.join('\n') });
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    if (/^ {0,3}(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushParagraph();
      blocks.push({ type: 'rule' });
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      blocks.push({ type: 'heading', level: heading[1].length, content: parseInline(heading[2].trim()) });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushParagraph();
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
        quote.push(lines[i].replace(/^\s*>\s?/, ''));
        i += 1;
      }
      i -= 1;
      blocks.push({ type: 'quote', content: parseInline(quote.join(' ')) });
      continue;
    }

    // GitHub-style table: a header row followed by a separator row.
    if (line.includes('|') && /^\s*\|?[\s:-]+\|[\s|:-]*$/.test(lines[i + 1] ?? '')) {
      flushParagraph();
      const header = splitRow(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      i -= 1;
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    const bullet = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      flushParagraph();
      const ordered = /\d/.test(bullet[1]);
      const items: Inline[][] = [];
      while (i < lines.length) {
        const item = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]);
        if (!item) break;
        items.push(parseInline(item[2]));
        i += 1;
      }
      i -= 1;
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();
  return blocks;
}