import React from 'react';
import { decodeText, PREVIEW_LIMITS } from '../../lib/filetype';
import { parseMarkdown } from '../../lib/markdown';
import type { Block, Inline } from '../../lib/markdown';
import { cn } from '../../lib/cn';
import {
  DataTable,
  PreviewPane,
  RendererNotice,
  RendererSkeleton,
  TruncationNote,
  useAsyncResource } from
'./primitives';
import type { RendererProps } from './primitives';

/* ------------------------------------------------------------------ text */

export function TextRenderer({ blob, signature }: RendererProps) {
  const { data, error, loading } = useAsyncResource(() => decodeText(blob), [blob]);

  if (loading) return <RendererSkeleton label="Decoding text" />;
  if (error || !data) {
    return <RendererNotice tone="danger" title="This text could not be decoded" body={error ?? 'Unknown decoding failure.'} />;
  }
  if (!data.text.trim()) {
    return <RendererNotice title="This file is empty" body="There is no text content to display." />;
  }

  const numbered = signature.kind === 'code' || signature.kind === 'html';
  const lines = numbered ? data.text.split('\n').slice(0, 8_000) : [];

  return (
    <PreviewPane>
      {numbered ?
      <ol className="min-w-full py-2 font-mono text-[12.5px] leading-[1.65]">
          {lines.map((line, i) =>
        <li key={i} className="flex gap-4 px-4 hover:bg-accent/20">
              <span className="w-10 shrink-0 select-none text-right text-[11px] text-muted-foreground/50">{i + 1}</span>
              <span className="whitespace-pre-wrap break-words">{line || '\u00a0'}</span>
            </li>
        )}
        </ol> :

      <pre className="whitespace-pre-wrap break-words px-5 py-4 font-mono text-[12.5px] leading-relaxed">
          {data.text}
        </pre>
      }
      {data.truncated &&
      <TruncationNote>
          Showing the first {PREVIEW_LIMITS.textChars.toLocaleString()} characters. The complete file stays sealed and intact.
        </TruncationNote>
      }
    </PreviewPane>);

}

/* -------------------------------------------------------------- markdown */

function InlineRun({ tokens }: {tokens: Inline[];}) {
  return (
    <>
      {tokens.map((token, i) => {
        switch (token.type) {
          case 'strong':
            return <strong key={i} className="font-semibold">{token.value}</strong>;
          case 'em':
            return <em key={i}>{token.value}</em>;
          case 'code':
            return (
              <code key={i} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]">
                {token.value}
              </code>);

          case 'link':
            // Rendered as text, not as a navigable anchor: a protected preview
            // must never become an outbound click from sealed material.
            return (
              <span key={i} className="underline decoration-dotted underline-offset-2" title={token.href ?? 'unsafe link removed'}>
                {token.value}
              </span>);

          default:
            return <React.Fragment key={i}>{token.value}</React.Fragment>;
        }
      })}
    </>);

}

function MarkdownBlock({ block }: {block: Block;}) {
  switch (block.type) {
    case 'heading':{
        const sizes = ['text-[22px]', 'text-[19px]', 'text-[16.5px]', 'text-[15px]', 'text-[14px]', 'text-[13px]'];
        return (
          <p
            role="heading"
            aria-level={block.level}
            className={cn('mt-6 font-semibold tracking-tight first:mt-0', sizes[block.level - 1])}>

          <InlineRun tokens={block.content} />
        </p>);

      }
    case 'paragraph':
      return (
        <p className="mt-3 text-[13.5px] leading-relaxed">
          <InlineRun tokens={block.content} />
        </p>);

    case 'list':
      return block.ordered ?
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed">
          {block.items.map((item, i) => <li key={i}><InlineRun tokens={item} /></li>)}
        </ol> :

      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed">
          {block.items.map((item, i) => <li key={i}><InlineRun tokens={item} /></li>)}
        </ul>;

    case 'code':
      return (
        <pre className="mt-4 overflow-auto rounded-lg border border-border bg-muted/50 px-4 py-3 font-mono text-[12px] leading-relaxed">
          {block.value}
        </pre>);

    case 'quote':
      return (
        <blockquote className="mt-4 border-l-2 border-primary/40 pl-4 text-[13.5px] italic leading-relaxed text-muted-foreground">
          <InlineRun tokens={block.content} />
        </blockquote>);

    case 'table':
      return (
        <div className="mt-4 overflow-auto rounded-lg border border-border">
          <DataTable header={block.header} rows={block.rows} caption="Markdown table" />
        </div>);

    case 'rule':
      return <hr className="my-6 border-border" />;
    default:
      return null;
  }
}

export function MarkdownRenderer({ blob }: RendererProps) {
  const { data, error, loading } = useAsyncResource(async () => {
    const { text, truncated } = await decodeText(blob);
    return { blocks: parseMarkdown(text), truncated };
  }, [blob]);

  if (loading) return <RendererSkeleton label="Laying out document" />;
  if (error || !data) {
    return <RendererNotice tone="danger" title="This document could not be read" body={error ?? 'Unknown failure.'} />;
  }
  if (!data.blocks.length) {
    return <RendererNotice title="This document is empty" body="No headings, text or tables were found." />;
  }

  return (
    <PreviewPane>
      <article className="mx-auto max-w-3xl px-6 py-7">
        {data.blocks.map((block, i) => <MarkdownBlock key={i} block={block} />)}
      </article>
      {data.truncated && <TruncationNote>Long document — only the opening section is rendered.</TruncationNote>}
    </PreviewPane>);

}

/* ------------------------------------------------------------------ json */

function JsonNode({ label, value, depth }: {label: string | null;value: unknown;depth: number;}) {
  const [open, setOpen] = React.useState(depth < 2);
  const isArray = Array.isArray(value);
  const isObject = value !== null && typeof value === 'object';

  if (!isObject) {
    const tone =
    typeof value === 'string' ? 'text-ok' :
    typeof value === 'number' ? 'text-info' :
    typeof value === 'boolean' ? 'text-warn' :
    'text-muted-foreground';
    return (
      <div className="flex gap-2 py-0.5 font-mono text-[12px]">
        {label !== null && <span className="text-muted-foreground">{label}:</span>}
        <span className={cn('break-all', tone)}>
          {typeof value === 'string' ? `"${value.length > 400 ? `${value.slice(0, 400)}…` : value}"` : String(value)}
        </span>
      </div>);

  }

  const entries = isArray ?
  (value as unknown[]).slice(0, 500).map((item, i) => [String(i), item] as const) :
  Object.entries(value as Record<string, unknown>).slice(0, 500);

  return (
    <div className="py-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 font-mono text-[12px] text-left hover:text-primary">

        <span className="text-muted-foreground">{open ? '▾' : '▸'}</span>
        {label !== null && <span className="text-muted-foreground">{label}:</span>}
        <span className="text-foreground/70">
          {isArray ? `Array(${(value as unknown[]).length})` : `Object(${Object.keys(value as object).length})`}
        </span>
      </button>
      {open &&
      <div className="ml-4 border-l border-border/70 pl-3">
          {entries.map(([key, child]) =>
        <JsonNode key={key} label={key} value={child} depth={depth + 1} />
        )}
        </div>
      }
    </div>);

}

export function JsonRenderer(props: RendererProps) {
  const { blob } = props;
  const { data, error, loading } = useAsyncResource(async () => {
    const { text, truncated } = await decodeText(blob, PREVIEW_LIMITS.decodeBytes);
    try {
      return { parsed: JSON.parse(text) as unknown, text, truncated, valid: true };
    } catch {
      return { parsed: null, text: text.slice(0, PREVIEW_LIMITS.textChars), truncated, valid: false };
    }
  }, [blob]);

  if (loading) return <RendererSkeleton label="Parsing data" />;
  if (error || !data) {
    return <RendererNotice tone="danger" title="This data could not be read" body={error ?? 'Unknown failure.'} />;
  }
  if (!data.valid) {
    return (
      <>
        <div className="border-b border-warn/25 bg-warn/8 px-4 py-2 text-[11.5px] text-warn">
          Not valid JSON — showing the raw source instead. Nothing was evaluated.
        </div>
        <TextRenderer {...props} signature={{ ...props.signature, kind: 'code' }} />
      </>);

  }

  return (
    <PreviewPane>
      <div className="px-5 py-4">
        <JsonNode label={null} value={data.parsed} depth={0} />
      </div>
    </PreviewPane>);

}

/* ------------------------------------------------------------------- xml */

interface XmlNode {
  tag: string;
  attributes: [string, string][];
  text: string;
  children: XmlNode[];
}

function toXmlNode(element: Element, depth: number): XmlNode {
  const children = depth < 40 ? Array.from(element.children).slice(0, 300) : [];
  return {
    tag: element.tagName,
    attributes: Array.from(element.attributes).map((a) => [a.name, a.value.slice(0, 200)] as [string, string]),
    text: children.length ? '' : (element.textContent ?? '').trim().slice(0, 600),
    children: children.map((child) => toXmlNode(child, depth + 1))
  };
}

function XmlTree({ node, depth }: {node: XmlNode;depth: number;}) {
  const [open, setOpen] = React.useState(depth < 3);
  const collapsible = node.children.length > 0;
  return (
    <div className="py-0.5 font-mono text-[12px]">
      <div className="flex flex-wrap items-baseline gap-x-2">
        {collapsible ?
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="text-muted-foreground hover:text-primary">
            {open ? '▾' : '▸'}
          </button> :
        <span className="text-muted-foreground/40">·</span>
        }
        <span className="text-primary">&lt;{node.tag}&gt;</span>
        {node.attributes.map(([key, value]) =>
        <span key={key} className="text-muted-foreground">
            {key}=<span className="text-ok">"{value}"</span>
          </span>
        )}
        {node.text && <span className="break-all text-foreground/80">{node.text}</span>}
      </div>
      {open && collapsible &&
      <div className="ml-4 border-l border-border/70 pl-3">
          {node.children.map((child, i) => <XmlTree key={i} node={child} depth={depth + 1} />)}
        </div>
      }
    </div>);

}

export function XmlRenderer(props: RendererProps) {
  const { blob } = props;
  const { data, error, loading } = useAsyncResource(async () => {
    const { text, truncated } = await decodeText(blob, PREVIEW_LIMITS.decodeBytes);
    // DOMParser in XML mode does not resolve external entities and does not
    // execute anything; the result is inspected as data only.
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const failed = doc.getElementsByTagName('parsererror').length > 0 || !doc.documentElement;
    return { node: failed ? null : toXmlNode(doc.documentElement, 0), truncated };
  }, [blob]);

  if (loading) return <RendererSkeleton label="Parsing markup" />;
  if (error) return <RendererNotice tone="danger" title="This markup could not be read" body={error} />;
  if (!data?.node) {
    return (
      <>
        <div className="border-b border-warn/25 bg-warn/8 px-4 py-2 text-[11.5px] text-warn">
          Malformed XML — showing the raw source. Nothing was rendered or executed.
        </div>
        <TextRenderer {...props} signature={{ ...props.signature, kind: 'code' }} />
      </>);

  }

  return (
    <PreviewPane>
      <div className="px-5 py-4">
        <XmlTree node={data.node} depth={0} />
      </div>
      {data.truncated && <TruncationNote>Large document — only the opening section was parsed.</TruncationNote>}
    </PreviewPane>);

}

/* ------------------------------------------------------------------ html */

export function HtmlSourceRenderer(props: RendererProps) {
  return (
    <>
      <div className="border-b border-warn/25 bg-warn/8 px-4 py-2.5 text-[11.5px] leading-relaxed text-warn">
        HTML is shown as source, never rendered. Live markup could run script, load remote
        trackers, or frame another page from inside the viewer.
      </div>
      <TextRenderer {...props} signature={{ ...props.signature, kind: 'code' }} />
    </>);

}