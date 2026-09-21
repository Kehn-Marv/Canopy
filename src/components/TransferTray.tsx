import { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Pause,
  Play,
  RotateCcw,
  Upload,
  X } from
'lucide-react';
import { toast } from 'sonner';
import { useVault } from '../contexts/VaultContext';
import { Button } from './ui/Button';
import { Progress } from './ui/Progress';
import { cn } from '../lib/cn';
import { formatBytes, formatRate } from '../lib/format';
import type { QueueItem } from '../hooks/useTransferQueue';

function statusLabel(item: QueueItem): string {
  switch (item.status) {
    case 'queued':
      return 'Waiting';
    case 'running':
      return `${formatBytes(item.completed * 1024 * 1024)} of ${formatBytes(item.size)}${item.bytesPerSecond ? ` · ${formatRate(item.bytesPerSecond)}` : ''}`;
    case 'paused':
      return item.needsReattach ?
      'Interrupted — reattach the same file to continue' :
      `Paused at chunk ${item.completed} of ${item.chunkCount}`;
    case 'error':
      return item.error ?? 'Failed';
    case 'rejected':
      return item.error ?? 'Rejected';
    case 'cancelled':
      return 'Cancelled';
    case 'done':
      return `Sealed · ${formatBytes(item.size)}`;
    default:
      return '';
  }
}

function TransferRow({ item }: {item: QueueItem;}) {
  const { pauseTransfer, resumeTransfer, cancelTransfer, retryTransfer, reattachTransfer } = useVault();
  const fileInput = useRef<HTMLInputElement>(null);
  const pct = item.chunkCount ? Math.round(item.completed / item.chunkCount * 100) : 0;
  const failed = item.status === 'error' || item.status === 'rejected';

  return (
    <li className="px-3.5 py-3">
      <div className="flex items-start gap-3">
        <div className="mt-0.5">
          {item.status === 'done' ?
          <CheckCircle2 className="h-4 w-4 text-ok" aria-hidden /> :
          failed ?
          <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden /> :

          <Upload className="h-4 w-4 text-muted-foreground" aria-hidden />
          }
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium">{item.name}</p>
          <p className={cn('num mt-0.5 text-[11.5px]', failed ? 'text-destructive' : 'text-muted-foreground')}>
            {statusLabel(item)}
          </p>
          {['queued', 'running', 'paused'].includes(item.status) &&
          <Progress value={pct} className="mt-2 h-1" />
          }
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {item.status === 'running' &&
          <Button size="icon-xs" variant="ghost" onClick={() => pauseTransfer(item.id)} aria-label={`Pause ${item.name}`}>
              <Pause className="h-3.5 w-3.5" />
            </Button>
          }
          {item.status === 'paused' && !item.needsReattach &&
          <Button size="icon-xs" variant="ghost" onClick={() => resumeTransfer(item.id)} aria-label={`Resume ${item.name}`}>
              <Play className="h-3.5 w-3.5" />
            </Button>
          }
          {item.status === 'paused' && item.needsReattach &&
          <>
              <input
              ref={fileInput}
              type="file"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const result = reattachTransfer(item.id, file);
                toast[result.ok ? 'success' : 'error'](result.message);
                e.target.value = '';
              }} />
            
              <Button size="xs" variant="outline" onClick={() => fileInput.current?.click()}>
                Reattach
              </Button>
            </>
          }
          {item.status === 'error' &&
          <Button size="icon-xs" variant="ghost" onClick={() => retryTransfer(item.id)} aria-label={`Retry ${item.name}`}>
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          }
          {['queued', 'running', 'paused'].includes(item.status) &&
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => void cancelTransfer(item.id)}
            aria-label={`Cancel ${item.name}`}>
            
              <X className="h-3.5 w-3.5" />
            </Button>
          }
        </div>
      </div>
    </li>);

}

export function TransferTray() {
  const { transfers, activeTransfers, clearFinishedTransfers } = useVault();
  const [collapsed, setCollapsed] = useState(false);
  if (!transfers.length) return null;

  const totalChunks = activeTransfers.reduce((sum, t) => sum + t.chunkCount, 0);
  const doneChunks = activeTransfers.reduce((sum, t) => sum + t.completed, 0);
  const overall = totalChunks ? Math.round(doneChunks / totalChunks * 100) : 100;

  return (
    <aside
      aria-label="Transfers"
      className="pointer-events-auto fixed bottom-20 right-3 z-40 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-border bg-popover shadow-xl md:bottom-4 md:right-4">
      
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex flex-1 items-center gap-2 text-left"
          aria-expanded={!collapsed}>
          
          <ChevronDown className={cn('h-4 w-4 transition-transform', collapsed && '-rotate-90')} aria-hidden />
          <span className="text-[13px] font-semibold">
            {activeTransfers.length ? `Sealing ${activeTransfers.length} item(s)` : 'Transfers'}
          </span>
          {activeTransfers.length > 0 &&
          <span className="num ml-auto text-[11.5px] text-muted-foreground">{overall}%</span>
          }
        </button>
        {!activeTransfers.length &&
        <Button size="xs" variant="ghost" onClick={clearFinishedTransfers}>
            Clear
          </Button>
        }
      </div>
      {!collapsed &&
      <ul className="max-h-[min(22rem,45vh)] divide-y divide-border overflow-y-auto">
          {transfers.map((item) =>
        <TransferRow key={item.id} item={item} />
        )}
        </ul>
      }
    </aside>);

}