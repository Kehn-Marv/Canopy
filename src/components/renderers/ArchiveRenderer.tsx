import { File, Folder, ShieldAlert } from 'lucide-react';
import { listArchive } from '../../lib/ooxml';
import { formatBytes } from '../../lib/format';
import { PREVIEW_LIMITS } from '../../lib/filetype';
import { cn } from '../../lib/cn';
import {
  PreviewPane,
  RendererNotice,
  RendererSkeleton,
  TruncationNote,
  useAsyncResource } from
'./primitives';
import type { RendererProps } from './primitives';

/**
 * Archives are listed, never expanded.
 *
 * Only the central directory is read, so a decompression bomb is detected
 * from its declared ratio before a single byte is inflated. Entry names are
 * normalised first: absolute paths and `..` traversal segments are dropped
 * rather than displayed.
 */
export function ArchiveRenderer({ blob, signature }: RendererProps) {
  const zipReadable = signature.mime === 'application/zip' || signature.ext === 'zip' ||
  ['odt', 'ods', 'odp', 'epub', 'jar'].includes(signature.ext);

  const { data, error, loading } = useAsyncResource(
    () => zipReadable ? listArchive(blob) : Promise.reject(new Error('unsupported')),
    [blob, zipReadable]
  );

  if (!zipReadable) {
    return (
      <RendererNotice
        tone="muted"
        title={`${signature.label} is listed, not opened`}
        body="Canopy only inspects zip-family containers. This archive stays sealed; unpack it in a trusted environment if you genuinely need its contents." />);

  }

  if (loading) return <RendererSkeleton label="Reading archive index" />;
  if (error || !data) {
    return (
      <RendererNotice
        tone="danger"
        title="This archive could not be listed"
        body={error ?? 'The container index is unreadable or damaged.'} />);

  }

  return (
    <div>
      {data.bombRisk &&
      <div className="flex items-start gap-2 border-b border-destructive/25 bg-destructive/8 px-4 py-2.5">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" aria-hidden />
          <p className="text-[11.5px] leading-relaxed text-destructive">
            This archive declares an extreme compression ratio, the signature of a decompression
            bomb. Canopy lists it but will not expand any entry.
          </p>
        </div>
      }
      {data.rejectedPaths > 0 &&
      <div className="border-b border-warn/25 bg-warn/8 px-4 py-2.5 text-[11.5px] leading-relaxed text-warn">
          {data.rejectedPaths} entry name(s) were hidden: they used absolute paths or `..` traversal,
          which is how a malicious archive tries to write outside its own folder.
        </div>
      }

      <div className="flex flex-wrap items-center gap-x-4 border-b border-border bg-muted/40 px-4 py-2 text-[11.5px] text-muted-foreground">
        <span className="num">{data.totalEntries.toLocaleString()} entries</span>
        <span className="num">{formatBytes(data.totalUncompressed)} uncompressed</span>
        <span>Index only — nothing is extracted</span>
      </div>

      <PreviewPane>
        <ul className="divide-y divide-border/60">
          {data.entries.map((entry) =>
          <li key={entry.path} className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-accent/20">
              {entry.dir ?
            <Folder className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden /> :
            <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
            }
              <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{entry.path}</span>
              {entry.suspicious &&
            <span className="shrink-0 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-destructive">
                  ratio {Math.round(entry.ratio)}×
                </span>
            }
              <span className={cn('num shrink-0 text-[11px] text-muted-foreground', entry.dir && 'opacity-0')}>
                {formatBytes(entry.uncompressedSize)}
              </span>
            </li>
          )}
        </ul>
        {data.truncated &&
        <TruncationNote>
            Showing the first {PREVIEW_LIMITS.archiveEntries} entries of {data.totalEntries.toLocaleString()}.
          </TruncationNote>
        }
      </PreviewPane>
    </div>);

}