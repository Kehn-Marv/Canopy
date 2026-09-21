import { useState } from 'react';
import { readDocx, readPptx } from '../../lib/ooxml';
import type { DocxBlock } from '../../lib/ooxml';
import { cn } from '../../lib/cn';
import {
  DataTable,
  PreviewPane,
  RendererNotice,
  RendererSkeleton,
  TruncationNote,
  WarningStrip,
  useAsyncResource } from
'./primitives';
import type { RendererProps } from './primitives';

/**
 * Office formats are extracted, never executed.
 *
 * Canopy reads the text and table structure out of the document's XML parts
 * and rebuilds them as ordinary React elements. Macros, embedded objects,
 * DDE fields and remote relationships are ignored entirely, so previewing a
 * hostile document cannot run code or contact a server.
 */

function DocxBlockView({ block }: {block: DocxBlock;}) {
  switch (block.type) {
    case 'heading':{
        const sizes = ['text-[21px]', 'text-[18px]', 'text-[16px]', 'text-[14.5px]', 'text-[13.5px]', 'text-[13px]'];
        return (
          <p
            role="heading"
            aria-level={Math.min(block.level, 6)}
            className={cn('mt-6 font-semibold tracking-tight first:mt-0', sizes[Math.min(block.level, 6) - 1])}>

          {block.text}
        </p>);

      }
    case 'paragraph':
      return <p className="mt-3 whitespace-pre-wrap text-[13.5px] leading-relaxed">{block.text}</p>;
    case 'list':
      return block.ordered ?
      <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed">
          {block.items.map((item, i) => <li key={i}>{item}</li>)}
        </ol> :

      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13.5px] leading-relaxed">
          {block.items.map((item, i) => <li key={i}>{item}</li>)}
        </ul>;

    case 'table':{
        const [header, ...rows] = block.rows;
        return (
          <div className="mt-4 overflow-auto rounded-lg border border-border">
          <DataTable header={header ?? []} rows={rows} caption="Document table" />
        </div>);

      }
    default:
      return null;
  }
}

export function DocxRenderer({ blob }: RendererProps) {
  const { data, error, loading } = useAsyncResource(() => readDocx(blob), [blob]);

  if (loading) return <RendererSkeleton label="Extracting document text" />;
  if (error || !data) {
    return (
      <RendererNotice
        tone="danger"
        title="This document could not be opened"
        body={error ?? 'No readable content was found.'} />);

  }

  return (
    <div>
      <WarningStrip messages={data.warnings} />
      <PreviewPane>
        <article className="mx-auto max-w-3xl px-7 py-8">
          {data.blocks.map((block, i) => <DocxBlockView key={i} block={block} />)}
        </article>
        {data.truncated && <TruncationNote>Long document — only the opening section is rendered.</TruncationNote>}
      </PreviewPane>
    </div>);

}

export function PptxRenderer({ blob }: RendererProps) {
  const { data, error, loading } = useAsyncResource(() => readPptx(blob), [blob]);
  const [active, setActive] = useState(0);

  if (loading) return <RendererSkeleton label="Extracting slides" />;
  if (error || !data) {
    return (
      <RendererNotice
        tone="danger"
        title="This deck could not be opened"
        body={error ?? 'No readable slides were found.'} />);

  }

  const slide = data.slides[Math.min(active, data.slides.length - 1)];

  return (
    <div>
      <WarningStrip messages={data.warnings} />
      <div className="grid gap-0 md:grid-cols-[13rem_1fr]">
        <ol
          className="flex max-h-[20vh] gap-2 overflow-auto border-b border-border bg-muted/30 p-2 md:max-h-[66vh] md:flex-col md:border-b-0 md:border-r"
          aria-label="Slides">

          {data.slides.map((s, i) =>
          <li key={s.index} className="shrink-0">
              <button
              type="button"
              onClick={() => setActive(i)}
              aria-current={i === active}
              className={cn(
                'w-40 rounded-lg border px-3 py-2 text-left transition-elegant md:w-full',
                i === active ?
                'border-primary/50 bg-background shadow-sm' :
                'border-transparent hover:border-border hover:bg-background/60'
              )}>

                <span className="num block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                  Slide {s.index}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-[12px] font-medium leading-snug">{s.title}</span>
              </button>
            </li>
          )}
        </ol>

        <PreviewPane className="max-h-[66vh]">
          <div className="px-7 py-8">
            <p className="num text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
              Slide {slide.index} of {data.slides.length}
            </p>
            <h3 className="mt-2 text-[20px] font-semibold tracking-tight">{slide.title}</h3>
            {slide.lines.length > 0 &&
            <ul className="mt-5 space-y-2.5">
                {slide.lines.map((line, i) =>
              <li key={i} className="flex gap-3 text-[13.5px] leading-relaxed">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary/60" aria-hidden />
                    <span>{line}</span>
                  </li>
              )}
              </ul>
            }
            {slide.notes &&
            <div className="mt-7 rounded-lg border border-border bg-muted/30 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                  Presenter notes
                </p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted-foreground">{slide.notes}</p>
              </div>
            }
            <p className="mt-7 text-[11.5px] leading-relaxed text-muted-foreground">
              Text and structure are extracted from the deck. Images, animations and embedded media
              are not rendered, because doing so would mean resolving relationships the document
              controls.
            </p>
          </div>
        </PreviewPane>
      </div>
    </div>);

}

export function LegacyOfficeRenderer({ signature }: RendererProps) {
  return (
    <RendererNotice
      tone="warn"
      title={`${signature.label} cannot be previewed safely`}
      body="The 97–2003 binary formats carry executable streams that no browser can parse without risk. The item stays sealed and intact — convert it to a modern format (.docx, .xlsx, .pptx) and seal that instead, or ask the owner for a release grant." />);


}