import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Beaker,
  FileText,
  FlaskConical,
  Image as ImageIcon,
  Package,
  Plus,
  Search,
  Share2,
  Table2 } from
'lucide-react';

import { useVault } from '../contexts/VaultContext';
import { PageHeader, StatStrip } from '../components/AppShell';
import { Chip, Mono, SensitivityChip } from '../components/Chips';
import { EmptyState } from '../components/EmptyState';
import { IngestDialog } from '../components/IngestDialog';
import { ShareComposer } from '../components/ShareComposer';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/Select';
import { formatBytes, relativeTime } from '../lib/format';
import { cn } from '../lib/cn';
import type { Asset, AssetKind } from '../types';

const KIND_ICON: Record<AssetKind, React.ComponentType<{className?: string;}>> = {
  document: FileText,
  dataset: Table2,
  image: ImageIcon,
  archive: Package,
  other: Beaker
};

function AssetRow({ asset, onShare }: {asset: Asset;onShare: () => void;}) {
  const { grants, events } = useVault();
  const navigate = useNavigate();
  const Icon = KIND_ICON[asset.kind];
  const live = grants.filter((g) => g.assetId === asset.id && g.status === 'active').length;
  const lastEvent = events.find((e) => e.assetId === asset.id);

  return (
    <li>
      <div className="group flex items-center gap-4 border-b border-border/60 px-4 py-4 transition-elegant hover:bg-accent/25 sm:px-6">
        <button
          type="button"
          onClick={() => navigate(`/item/${asset.id}`)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left">
          
          <span
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center squircle-element-sm border shadow-sm transition-transform duration-300 group-hover:scale-[1.06]',
              asset.sensitivity === 'embargoed' ?
              'border-destructive/30 bg-destructive/10 text-destructive shadow-destructive/5' :
              asset.sensitivity === 'restricted' ?
              'border-warn/30 bg-warn/10 text-warn shadow-warn/5' :
              'border-border/80 bg-muted/50 text-muted-foreground'
            )}>
            
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="truncate text-[13.5px] font-medium">{asset.name}</span>
              {asset.status === 'sealing' && <Chip tone="warn">Sealing</Chip>}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-muted-foreground">
              <span className="truncate">{asset.project || 'Unfiled'}</span>
              <span aria-hidden>·</span>
              <span className="num">{formatBytes(asset.size)}</span>
              <span aria-hidden>·</span>
              <Mono className="text-[10.5px]">sha256:{asset.root.slice(0, 10)}</Mono>
            </span>
          </span>
        </button>

        <div className="hidden shrink-0 items-center gap-2 sm:flex">
          <SensitivityChip value={asset.sensitivity} />
          {live > 0 && <Chip tone="seal">{live} live link{live === 1 ? '' : 's'}</Chip>}
        </div>
        <span className="num hidden w-24 shrink-0 text-right text-[11.5px] text-muted-foreground lg:block">
          {lastEvent ? relativeTime(lastEvent.ts) : '—'}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          onClick={onShare}
          aria-label={`Share ${asset.name}`}
          className="shrink-0 -translate-x-2 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100 focus-visible:translate-x-0 focus-visible:opacity-100 active-scale">
          
          <Share2 className="h-4 w-4" />
        </Button>
      </div>
    </li>);

}

export function Library() {
  const navigate = useNavigate();
  const { assets, grants, signals, acks } = useVault();
  const [query, setQuery] = useState('');
  const [project, setProject] = useState('all');
  const [sensitivity, setSensitivity] = useState('all');
  const [sort, setSort] = useState<'recent' | 'name' | 'size'>('recent');
  const [ingestOpen, setIngestOpen] = useState(false);
  const [dropped, setDropped] = useState<File[]>([]);
  const [shareAsset, setShareAsset] = useState<Asset | null>(null);
  const [dragging, setDragging] = useState(false);

  const projects = useMemo(
    () => Array.from(new Set(assets.map((a) => a.project).filter(Boolean))).sort(),
    [assets]
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return assets.
    filter((a) => a.status !== 'failed').
    filter((a) => !term || a.name.toLowerCase().includes(term) || a.project.toLowerCase().includes(term)).
    filter((a) => project === 'all' || a.project === project).
    filter((a) => sensitivity === 'all' || a.sensitivity === sensitivity).
    sort((a, b) => {
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'size') return b.size - a.size;
      return b.createdAt - a.createdAt;
    });
  }, [assets, query, project, sensitivity, sort]);

  const ackedIds = new Set(acks.map((a) => a.id));
  const openSignals = signals.filter((s) => !ackedIds.has(s.id));
  const totalBytes = assets.reduce((sum, a) => sum + a.size, 0);

  return (
    <div
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        setDropped(Array.from(e.dataTransfer.files));
        setIngestOpen(true);
      }}
      className="relative min-h-full">
      
      <PageHeader
        title="Library"
        subtitle="Everything sealed on this device. Nothing here exists in readable form outside Canopy."
        actions={
        <Button className="gap-2" onClick={() => {setDropped([]);setIngestOpen(true);}}>
            <Plus className="h-4 w-4" /> Seal material
          </Button>
        } />
      

      <StatStrip
        items={[
        { label: 'Items sealed', value: String(assets.length) },
        { label: 'Encrypted volume', value: formatBytes(totalBytes) },
        {
          label: 'Live access',
          value: String(grants.filter((g) => g.status === 'active').length)
        },
        {
          label: 'Open signals',
          value: String(openSignals.length),
          tone: openSignals.some((s) => s.severity === 'high') ? 'danger' : openSignals.length ? 'warn' : undefined
        }]
        } />
      

      <div className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3.5 sm:px-6">
        <form 
          className="relative min-w-[12rem] flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            const val = query.trim();
            if (val.includes('/#/a/')) {
              const match = val.match(/\/#\/a\/([a-zA-Z0-9_-]+)/);
              if (match) {
                navigate(`/a/${match[1]}`);
              }
            } else if (val.length > 20 && !val.includes(' ')) {
              // Might be a raw token
              navigate(`/a/${val}`);
            }
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/80" />
          <Input
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            placeholder="Search, or paste link"
            className="pl-9 transition-elegant focus-visible:bg-background/80"
            aria-label="Search the library" />
        </form>
        <Select value={project} onValueChange={setProject}>
          <SelectTrigger className="w-auto min-w-[8.5rem]" aria-label="Filter by project">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All projects</SelectItem>
            {projects.map((p) =>
            <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            )}
          </SelectContent>
        </Select>
        <Select value={sensitivity} onValueChange={setSensitivity}>
          <SelectTrigger className="w-auto min-w-[8rem]" aria-label="Filter by sensitivity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any sensitivity</SelectItem>
            <SelectItem value="embargoed">Embargoed</SelectItem>
            <SelectItem value="restricted">Restricted</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
          <SelectTrigger className="w-auto min-w-[7.5rem]" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Newest first</SelectItem>
            <SelectItem value="name">By name</SelectItem>
            <SelectItem value="size">Largest first</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {visible.length ?
      <ul>
          {visible.map((asset) =>
        <AssetRow key={asset.id} asset={asset} onShare={() => setShareAsset(asset)} />
        )}
        </ul> :
      assets.length ?
      <div className="p-4 sm:p-6">
          <EmptyState
          icon={<Search className="h-7 w-7" />}
          title="Nothing matches those filters"
          body="Loosen the search or clear the project and sensitivity filters."
          action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setQuery('');
              setProject('all');
              setSensitivity('all');
            }}>
            
                Clear filters
              </Button>
          } />
        
        </div> :

      <div className="p-4 sm:p-6">
          <EmptyState
          icon={<FlaskConical className="h-8 w-8" />}
          title="The vault is empty"
          body="Drag files anywhere on this page to securely seal them."
          action={
          <div className="flex flex-wrap items-center justify-center gap-2">
                <Button onClick={() => {setDropped([]);setIngestOpen(true);}} className="gap-2">
                  <Plus className="h-4 w-4" /> Seal your first item
                </Button>

              </div>
          } />
        
        </div>
      }

      {dragging &&
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-background/40 backdrop-blur-md transition-elegant">
          <div className="glass-panel squircle-element border-primary/40 px-12 py-10 text-center animate-in zoom-in-95 duration-200">
            <p className="text-[17px] font-semibold tracking-tight text-primary">Drop to seal</p>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Encrypted locally, before anything is written.
            </p>
          </div>
        </div>
      }

      <IngestDialog open={ingestOpen} onOpenChange={setIngestOpen} initialFiles={dropped} />
      {shareAsset &&
      <ShareComposer
        asset={shareAsset}
        open={Boolean(shareAsset)}
        onOpenChange={(open) => !open && setShareAsset(null)} />

      }
    </div>);

}