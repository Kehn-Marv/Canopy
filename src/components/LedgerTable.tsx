import React from 'react';
import { DENY_EVENTS, EVENT_LABELS } from '../lib/ledger';
import { formatDateTime, relativeTime } from '../lib/format';
import { Chip } from './Chips';
import { cn } from '../lib/cn';
import type { Asset, LedgerEvent } from '../types';

function toneFor(event: LedgerEvent): 'ok' | 'warn' | 'danger' | 'muted' | 'seal' {
  if (DENY_EVENTS.includes(event.type)) return 'danger';
  if (event.type === 'capture.attempt') return 'warn';
  if (event.type.startsWith('grant.revoked') || event.type === 'person.offboarded') return 'warn';
  if (event.type === 'asset.sealed' || event.type === 'grant.created') return 'seal';
  return 'muted';
}

function detailText(event: LedgerEvent): string[] {
  const skip = ['name', 'root', 'chunks', 'bytes', 'iv', 'salt', 'encryptedKey', 'form', 'owner'];
  return Object.entries(event.detail).
  filter(([key, value]) => value !== null && value !== '' && value !== false && !skip.includes(key)).
  map(([key, value]) => {
    if (key === 'expiresAt' && typeof value === 'number') return `expires ${formatDateTime(value)}`;
    if (typeof value === 'boolean') return key;
    return `${key}: ${value}`;
  });
}

import { 
  ChevronDown, ChevronUp, Database, Unlock, Lock, AlertTriangle, PackageOpen, Eye, ExternalLink,
  Trash2, ShieldAlert, Key, Ban, Clock, ShieldX, FileCheck, FileX, CalendarClock, CalendarCheck,
  UserPlus, UserCog, UserMinus, Camera, Box, XOctagon, RefreshCw, Activity 
} from 'lucide-react';

function IconForEvent({ event, tone }: { event: LedgerEvent, tone: string }) {
  const iconClass = cn('h-3.5 w-3.5 shrink-0', {
    'text-ok': tone === 'ok',
    'text-warn': tone === 'warn',
    'text-destructive': tone === 'danger',
    'text-muted-foreground': tone === 'muted',
    'text-primary': tone === 'seal'
  });

  switch (event.type) {
    case 'vault.created': return <Database className={iconClass} />;
    case 'vault.unlocked': return <Unlock className={iconClass} />;
    case 'vault.locked': return <Lock className={iconClass} />;
    case 'vault.unlock_failed': return <AlertTriangle className={iconClass} />;
    case 'asset.sealed': return <PackageOpen className={iconClass} />;
    case 'asset.opened': return <Eye className={iconClass} />;
    case 'asset.exported': return <ExternalLink className={iconClass} />;
    case 'asset.deleted': return <Trash2 className={iconClass} />;
    case 'asset.integrity_failed': return <ShieldAlert className={iconClass} />;
    case 'grant.created': return <Key className={iconClass} />;
    case 'grant.revoked': return <Ban className={iconClass} />;
    case 'grant.expired': return <Clock className={iconClass} />;
    case 'grant.opened': return <Eye className={iconClass} />;
    case 'grant.denied': return <ShieldX className={iconClass} />;
    case 'grant.terms_accepted': return <FileCheck className={iconClass} />;
    case 'grant.terms_declined': return <FileX className={iconClass} />;
    case 'grant.extension_requested': return <CalendarClock className={iconClass} />;
    case 'grant.extended': return <CalendarCheck className={iconClass} />;
    case 'person.added': return <UserPlus className={iconClass} />;
    case 'person.updated': return <UserCog className={iconClass} />;
    case 'person.offboarded': return <UserMinus className={iconClass} />;
    case 'capture.attempt': return <Camera className={iconClass} />;
    case 'container.opened': return <Box className={iconClass} />;
    case 'container.refused': return <XOctagon className={iconClass} />;
    case 'sync.replicated': return <RefreshCw className={iconClass} />;
    default: return <Activity className={iconClass} />;
  }
}

export function LedgerTable({
  events,
  assets,
  emptyLabel = 'Nothing recorded yet.',
  defaultExpanded = false
}: {events: LedgerEvent[];assets: Asset[];emptyLabel?: string; defaultExpanded?: boolean}) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const [limit, setLimit] = React.useState(5);

  if (!events.length) {
    return <p className="px-4 py-10 text-center text-[13px] text-muted-foreground">{emptyLabel}</p>;
  }

  const visibleEvents = events.slice(0, limit);
  const hasMore = events.length > limit;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-6 py-4 text-left transition-elegant hover:bg-muted/30"
      >
        <span className="text-[11px] font-bold uppercase tracking-widest text-foreground/80">
          Audit Ledger ({events.length} events)
        </span>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground/60" /> : <ChevronDown className="h-4 w-4 text-muted-foreground/60" />}
      </button>

      {expanded && (
        <div className="border-t border-border/40">
          <ol className="divide-y divide-border/40">
            {visibleEvents.map((event) => {
              const asset = assets.find((a) => a.id === event.assetId);
              const tone = toneFor(event);
              const details = detailText(event);
              
              return (
                <li key={event.seq} className="flex gap-4 px-4 py-4 sm:px-6 transition-elegant hover:bg-muted/20">
                  <div className="flex w-10 shrink-0 flex-col items-start pt-0.5">
                    <span className="text-[10px] font-bold text-muted-foreground/40">{event.seq.toString().padStart(4, '0')}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <IconForEvent event={event} tone={tone} />
                        <span
                          className={cn(
                            'text-[13px] font-semibold tracking-tight',
                            tone === 'danger' && 'text-destructive',
                            tone === 'warn' && 'text-warn'
                          )}>
                          {EVENT_LABELS[event.type] ?? event.type}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40">
                          · {event.actorLabel}
                        </span>
                      </div>
                      {asset && (
                        <div className="pl-6">
                          <span className="block truncate text-[11.5px] font-medium text-muted-foreground/60">
                            {asset.name}
                          </span>
                        </div>
                      )}
                    </div>
                    
                    {details.length > 0 && (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {details.map((detail, i) => (
                          <span key={i} className="rounded-md bg-muted/50 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-widest text-muted-foreground/70">
                            {detail}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="shrink-0 text-right pt-0.5">
                    <p className="text-[11px] font-medium text-muted-foreground">{relativeTime(event.ts)}</p>
                    <p className="mt-0.5 text-[9.5px] font-medium uppercase tracking-wider text-muted-foreground/40">{formatDateTime(event.ts)}</p>
                  </div>
                </li>);
            })}
          </ol>
          {hasMore && (
            <div className="border-t border-border/40 p-2">
              <button
                type="button"
                onClick={() => setLimit((l) => l + 10)}
                className="w-full rounded-[0.5rem] px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground transition-elegant hover:bg-muted/40 hover:text-foreground"
              >
                Load {Math.min(10, events.length - limit)} more
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ChainBadge({
  report


}: {report: {valid: boolean;total: number;reason: string | null;checkedAt: number;} | null;}) {
  if (!report) return null;
  return report.valid ?
  <Chip tone="ok">
      {report.total} entries verified · chain intact
    </Chip> :

  <Chip tone="danger">Chain broken — {report.reason}</Chip>;

}