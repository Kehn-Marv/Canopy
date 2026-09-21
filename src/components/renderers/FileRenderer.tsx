import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { FileQuestion, ShieldAlert } from 'lucide-react';
import { detectFileType, PREVIEW_LIMITS } from '../../lib/filetype';
import type { FileSignature, PreviewKind } from '../../lib/filetype';
import { formatBytes } from '../../lib/format';
import { RendererNotice, RendererSkeleton } from './primitives';
import type { RendererProps } from './primitives';

/**
 * The single dispatch point for previewing sealed material.
 *
 * Adding a format means adding one entry to REGISTRY — no call site changes.
 * Every renderer receives the same props, runs inside an error boundary, and
 * is expected to refuse rather than guess. Formats with no safe in-browser
 * representation fall through to a refusal, which is a correct outcome, not
 * a gap.
 */

type RendererComponent = React.ComponentType<RendererProps>;

interface RegistryEntry {
  id: string;
  kinds: PreviewKind[];
  load: () => Promise<{default: RendererComponent;}>;
}

const REGISTRY: RegistryEntry[] = [
{
  id: 'image',
  kinds: ['image'],
  load: () => import('./MediaRenderers').then((m) => ({ default: m.ImageRenderer }))
},
{
  id: 'pdf',
  kinds: ['pdf'],
  load: () => import('./MediaRenderers').then((m) => ({ default: m.PdfRenderer }))
},
{
  id: 'audio',
  kinds: ['audio'],
  load: () => import('./MediaRenderers').then((m) => ({ default: m.AudioRenderer }))
},
{
  id: 'video',
  kinds: ['video'],
  load: () => import('./MediaRenderers').then((m) => ({ default: m.VideoRenderer }))
},
{
  id: 'markdown',
  kinds: ['markdown'],
  load: () => import('./DocumentRenderers').then((m) => ({ default: m.MarkdownRenderer }))
},
{
  id: 'json',
  kinds: ['json'],
  load: () => import('./DocumentRenderers').then((m) => ({ default: m.JsonRenderer }))
},
{
  id: 'xml',
  kinds: ['xml'],
  load: () => import('./DocumentRenderers').then((m) => ({ default: m.XmlRenderer }))
},
{
  id: 'html',
  kinds: ['html'],
  load: () => import('./DocumentRenderers').then((m) => ({ default: m.HtmlSourceRenderer }))
},
{
  id: 'text',
  kinds: ['text', 'code'],
  load: () => import('./DocumentRenderers').then((m) => ({ default: m.TextRenderer }))
},
{
  id: 'csv',
  kinds: ['csv'],
  load: () => import('./TableRenderers').then((m) => ({ default: m.CsvRenderer }))
},
{
  id: 'xlsx',
  kinds: ['xlsx'],
  load: () => import('./TableRenderers').then((m) => ({ default: m.XlsxRenderer }))
},
{
  id: 'docx',
  kinds: ['docx'],
  load: () => import('./OfficeRenderers').then((m) => ({ default: m.DocxRenderer }))
},
{
  id: 'pptx',
  kinds: ['pptx'],
  load: () => import('./OfficeRenderers').then((m) => ({ default: m.PptxRenderer }))
},
{
  id: 'legacy-office',
  kinds: ['legacy-office'],
  load: () => import('./OfficeRenderers').then((m) => ({ default: m.LegacyOfficeRenderer }))
},
{
  id: 'archive',
  kinds: ['archive'],
  load: () => import('./ArchiveRenderer').then((m) => ({ default: m.ArchiveRenderer }))
}];


const LAZY = new Map<string, RendererComponent>();

function rendererFor(kind: PreviewKind): RendererComponent | null {
  const entry = REGISTRY.find((r) => r.kinds.includes(kind));
  if (!entry) return null;
  const cached = LAZY.get(entry.id);
  if (cached) return cached;
  const component = lazy(entry.load) as unknown as RendererComponent;
  LAZY.set(entry.id, component);
  return component;
}

/** Formats Canopy knows about, for the capability list in Settings. */
export function supportedFormats(): {group: string;formats: string;}[] {
  return [
  { group: 'Documents', formats: 'PDF · DOCX · Markdown · TXT · RTF text · LaTeX' },
  { group: 'Data', formats: 'CSV · TSV · XLSX · JSON · NDJSON · XML' },
  { group: 'Slides', formats: 'PPTX (text and structure)' },
  { group: 'Images', formats: 'PNG · JPEG · GIF · WebP · BMP · TIFF · SVG' },
  { group: 'Media', formats: 'MP3 · WAV · FLAC · OGG · MP4 · WebM' },
  { group: 'Code', formats: '30+ source languages, shown with line numbers' },
  { group: 'Containers', formats: 'ZIP family, listed without extraction' }];

}

class RendererBoundary extends React.Component<
  {children: React.ReactNode;onError: (message: string) => void;},
  {failed: boolean;}>
{
  constructor(props: {children: React.ReactNode;onError: (message: string) => void;}) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error.message);
  }

  render() {
    if (this.state.failed) {
      return (
        <RendererNotice
          tone="danger"
          title="This preview stopped safely"
          body="The renderer hit malformed content and was shut down before it could affect the rest of the app. The sealed original is untouched." />);

    }
    return this.props.children;
  }
}

export interface FileRendererProps {
  name: string;
  mime: string;
  size: number;
  blob: Blob | null;
  url: string | null;
  onSignature?: (signature: FileSignature) => void;
  onRendererError?: (message: string) => void;
}

export function FileRenderer({
  name,
  mime,
  size,
  blob,
  url,
  onSignature,
  onRendererError
}: FileRendererProps) {
  const [signature, setSignature] = useState<FileSignature | null>(null);
  const [detecting, setDetecting] = useState(true);

  useEffect(() => {
    let alive = true;
    setDetecting(true);
    void detectFileType(name, mime, blob).then((result) => {
      if (!alive) return;
      setSignature(result);
      setDetecting(false);
      onSignature?.(result);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, mime, blob]);

  const props = useMemo<RendererProps | null>(
    () => blob && signature ? { name, size, blob, url, signature } : null,
    [blob, signature, name, size, url]
  );

  if (detecting || !signature || !props) return <RendererSkeleton label="Identifying format" />;

  if (signature.kind === 'executable') {
    return (
      <RendererNotice
        tone="danger"
        title="Executable content is never previewed"
        body="This file is a program, not a document. Canopy will not render, run, or hand it to anything else. It remains sealed in the vault." />);

  }

  if (!signature.streamed && size > PREVIEW_LIMITS.decodeBytes) {
    return (
      <RendererNotice
        tone="warn"
        title="Too large to preview in memory"
        body={`This item is ${formatBytes(size)}. Parsing it in the viewer would exhaust memory on a modest laptop, so Canopy refuses. The file itself is intact and can still be shared or released.`} />);

  }

  const Renderer = rendererFor(signature.kind);
  if (!Renderer) {
    return (
      <RendererNotice
        tone="muted"
        title={`No safe viewer for ${signature.label.toLowerCase()}`}
        body="Rather than hand this format to an outside application, Canopy keeps it sealed. Ask the owner for a release grant if you genuinely need a copy.">
        <p className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground/70">
          <FileQuestion className="h-3.5 w-3.5" aria-hidden />
          {signature.mime || 'unknown type'} · {formatBytes(size)}
        </p>
      </RendererNotice>);

  }

  return (
    <div>
      {signature.mismatch &&
      <div className="flex items-start gap-2 border-b border-warn/25 bg-warn/8 px-4 py-2.5">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" aria-hidden />
          <p className="text-[11.5px] leading-relaxed text-warn">
            This file's declared type does not match its actual contents. Canopy trusts the bytes,
            not the label, and is rendering it as {signature.label.toLowerCase()}.
          </p>
        </div>
      }
      <RendererBoundary onError={(message) => onRendererError?.(message)}>
        <Suspense fallback={<RendererSkeleton label="Loading viewer" />}>
          <Renderer {...props} />
        </Suspense>
      </RendererBoundary>
    </div>);

}