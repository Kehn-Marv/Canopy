import { useMemo, useState } from 'react';
import { Radar, ShieldCheck, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useVault } from '../contexts/VaultContext';
import { PageHeader, StatStrip } from '../components/AppShell';
import { SignalCard } from '../components/SignalCard';
import { ChainBadge, LedgerTable } from '../components/LedgerTable';
import { EmptyState } from '../components/EmptyState';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { RULE_DOCS } from '../lib/detection';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/Select';
import type { ChainReport } from '../lib/ledger';
import type { Signal } from '../types';

export function Signals() {
  const { signals, acks, events, assets, ackSignal, unackSignal, revokeBatch, offboard, verifyLedger } =
  useVault();
  const [showReviewed, setShowReviewed] = useState(false);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [report, setReport] = useState<ChainReport | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [pendingAction, setPendingAction] = useState<Signal | null>(null);

  const ackedIds = useMemo(() => new Set(acks.map((a) => a.id)), [acks]);
  const visible = signals.filter((s) => showReviewed ? true : !ackedIds.has(s.id));
  const high = signals.filter((s) => s.severity === 'high' && !ackedIds.has(s.id)).length;

  const eventTypes = useMemo(() => Array.from(new Set(events.map((e) => e.type))).sort(), [events]);
  const filteredEvents = useMemo(() => {
    const term = query.trim().toLowerCase();
    return events.
    filter((e) => typeFilter === 'all' || e.type === typeFilter).
    filter(
      (e) =>
      !term ||
      e.actorLabel.toLowerCase().includes(term) ||
      e.deviceLabel.toLowerCase().includes(term) ||
      e.type.includes(term) ||
      assets.find((a) => a.id === e.assetId)?.name.toLowerCase().includes(term)
    ).
    slice(0, 300);
  }, [events, query, typeFilter, assets]);

  const runVerify = async () => {
    setVerifying(true);
    try {
      const result = await verifyLedger();
      setReport(result);
      toast[result.valid ? 'success' : 'error'](
        result.valid ?
        `${result.total} entries recomputed from the genesis hash. The chain is intact.` :
        `Chain broken at entry #${result.brokenAt}. ${result.reason}`
      );
    } finally {
      setVerifying(false);
    }
  };

  const runAction = async (signal: Signal) => {
    if (signal.action.kind === 'revoke_grants') {
      const count = await revokeBatch(signal.action.grantIds, `Acted on signal: ${signal.title}`);
      toast.success(`${count} link(s) revoked.`);
    } else if (signal.action.kind === 'offboard_person') {
      const count = await offboard(signal.action.personId);
      toast.success(`Offboarded. ${count} link(s) closed in one action.`);
    }
    await ackSignal(signal.id, `Acted: ${signal.action.label}`);
  };

  return (
    <div>
      <PageHeader
        title="Signals"
        subtitle="Clear security rules checking the audit history. No hidden algorithms, just plain alerts telling you exactly what was detected."
        actions={
        <Button variant="outline" size="sm" onClick={() => setShowReviewed((v) => !v)}>
            {showReviewed ? 'Hide reviewed' : 'Show reviewed'}
          </Button>
        } />
      

      <StatStrip
        items={[
        { label: 'Open signals', value: String(signals.length - acks.length), tone: high ? 'danger' : undefined },
        { label: 'High severity', value: String(high), tone: high ? 'danger' : undefined },
        { label: 'Reviewed', value: String(acks.length), tone: 'ok' },
        { label: 'Ledger entries', value: String(events.length) }]
        } />
      

      <Tabs defaultValue="signals" className="px-4 py-5 sm:px-6 lg:px-8">
        <TabsList className="flex gap-1.5 sm:gap-2">
          <TabsTrigger value="signals">Signals</TabsTrigger>
          <TabsTrigger value="ledger">Audit ledger</TabsTrigger>
        </TabsList>

        <TabsContent value="signals" className="mt-4 space-y-3">
          {visible.length ?
          visible.map((signal) =>
          <SignalCard
            key={signal.id}
            signal={signal}
            assets={assets}
            events={events}
            acked={ackedIds.has(signal.id)}
            onAck={() => void ackSignal(signal.id, 'Reviewed, no action needed')}
            onUnack={() => void unackSignal(signal.id)}
            onAct={() => setPendingAction(signal)} />

          ) :

          <EmptyState
            icon={<Radar className="h-7 w-7" />}
            title={signals.length ? 'Everything has been reviewed' : 'Nothing looks wrong'}
            body={
            signals.length ?
            'Reviewed signals are hidden. Show them again if you want to re-check a decision.' :
            'The rules are running over every ledger entry as it is written. They will surface here the moment something matches.'
            } />

          }
        </TabsContent>

        <TabsContent value="ledger" className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3 border-b border-border/60 pb-4">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/80" />
              <Input
                value={query}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
                placeholder="Search people, devices, items"
                className="pl-9 transition-elegant focus-visible:bg-background/80"
                aria-label="Search the ledger" />
              
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-auto min-w-[10rem]" aria-label="Filter by event type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All event types</SelectItem>
                {eventTypes.map((type) =>
                <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button variant="outline" className="gap-2" onClick={() => void runVerify()} disabled={verifying}>
              <ShieldCheck className="h-4 w-4" />
              {verifying ? 'Recomputing…' : 'Verify chain'}
            </Button>
          </div>
          {report && <ChainBadge report={report} />}
          <div className="squircle-element overflow-hidden border border-border/80 bg-card shadow-sm">
            <LedgerTable
              events={filteredEvents}
              assets={assets}
              emptyLabel="No entries match that filter." />
            
          </div>
          {events.length > 300 &&
          <p className="text-[11.5px] text-muted-foreground">
              Showing the 300 most recent of {events.length} entries. Verification always runs over the
              whole chain.
            </p>
          }
        </TabsContent>

      </Tabs>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={pendingAction?.action.label ?? 'Act on this signal'}
        description={
        pendingAction?.action.kind === 'offboard_person' ?
        'Every link this person holds is revoked in one transaction and they are marked as offboarded. The ledger keeps the full record.' :
        'The wrapped keys for these links are destroyed. They stop working everywhere, immediately.'
        }
        confirmLabel="Do it"
        destructive
        onConfirm={async () => {
          if (pendingAction) await runAction(pendingAction);
          setPendingAction(null);
        }} />
      
    </div>);

}