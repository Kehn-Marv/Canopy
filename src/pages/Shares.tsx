import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Ban, CalendarClock, Inbox, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useVault } from '../contexts/VaultContext';
import { PageHeader, StatStrip } from '../components/AppShell';
import { Chip, GrantStatusChip, Mono } from '../components/Chips';
import { EmptyState } from '../components/EmptyState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Button } from '../components/ui/Button';
import { Checkbox } from '../components/ui/Checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/Select';
import { effectiveStatus } from '../lib/policy';
import { formatDateTime, formatDuration, relativeTime } from '../lib/format';
import type { GrantStatus } from '../types';

export function Shares() {
  const { grants, people, assets, revoke, revokeBatch, extend } = useVault();
  const [filter, setFilter] = useState<'live' | 'closed' | 'all'>('live');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const rows = useMemo(
    () =>
    grants.
    map((grant) => ({
      grant,
      status: effectiveStatus(grant).status,
      person: people.find((p) => p.id === grant.recipientId),
      asset: assets.find((a) => a.id === grant.assetId)
    })).
    filter(({ status }) =>
    filter === 'all' ? true : filter === 'live' ? status === 'active' : status !== 'active'
    ),
    [grants, people, assets, filter]
  );

  const requests = grants.filter((g) => g.extensionRequest && g.status !== 'revoked');
  const live = grants.filter((g) => effectiveStatus(g).status === 'active');
  const external = live.filter((g) => {
    const person = people.find((p) => p.id === g.recipientId);
    return person && !person.internal;
  });

  const toggle = (id: string) =>
  setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);else
    next.add(id);
    return next;
  });

  const selectableIds = rows.filter((r) => r.status === 'active').map((r) => r.grant.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  return (
    <div>
      <PageHeader
        title="Shared access"
        subtitle="Every link ever issued, who holds it, and what it still permits. Closing one never affects the others."
        actions={
        selected.size > 0 ?
        <Button variant="destructive" className="gap-2" onClick={() => setBulkOpen(true)}>
              <Ban className="h-4 w-4" /> Revoke {selected.size} selected
            </Button> :
        undefined
        } />
      

      <StatStrip
        items={[
        { label: 'Live links', value: String(live.length) },
        { label: 'Outside the institution', value: String(external.length), tone: external.length ? 'warn' : undefined },
        { label: 'Closed or revoked', value: String(grants.length - live.length) },
        { label: 'Extension requests', value: String(requests.length), tone: requests.length ? 'warn' : undefined }]
        } />
      

      {requests.length > 0 &&
      <section className="border-b border-border bg-info/6 px-4 py-4 sm:px-6">
          <h2 className="flex items-center gap-2 text-[13px] font-semibold text-info">
            <Inbox className="h-4 w-4" /> Waiting on you
          </h2>
          <ul className="mt-3 space-y-2">
            {requests.map((grant) => {
            const person = people.find((p) => p.id === grant.recipientId);
            const asset = assets.find((a) => a.id === grant.assetId);
            return (
              <li
                key={grant.id}
                className="flex flex-col gap-2 rounded-lg border border-info/30 bg-card px-3.5 py-3 sm:flex-row sm:items-center">
                
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px]">
                      <span className="font-medium">{person?.name ?? 'Someone'}</span> wants more time with{' '}
                      <span className="font-medium">{asset?.name ?? 'an item'}</span>
                    </p>
                    {grant.extensionRequest?.note &&
                  <p className="mt-0.5 text-[12px] italic text-muted-foreground">
                        “{grant.extensionRequest.note}”
                      </p>
                  }
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                    size="sm"
                    onClick={() =>
                    void extend(grant.id, 168).
                    then(() => toast.success('Reopened for 7 days.')).
                    catch((e) => toast.error((e as Error).message))
                    }>
                    
                      Give 7 days
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setRevokeTarget(grant.id)}>
                      Decline & close
                    </Button>
                  </div>
                </li>);

          })}
          </ul>
        </section>
      }

      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        {selectableIds.length > 0 &&
        <label className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <Checkbox
            checked={allSelected}
            onCheckedChange={(checked: boolean | 'indeterminate') =>
            setSelected(checked ? new Set(selectableIds) : new Set())
            }
            aria-label="Select all live links" />
          
            Select all live
          </label>
        }
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="ml-auto w-auto min-w-[9rem]" aria-label="Filter links">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="live">Live only</SelectItem>
            <SelectItem value="closed">Closed & revoked</SelectItem>
            <SelectItem value="all">Everything</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {rows.length ?
      <ul className="divide-y divide-border">
          {rows.map(({ grant, status, person, asset }) => {
          const { expiresInMs, opensLeft } = effectiveStatus(grant);
          return (
            <li key={grant.id} className="group flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 px-4 py-3.5 sm:px-6 hover:bg-muted/5 transition-colors border-b border-border/20 last:border-0">
                {status === 'active' ?
                  <Checkbox
                    className="mt-0.5 sm:mt-0 flex-shrink-0"
                    checked={selected.has(grant.id)}
                    onCheckedChange={() => toggle(grant.id)}
                    aria-label={`Select link for ${person?.name ?? 'recipient'}`} /> :
                  <span className="w-4 flex-shrink-0 hidden sm:block" />
                }
                
                {/* Left Side: Who and What */}
                <div className="min-w-0 flex-1 flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-semibold text-foreground truncate">
                      {person?.name ?? 'Unknown recipient'}
                    </span>
                    {person?.email && <span className="text-[12.5px] text-muted-foreground truncate">{person.email}</span>}
                    {person && !person.internal && (
                      <span className="ml-1 shrink-0 rounded bg-warn/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warn">External</span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {asset ?
                      <Link to={`/item/${asset.id}`} className="text-[13px] text-foreground/80 hover:text-foreground hover:underline transition-colors truncate">
                        {asset.name}
                      </Link> :
                      <span className="text-[13px] italic text-muted-foreground">Item withdrawn</span>
                    }
                    {grant.mode === 'released' && (
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Copy Released</span>
                    )}
                  </div>
                  
                  {grant.revokedReason &&
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-destructive">
                      <div className="h-1 w-1 rounded-full bg-destructive" />
                      <span className="truncate">{grant.revokedReason}</span>
                    </div>
                  }
                </div>
                
                {/* Right Side: Status, Metadata & Actions */}
                <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-2 sm:gap-1.5 shrink-0 mt-2 sm:mt-0 pl-7 sm:pl-0">
                  <div className="flex items-center gap-3">
                    {/* Hover Actions */}
                    <div className="flex items-center gap-0.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity focus-within:opacity-100">
                      {status !== 'revoked' &&
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                            onClick={() =>
                              void extend(grant.id, 168).
                                then(() => toast.success('Reopened for 7 days.')).
                                catch((e) => toast.error((e as Error).message))
                            }>
                            <CalendarClock className="h-3 w-3" />
                            <span className="hidden sm:inline">+7d</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-[11px] gap-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => setRevokeTarget(grant.id)}>
                            <Ban className="h-3 w-3" />
                            <span className="hidden sm:inline">Revoke</span>
                          </Button>
                        </>
                      }
                    </div>
                    
                    <GrantStatusChip value={status as GrantStatus} />
                  </div>
                  
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span>{grant.opens} open{grant.opens === 1 ? '' : 's'}{opensLeft !== null && ` (${opensLeft} left)`}</span>
                    <span>&middot;</span>
                    <span>
                      {status === 'active' ?
                        grant.expiresAt ?
                          `Closes in ${formatDuration(expiresInMs ?? 0)}` :
                          'No end date' :
                        status === 'revoked' ?
                          `Revoked ${relativeTime(grant.revokedAt ?? grant.createdAt)}` :
                          `Ended`}
                    </span>
                  </div>
                </div>
              </li>);

        })}
        </ul> :

      <div className="p-4 sm:p-6">
          <EmptyState
          icon={<Send className="h-7 w-7" />}
          title={filter === 'live' ? 'No live access right now' : 'Nothing here'}
          body={
          filter === 'live' ?
          'Nobody outside this device can open anything. Share an item from the library when you need to.' :
          'No closed or revoked links yet.'
          } />
        
        </div>
      }

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title="Revoke this access"
        description="The key wrapped for this link is destroyed. It stops working everywhere, immediately, and cannot be restored."
        confirmLabel="Revoke"
        destructive
        requireReason
        reasonLabel="Reason (recorded permanently)"
        onConfirm={async (reason) => {
          if (!revokeTarget) return;
          await revoke(revokeTarget, reason);
          setRevokeTarget(null);
          toast.success('Access revoked.');
        }} />
      

      <ConfirmDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title={`Revoke ${selected.size} link(s)`}
        description="Each wrapped key is destroyed individually. Recipients will see a clear refusal, not a broken page."
        confirmLabel="Revoke all selected"
        destructive
        requireReason
        reasonLabel="Reason (applied to all)"
        onConfirm={async (reason) => {
          const count = await revokeBatch([...selected], reason);
          setSelected(new Set());
          toast.success(`${count} link(s) revoked.`);
        }} />
      
    </div>);

}