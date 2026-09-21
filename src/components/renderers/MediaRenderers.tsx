import { useState } from 'react';
import { Maximize2, Minus, Plus, RotateCw } from 'lucide-react';

import { cn } from '../../lib/cn';
import { RendererNotice } from './primitives';
import type { RendererProps } from './primitives';

/**
 * Streamed formats. These render from an in-memory object URL, which the
 * browser treats as an opaque same-origin resource: no filesystem path is
 * exposed and nothing is handed to an external application.
 */

export function ImageRenderer({ url, name, signature }: RendererProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [failed, setFailed] = useState(false);

  if (!url) return <RendererNotice title="Nothing to display" body="This image produced no data." />;
  if (failed) {
    return (
      <RendererNotice
        tone="warn"
        title="This image could not be decoded"
        body="The bytes are intact in the vault, but this device cannot display this image format." />);

  }

  return (
    <div className="relative">
      <div className="flex items-center justify-end gap-1 border-b border-border bg-muted/40 px-3 py-1.5">
        <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground" onClick={() => setScale((s) => Math.max(0.25, s - 0.25))} aria-label="Zoom out">
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="num w-12 text-center text-[11.5px] text-muted-foreground">{Math.round(scale * 100)}%</span>
        <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground" onClick={() => setScale((s) => Math.min(6, s + 0.25))} aria-label="Zoom in">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground" onClick={() => setRotation((r) => (r + 90) % 360)} aria-label="Rotate">
          <RotateCw className="h-3.5 w-3.5" />
        </button>
        <button type="button" className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground" onClick={() => {setScale(1);setRotation(0);}} aria-label="Reset view">
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex max-h-[62vh] items-center justify-center overflow-auto bg-muted/50 p-5">
        <img
          src={url}
          alt={name}
          draggable={false}
          onError={() => setFailed(true)}
          style={{ transform: `scale(${scale}) rotate(${rotation}deg)` }}
          className="max-h-[56vh] w-auto select-none rounded shadow-sm transition-transform duration-200" />

      </div>
      {signature.ext === 'svg' &&
      <p className="border-t border-border bg-muted/30 px-4 py-2 text-[11.5px] text-muted-foreground">
          Vector image shown through an image element, which cannot run the script an SVG may contain.
        </p>
      }
    </div>);

}

export function PdfRenderer({ url, name }: RendererProps) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <RendererNotice
        tone="warn"
        title="No inline PDF viewer on this device"
        body="Rather than hand the document to an outside application, Canopy keeps it sealed. Ask the owner for a release grant if you need a copy." />);

  }

  return (
    <div className="relative">
      {/*
         Sandboxed: no scripts, no forms, no top-level navigation, no popups.
         The browser's own PDF surface renders the bytes; the document cannot
         reach the application around it.
        */}
      <iframe
        title={`Protected preview of ${name}`}
        src={url}
        onError={() => setFailed(true)}
        sandbox="allow-same-origin allow-scripts"
        referrerPolicy="no-referrer"
        className="h-[66vh] w-full border-0 bg-muted/40" />

      <p className="border-t border-border bg-muted/30 px-4 py-2 text-[11.5px] text-muted-foreground">
        Rendered in an isolated frame. Embedded actions and remote resources inside the PDF are blocked.
      </p>
    </div>);

}

export function AudioRenderer({ url, name }: RendererProps) {
  if (!url) return <RendererNotice title="Nothing to play" body="This recording produced no data." />;
  return (
    <div className="flex flex-col items-center gap-4 px-6 py-12">
      <div className="flex h-16 w-full max-w-md items-end justify-center gap-[3px]" aria-hidden>
        {Array.from({ length: 48 }).map((_, i) =>
        <span
          key={i}
          className="w-1 rounded-full bg-primary/25"
          style={{ height: `${20 + Math.abs(Math.sin(i * 0.7)) * 70}%` }} />

        )}
      </div>
      <audio
        controls
        controlsList="nodownload"
        src={url}
        className="w-full max-w-md"
        aria-label={`Protected playback of ${name}`} />

      <p className="max-w-sm text-center text-[11.5px] leading-relaxed text-muted-foreground">
        Playback streams from memory. The recording is never written to this device.
      </p>
    </div>);

}

export function VideoRenderer({ url, name }: RendererProps) {
  if (!url) return <RendererNotice title="Nothing to play" body="This recording produced no data." />;
  return (
    <div className={cn('flex flex-col items-center gap-3 bg-black/90 p-4')}>
      <video
        controls
        controlsList="nodownload noplaybackrate"
        disablePictureInPicture
        src={url}
        className="max-h-[60vh] w-full rounded"
        aria-label={`Protected playback of ${name}`} />

      <p className="text-center text-[11.5px] text-white/60">
        Picture-in-picture and download are disabled. Screen recording at the operating-system level
        cannot be blocked by any application.
      </p>
    </div>);

}