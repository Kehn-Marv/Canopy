import { useState } from 'react';
import { decodeText, PREVIEW_LIMITS } from '../../lib/filetype';
import { parseDelimited } from '../../lib/csv';
import { readXlsx } from '../../lib/ooxml';
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

export function CsvRenderer({ blob }: RendererProps) {
  const { data, error, loading } = useAsyncResource(async () => {
    const { text, truncated } = await decodeText(blob, PREVIEW_LIMITS.decodeBytes);
    return { table: parseDelimited(text), truncated };
  }, [blob]);

  if (loading) return <RendererSkeleton label="Parsing rows" />;
  if (error || !data) {
    return <RendererNotice tone="danger" title="This dataset could not be parsed" body={error ?? 'Unknown failure.'} />;
  }
  if (!data.table.header.length) {
    return <RendererNotice title="This dataset is empty" body="No rows were found in the file." />;
  }

  const delimiterLabel = data.table.delimiter === '\t' ? 'tab' : `"${data.table.delimiter}"`;

  return (
    <PreviewPane>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-muted/40 px-4 py-2 text-[11.5px] text-muted-foreground">
        <span className="num">{data.table.totalRows.toLocaleString()} rows</span>
        <span className="num">{data.table.header.length} columns</span>
        <span>delimiter {delimiterLabel}</span>
      </div>
      <DataTable header={data.table.header} rows={data.table.rows} caption="Dataset preview" />
      {(data.table.truncated || data.truncated) &&
      <TruncationNote>
          Showing the first {PREVIEW_LIMITS.tableRows.toLocaleString()} rows. The complete dataset stays sealed in the vault.
        </TruncationNote>
      }
    </PreviewPane>);

}

export function XlsxRenderer({ blob }: RendererProps) {
  const { data, error, loading } = useAsyncResource(() => readXlsx(blob), [blob]);
  const [active, setActive] = useState(0);

  if (loading) return <RendererSkeleton label="Opening workbook" />;
  if (error || !data) {
    return (
      <RendererNotice
        tone="danger"
        title="This workbook could not be opened"
        body={error ?? 'The file did not contain readable sheets.'} />);

  }

  const sheet = data.sheets[Math.min(active, data.sheets.length - 1)];
  const [header, ...rows] = sheet.rows;

  return (
    <div>
      <WarningStrip messages={data.warnings} />
      {data.sheets.length > 1 &&
      <div className="flex gap-1 overflow-x-auto border-b border-border bg-muted/40 px-2 py-1.5" role="tablist" aria-label="Worksheets">
          {data.sheets.map((s, i) =>
        <button
          key={s.name}
          type="button"
          role="tab"
          aria-selected={i === active}
          onClick={() => setActive(i)}
          className={cn(
            'shrink-0 rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors',
            i === active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-background/60'
          )}>

              {s.name}
            </button>
        )}
        </div>
      }
      <PreviewPane>
        <div className="flex flex-wrap items-center gap-x-3 border-b border-border bg-muted/30 px-4 py-2 text-[11.5px] text-muted-foreground">
          <span className="num">{sheet.totalRows.toLocaleString()} rows</span>
          <span>Cached cell values only — no formula is evaluated</span>
        </div>
        <DataTable header={header ?? []} rows={rows} caption={`${sheet.name} preview`} />
        {sheet.truncated &&
        <TruncationNote>
            Showing the first {PREVIEW_LIMITS.tableRows.toLocaleString()} rows of this sheet.
          </TruncationNote>
        }
      </PreviewPane>
    </div>);

}