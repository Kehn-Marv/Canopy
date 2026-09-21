import React from 'react';
import { AlertTriangle, EyeOff, FileWarning, ShieldAlert } from 'lucide-react';
import { useCaptureGuard } from '../hooks/useCaptureGuard';
import { watermarkLines } from '../lib/watermark';
import type { WatermarkIdentity } from '../lib/watermark';
import { Chip } from './Chips';
import { Loading } from './EmptyState';
import { cn } from '../lib/cn';
import { formatBytes } from '../lib/format';
import type { Asset } from '../types';
import { FileRenderer } from './renderers/FileRenderer';


function Watermark({ identity }: {identity: WatermarkIdentity;}) {
  const lines = watermarkLines(identity);
  const tiles = Array.from({ length: 36 });
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-20 overflow-hidden opacity-[0.16] mix-blend-difference">
      
      <div className="absolute left-1/2 top-1/2 flex w-[200%] -translate-x-1/2 -translate-y-1/2 -rotate-[26deg] flex-wrap gap-x-14 gap-y-12">
        {tiles.map((_, i) =>
        <span key={i} className="whitespace-nowrap font-mono text-[10.5px] leading-tight text-foreground">
            {lines.join(' · ')}
          </span>
        )}
      </div>
    </div>);

}
export interface ProtectedViewerProps {
  asset: Asset;
  url: string | null;
  blob: Blob | null;
  integrityOk: boolean;
  loading: boolean;
  error: string | null;
  identity: WatermarkIdentity;
  allowCopy: boolean;
  onCapture: (kind: string) => void;
  footer?: React.ReactNode;
}

/**
 * The only surface on which sealed material is ever rendered. Content is
 * decrypted into an in-memory blob URL, never written to disk by the app, and
 * blanked whenever the window loses focus.
 */
export function ProtectedViewer({
  asset,
  url,
  blob,
  integrityOk,
  loading,
  error,
  identity,
  allowCopy,
  onCapture,
  footer
}: ProtectedViewerProps) {
  const { obscured, attempts } = useCaptureGuard({
    enabled: Boolean(url) && !loading,
    allowCopy,
    onAttempt: (kind) => onCapture(kind)
  });

  return (
    <section
      data-protected="true"
      className="capture-guard relative isolate overflow-hidden rounded-xl border border-border bg-card"
      aria-label={`Protected viewer: ${asset.name}`}>
      
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/50 px-3.5 py-2.5">
        <Chip tone="seal">Protected viewer</Chip>
        <span className="num text-[11.5px] text-muted-foreground">
          {formatBytes(asset.size)} · sha256:{asset.root.slice(0, 12)}
        </span>
        {!integrityOk && !loading &&
        <Chip tone="danger">
            <ShieldAlert className="h-3 w-3" /> Integrity failed
          </Chip>
        }
        {attempts > 0 &&
        <Chip tone="warn">
            <AlertTriangle className="h-3 w-3" /> {attempts} capture attempt(s) logged
          </Chip>
        }
      </div>

      <div className="relative min-h-[320px]">
        {loading &&
        <div className="px-4">
            <Loading label="Decrypting and verifying chunks" />
          </div>
        }

        {!loading && error &&
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <FileWarning className="h-7 w-7 text-destructive" aria-hidden />
            <p className="text-sm font-semibold text-destructive">{error}</p>
          </div>
        }

        {!loading && !error && !integrityOk &&
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <ShieldAlert className="h-7 w-7 text-destructive" aria-hidden />
            <p className="max-w-md text-sm leading-relaxed">
              The stored ciphertext no longer matches its recorded digest, so Canopy will not show
              this item. Refusing is the correct behaviour. A silently repaired file is worse than
              no file. This has been written to the ledger.
            </p>
          </div>
        }

        {!loading && !error && integrityOk && url &&
        <div className={cn('relative', obscured && 'guard-obscured')}>
            <Watermark identity={identity} />
            <div className="max-h-[68vh] overflow-auto">
              <FileRenderer
                name={asset.name}
                mime={asset.mime}
                size={asset.size}
                blob={blob}
                url={url}
              />
            </div>
            {obscured &&
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-background/70 text-center backdrop-blur-sm">
                <EyeOff className="h-6 w-6 text-muted-foreground" aria-hidden />
                <p className="text-sm font-medium">Hidden while this window is not in focus</p>
                <p className="max-w-xs text-[12px] text-muted-foreground">
                  Click back into the window to continue reading.
                </p>
              </div>
          }
          </div>
        }
      </div>

      {footer && <div className="border-t border-border px-3.5 py-3">{footer}</div>}
    </section>);

}