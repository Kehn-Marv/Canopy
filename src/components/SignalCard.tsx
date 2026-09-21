import { useState } from 'react';
import { Check, ChevronDown, Undo2 } from 'lucide-react';
import { RULE_DOCS } from '../lib/detection';
import { formatDateTime, relativeTime } from '../lib/format';
import { SeverityChip, Chip, Mono } from './Chips';
import { Button } from './ui/Button';
import { cn } from '../lib/cn';
import type { Asset, LedgerEvent, Signal } from '../types';

export function SignalCard({
  signal,
  assets,
  events,
  acked,
  onAck,
  onUnack,
  onAct








}: {signal: Signal;assets: Asset[];events: LedgerEvent[];acked: boolean;onAck: () => void;onUnack: () => void;onAct: () => void;}) {
  const [expanded, setExpanded] = useState(false);
  const doc = RULE_DOCS.find((d) => d.id === signal.rule);
  const evidence = events.filter((e) => signal.evidence.includes(e.seq)).slice(0, 8);

  return (
    <article
      className={cn(
        'squircle-element border bg-card transition-elegant hover:shadow-sm',
        acked ? 'border-border/60 opacity-70' : signal.severity === 'high' ? 'border-destructive/40 shadow-destructive/5' : 'border-border/80'
      )}>
      
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <SeverityChip value={signal.severity} />
            {doc && <Chip tone="muted">{doc.name}</Chip>}
            {acked && <Chip tone="ok">Reviewed</Chip>}
          </div>
          <h3 className="mt-3 text-[15.5px] font-semibold leading-snug tracking-tight">{signal.title}</h3>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted-foreground">{signal.summary}</p>
          <p className="num mt-2.5 text-[11.5px] text-muted-foreground/80">
            {relativeTime(signal.lastAt)} · {signal.evidence.length} ledger entries ·{' '}
            {signal.assetIds.length} item(s)
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {!acked && signal.action.kind !== 'review' &&
          <Button
            size="sm"
            variant={signal.severity === 'high' ? 'destructive' : 'default'}
            onClick={onAct}>
            
              {signal.action.label}
            </Button>
          }
          {acked ?
          <Button size="sm" variant="ghost" className="gap-1.5" onClick={onUnack}>
              <Undo2 className="h-3.5 w-3.5" /> Reopen
            </Button> :

          <Button size="sm" variant="outline" className="gap-1.5" onClick={onAck}>
              <Check className="h-3.5 w-3.5" /> Mark reviewed
            </Button>
          }
        </div>
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-2 border-t border-border/60 px-5 py-3 text-left text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent/25 hover:text-foreground">
        
        <ChevronDown className={cn('h-4 w-4 transition-transform duration-300', expanded && 'rotate-180')} />
        Evidence and how this rule can be wrong
      </button>

      {expanded &&
      <div className="space-y-4 border-t border-border/60 bg-muted/20 px-5 py-4">
          {doc &&
        <div className="grid gap-2 sm:grid-cols-2">
              <p className="text-[12.5px] leading-relaxed">
                <span className="font-semibold">Triggers on: </span>
                {doc.what}
              </p>
              <p className="text-[12.5px] leading-relaxed text-warn">
                <span className="font-semibold">Blind spot: </span>
                {doc.blindSpot}
              </p>
            </div>
        }
          {evidence.length > 0 ?
        <ol className="space-y-1.5">
              {evidence.map((event) => {
            const asset = assets.find((a) => a.id === event.assetId);
            return (
              <li key={event.seq} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                    <Mono className="text-muted-foreground">#{event.seq}</Mono>
                    <span>{event.type}</span>
                    {asset && <span className="text-muted-foreground">{asset.name}</span>}
                    <span className="num ml-auto text-muted-foreground">{formatDateTime(event.ts)}</span>
                  </li>);

          })}
            </ol> :

        <p className="text-[12px] text-muted-foreground">
              This signal is derived from the state of the grant rather than from individual events.
            </p>
        }
        </div>
      }
    </article>);

}