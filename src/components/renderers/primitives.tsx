import React, { useEffect, useState } from 'react';
import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { FileSignature } from '../../lib/filetype';

/**
 * Shared building blocks for every file renderer.
 *
 * Renderers receive a decrypted in-memory blob and never write to disk, never
 * inject HTML, and never hand content to another application. Anything a
 * renderer cannot parse must fail into a `RendererNotice`, not a blank frame.
 */
export interface RendererProps {
  name: string;
  size: number;
  blob: Blob;
  /** Object URL for renderers that stream (image, audio, video, PDF). */
  url: string | null;
  signature: FileSignature;
}

export function useAsyncResource<T>(
loader: () => Promise<T>,
deps: React.DependencyList)
: {data: T | null;error: string | null;loading: boolean;} {
  const [state, setState] = useState<{data: T | null;error: string | null;loading: boolean;}>({
    data: null,
    error: null,
    loading: true
  });

  useEffect(() => {
    let alive = true;
    setState({ data: null, error: null, loading: true });
    loader().
    then((data) => {
      if (alive) setState({ data, error: null, loading: false });
    }).
    catch((error: Error) => {
      if (alive) setState({ data: null, error: error.message, loading: false });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

export function PreviewPane({
  children,
  className
}: {children: React.ReactNode;className?: string;}) {
  return (
    <div className={cn('max-h-[68vh] overflow-auto overscroll-contain', className)}>
      {children}
    </div>);

}

export function RendererSkeleton({ label = 'Rendering' }: {label?: string;}) {
  return (
    <div className="space-y-3 px-5 py-6" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <span className="relative block h-1 w-24 overflow-hidden rounded-full bg-muted">
          <span className="absolute inset-y-0 w-1/3 animate-sweep rounded-full bg-primary" />
        </span>
        <span className="text-[12.5px] text-muted-foreground">{label}…</span>
      </div>
      <div className="space-y-2" aria-hidden>
        {[92, 78, 85, 64].map((width) =>
        <div key={width} className="h-3 rounded bg-muted/70" style={{ width: `${width}%` }} />
        )}
      </div>
    </div>);

}

export function RendererNotice({
  tone = 'muted',
  title,
  body,
  children
}: {tone?: 'muted' | 'warn' | 'danger';title: string;body: string;children?: React.ReactNode;}) {
  const Icon = tone === 'danger' ? ShieldAlert : tone === 'warn' ? AlertTriangle : Info;
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <Icon
        className={cn(
          'h-6 w-6',
          tone === 'danger' && 'text-destructive',
          tone === 'warn' && 'text-warn',
          tone === 'muted' && 'text-muted-foreground'
        )}
        aria-hidden />

      <div className="max-w-md space-y-1.5">
        <p className={cn('text-[14px] font-semibold tracking-tight', tone === 'danger' && 'text-destructive')}>
          {title}
        </p>
        <p className="text-[13px] leading-relaxed text-muted-foreground">{body}</p>
      </div>
      {children}
    </div>);

}

export function WarningStrip({ messages }: {messages: string[];}) {
  if (!messages.length) return null;
  return (
    <ul className="space-y-1 border-b border-warn/25 bg-warn/8 px-4 py-2.5">
      {messages.map((message) =>
      <li key={message} className="flex items-start gap-2 text-[11.5px] leading-relaxed text-warn">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>{message}</span>
        </li>
      )}
    </ul>);

}

export function DataTable({
  header,
  rows,
  caption
}: {header: string[];rows: string[][];caption?: string;}) {
  const columns = Math.max(header.length, ...rows.map((r) => r.length), 1);
  return (
    <div className="min-w-full">
      <table className="w-full border-collapse text-[12px]">
        {caption && <caption className="sr-only">{caption}</caption>}
        {header.length > 0 &&
        <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur">
            <tr>
              <th scope="col" className="w-10 border-b border-border px-2 py-2 text-right font-mono text-[10px] font-medium text-muted-foreground/70">
                #
              </th>
              {Array.from({ length: columns }).map((_, i) =>
            <th
              key={i}
              scope="col"
              className="whitespace-nowrap border-b border-border px-3 py-2 text-left font-semibold tracking-tight">

                  {header[i] ?? ''}
                </th>
            )}
            </tr>
          </thead>
        }
        <tbody>
          {rows.map((row, r) =>
          <tr key={r} className="transition-colors odd:bg-muted/30 hover:bg-accent/25">
              <td className="border-b border-border/50 px-2 py-1.5 text-right font-mono text-[10px] text-muted-foreground/60">
                {r + 1}
              </td>
              {Array.from({ length: columns }).map((_, c) =>
            <td key={c} className="num max-w-[22rem] truncate border-b border-border/50 px-3 py-1.5">
                  {row[c] ?? ''}
                </td>
            )}
            </tr>
          )}
        </tbody>
      </table>
    </div>);

}

export function TruncationNote({ children }: {children: React.ReactNode;}) {
  return (
    <p className="sticky bottom-0 border-t border-border bg-background/95 px-4 py-2 text-[11.5px] text-muted-foreground backdrop-blur">
      {children}
    </p>);

}