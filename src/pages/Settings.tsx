import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HardDrive, KeyRound, Laptop, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useVault } from '../contexts/VaultContext';
import { cn } from '../lib/cn';

import { PageHeader } from '../components/AppShell';
import { HonestyPanel } from '../components/HonestyPanel';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Chip } from '../components/Chips';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/Select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs';
import { renameDevice } from '../lib/device';
import { flushOutbox, pendingOps } from '../lib/sync';
import { requestPersistence } from '../lib/db';
import { formatBytes, formatDateTime } from '../lib/format';


/* ── refined input className shared across all inputs on this page ── */
const inputCls =
  'h-10 bg-background/50 shadow-sm transition-elegant placeholder:text-muted-foreground/30 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0';

/* ── lightweight section wrapper: no heavy card, just clean grouping ── */
function Section({
  title,
  description,
  children,
  noDivider = false
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  noDivider?: boolean;
}) {
  return (
    <>
      {!noDivider && <div className="h-px w-full bg-border/30" />}
      <section className="py-1">
        <h2 className="text-[14px] font-semibold tracking-[-0.01em]">{title}</h2>
        {description && (
          <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-muted-foreground/70">
            {description}
          </p>
        )}
        <div className="mt-5 space-y-4">{children}</div>
      </section>
    </>
  );
}

export function Settings() {
  const {
    meta, device, devices, storage, peers, outboxCount, online,
    saveSettings, rotatePassphrase, destroyVault, assets, events
  } = useVault();

  const navigate = useNavigate();

  const [labName, setLabName] = useState(meta?.labName ?? '');
  const [orgDomain, setOrgDomain] = useState(meta?.orgDomain ?? '');
  const [autoLock, setAutoLock] = useState(String(meta?.autoLockMinutes ?? 15));
  const [defaultTtl, setDefaultTtl] = useState(String(meta?.defaultGrantTtlHours ?? 168));
  const [deviceLabel, setDeviceLabel] = useState(device?.label ?? '');
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [rotating, setRotating] = useState(false);
  const [destroyOpen, setDestroyOpen] = useState(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    setLabName(meta?.labName ?? '');
    setOrgDomain(meta?.orgDomain ?? '');
    setAutoLock(String(meta?.autoLockMinutes ?? 15));
    setDefaultTtl(String(meta?.defaultGrantTtlHours ?? 168));
  }, [meta]);

  useEffect(() => {
    setDeviceLabel(device?.label ?? '');
  }, [device]);

  useEffect(() => {
    void pendingOps().then((ops) => setPending(ops.length));
  }, [outboxCount]);

  const rotate = async () => {
    if (next !== confirm) return toast.error('The new passwords do not match.');
    setRotating(true);
    try {
      await rotatePassphrase(current, next);
      toast.success('Password updated successfully. Please unlock again to continue.');
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRotating(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Manage your vault, security, storage, and preferences." />

      <Tabs defaultValue="vault" className="px-4 py-5 sm:px-6 lg:px-8">
        <TabsList className="flex gap-1.5 sm:gap-2">
          <TabsTrigger value="vault">General</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
          <TabsTrigger value="limits">Transparency</TabsTrigger>
        </TabsList>

        {/* ═══════════════════════ GENERAL TAB ═══════════════════════ */}
        <TabsContent value="vault" className="mt-6 space-y-8">

          {/* ── Identity ── */}
          <Section
            title="Identity"
            description="Your organization details. Used to identify team members and external collaborators."
            noDivider>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="lab" className="text-[12px] font-medium text-muted-foreground">
                  Laboratory
                </Label>
                <Input id="lab" className={inputCls} value={labName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLabName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="domain" className="text-[12px] font-medium text-muted-foreground">
                  Institutional domain
                </Label>
                <Input id="domain" className={inputCls} value={orgDomain} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOrgDomain(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="text-[12px]"
                onClick={() =>
                  void saveSettings({ labName: labName.trim(), orgDomain: orgDomain.trim().toLowerCase() }).then(
                    () => toast.success('Identity saved.')
                  )
                }>
                Save changes
              </Button>
            </div>
          </Section>

          {/* ── Defaults ── */}
          <Section
            title="Access defaults"
            description="How long things stay open. Shorter defaults are safer. You can always extend access when needed.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="autolock" className="text-[12px] font-medium text-muted-foreground">
                  Auto-lock after inactivity
                </Label>
                <Select value={autoLock} onValueChange={setAutoLock}>
                  <SelectTrigger id="autolock" className="h-10 bg-background/50 shadow-sm focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 minutes</SelectItem>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="60">1 hour</SelectItem>
                    <SelectItem value="0">Never (not recommended)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ttl-default" className="text-[12px] font-medium text-muted-foreground">
                  Shared links expire after
                </Label>
                <Select value={defaultTtl} onValueChange={setDefaultTtl}>
                  <SelectTrigger id="ttl-default" className="h-10 bg-background/50 shadow-sm focus:ring-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="4">4 hours</SelectItem>
                    <SelectItem value="24">24 hours</SelectItem>
                    <SelectItem value="168">7 days</SelectItem>
                    <SelectItem value="720">30 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="text-[12px]"
                onClick={() =>
                  void saveSettings({
                    autoLockMinutes: Number(autoLock),
                    defaultGrantTtlHours: Number(defaultTtl)
                  }).then(() => toast.success('Defaults updated.'))
                }>
                Save changes
              </Button>
            </div>
          </Section>


        </TabsContent>

        {/* ═══════════════════════ SECURITY TAB ═══════════════════════ */}
        <TabsContent value="security" className="mt-6 space-y-8">

          {/* ── Change password ── */}
          <Section
            title="Change password"
            description="Update your vault password. All your files stay intact."
            noDivider>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="cur" className="text-[12px] font-medium text-muted-foreground">
                  Current password
                </Label>
                <Input id="cur" type="password" className={inputCls} value={current} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCurrent(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new" className="text-[12px] font-medium text-muted-foreground">
                  New password
                </Label>
                <Input id="new" type="password" className={inputCls} value={next} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNext(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="conf" className="text-[12px] font-medium text-muted-foreground">
                  Confirm new password
                </Label>
                <Input id="conf" type="password" className={inputCls} value={confirm} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirm(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                className="gap-2 text-[12px]"
                disabled={rotating || !current || next.length < 10}
                onClick={() => void rotate()}>
                <KeyRound className="h-3.5 w-3.5" />
                {rotating ? 'Updating...' : 'Update password'}
              </Button>
            </div>
          </Section>

          {/* ── This device ── */}
          <Section
            title="Devices"
            description="Devices that have accessed this vault. Rename yours or review the list.">
            <div className="flex items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dev" className="text-[12px] font-medium text-muted-foreground">
                  This device's name
                </Label>
                <Input
                  id="dev"
                  value={deviceLabel}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDeviceLabel(e.target.value)}
                  className={`w-64 ${inputCls}`} />
              </div>
              <Button
                variant="outline"
                className="h-10 text-[12px]"
                onClick={() =>
                  void renameDevice(deviceLabel).then(() => toast.success('Device renamed.'))
                }>
                Rename
              </Button>
            </div>
            <ul className="mt-6 space-y-3">
              {devices.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between squircle-element border border-border/60 bg-background/40 p-5 transition-elegant hover:bg-accent/25 hover:shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="rounded-[0.5rem] border border-border/50 bg-muted/30 p-2 shadow-sm transition-transform duration-300 hover:scale-105">
                      <Laptop className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-[13px]">
                      <span className="font-medium text-foreground/90">{d.label}</span>
                      {d.id === device?.id && <Chip tone="seal">Current</Chip>}
                      <span className="hidden text-muted-foreground/50 sm:inline">·</span>
                      <span className="text-muted-foreground/70">{d.platform}</span>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="num block text-[11px] text-muted-foreground/60">
                      {formatDateTime(d.lastSeen)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          {/* ── Danger zone ── */}
          <Section title="Danger zone">
            <div className="flex flex-col gap-5 squircle-element border border-destructive/20 bg-destructive/5 px-5 py-5 transition-elegant hover:bg-destructive/10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex flex-wrap items-center gap-2 text-[13px]">
                <h3 className="font-semibold tracking-tight text-destructive">Delete this vault</h3>
                <span className="hidden text-destructive/40 sm:inline">·</span>
                <p className="text-destructive/80">
                  Permanently erase all files, encryption keys, shared links, and audit history from this device. This cannot be undone.
                </p>
              </div>
              <Button variant="destructive" className="shrink-0 gap-2 text-[12.5px] shadow-destructive/10" onClick={() => setDestroyOpen(true)}>
                <Trash2 className="h-4 w-4" /> Delete vault
              </Button>
            </div>
          </Section>
        </TabsContent>

        {/* ═══════════════════════ STORAGE TAB ═══════════════════════ */}
        <TabsContent value="storage" className="mt-6 space-y-8">

          {/* ── Usage ── */}
          <Section title="Storage usage" description="How much space your vault is using on this device." noDivider>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: 'Used', value: formatBytes(storage?.usage ?? 0) },
                { label: 'Available', value: formatBytes(storage?.quota ?? 0) },
                { label: 'Files', value: String(assets.length) }
              ].map((stat) => (
                <div key={stat.label} className="squircle-element border border-border/40 bg-background/50 px-5 py-4 shadow-sm transition-elegant hover:border-border/60">
                  <p className="text-[10.5px] font-medium uppercase tracking-widest text-muted-foreground/60">
                    {stat.label}
                  </p>
                  <p className="num mt-2 text-[22px] font-semibold tracking-tight">{stat.value}</p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                className="gap-2 text-[12px]"
                onClick={() =>
                  void requestPersistence().then((ok) => {
                    setPersisted(ok);
                    toast[ok ? 'success' : 'warning'](
                      ok
                        ? 'Storage is now persistent. Your vault is protected from automatic cleanup.'
                        : 'Could not enable persistent storage. Keep backups of important files.'
                    );
                  })
                }>
                <HardDrive className="h-3.5 w-3.5" /> Enable persistent storage
              </Button>
              {persisted !== null && (
                <Chip tone={persisted ? 'ok' : 'warn'}>
                  {persisted ? 'Persistent' : 'Standard'}
                </Chip>
              )}
            </div>
          </Section>

          {/* ── Sync ── */}
          <Section
            title="Sync"
            description="Canopy syncs between open windows on this device. Open a second tab to see it work.">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className={cn("font-medium", online ? "text-ok" : "text-warn")}>
                {online ? 'Online' : 'Offline'}
              </span>
              <span className="hidden text-muted-foreground/50 sm:inline">·</span>
              <span className={cn(peers > 0 ? "text-foreground/90" : "text-muted-foreground/70")}>
                {peers} open tab{peers !== 1 ? 's' : ''}
              </span>
              <span className="hidden text-muted-foreground/50 sm:inline">·</span>
              <span className={cn(pending > 0 ? "text-warn font-medium" : "text-muted-foreground/70")}>
                {pending} pending
              </span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto gap-2 text-[12px]"
                onClick={() =>
                  void flushOutbox().then(({ delivered, remaining }) => {
                    setPending(remaining);
                    toast[delivered ? 'success' : 'info'](
                      delivered
                        ? `Synced ${delivered} change${delivered !== 1 ? 's' : ''}.`
                        : remaining
                        ? 'No other tabs found. Changes will sync when another tab opens.'
                        : 'Everything is up to date.'
                    );
                  })
                }>
                <RefreshCw className="h-3.5 w-3.5" /> Sync now
              </Button>
            </div>
            <p className="text-[11.5px] text-muted-foreground/50">
              {events.length} audit records stored on this device.
            </p>
          </Section>
        </TabsContent>

        {/* ═══════════════════════ TRANSPARENCY TAB ═══════════════════════ */}
        <TabsContent value="limits" className="mt-6 space-y-8">
          <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground/80">
            Security tools should be honest about what they can and cannot do.
            Here is exactly where Canopy's protection starts and stops.
          </p>
          <HonestyPanel />
          <Section title="Offline and interruptions" description="What happens when things go wrong." noDivider>
            <div className="grid gap-4 sm:grid-cols-2 mt-2">
              <div className="rounded-2xl border border-border/40 bg-muted/5 p-5 shadow-sm transition-colors hover:bg-muted/10">
                <h4 className="text-[13.5px] font-semibold text-foreground flex items-center gap-2.5">
                   <div className="h-2 w-2 shrink-0 rounded-full bg-primary/60" /> Works offline
                </h4>
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  Everything important (encrypting, sharing, revoking, auditing) works without an internet connection.
                </p>
              </div>
              
              <div className="rounded-2xl border border-border/40 bg-muted/5 p-5 shadow-sm transition-colors hover:bg-muted/10">
                <h4 className="text-[13.5px] font-semibold text-foreground flex items-center gap-2.5">
                   <div className="h-2 w-2 shrink-0 rounded-full bg-primary/60" /> Upload interrupted?
                </h4>
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  Progress is saved every 1 MB. Just reattach the same file and it picks up where it left off.
                </p>
              </div>

              <div className="rounded-2xl border border-border/40 bg-muted/5 p-5 shadow-sm transition-colors hover:bg-muted/10">
                <h4 className="text-[13.5px] font-semibold text-foreground flex items-center gap-2.5">
                   <div className="h-2 w-2 shrink-0 rounded-full bg-primary/60" /> Coming back after a break
                </h4>
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  Expired links are automatically cleaned up when you unlock, and you will see how many closed while you were away.
                </p>
              </div>
              
              <div className="rounded-2xl border border-border/40 bg-warn/5 p-5 shadow-sm transition-colors hover:bg-warn/10">
                <h4 className="text-[13.5px] font-semibold text-foreground flex items-center gap-2.5">
                   <div className="h-2 w-2 shrink-0 rounded-full bg-warn/80 shadow-[0_0_8px_var(--warn)]" /> The honest gap
                </h4>
                <p className="mt-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                  If you revoke someone's access while they are offline, the change cannot reach them until they reconnect. During that window, their local copy still works. This is why short expiry times matter.
                </p>
              </div>
            </div>
          </Section>
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={destroyOpen}
        onOpenChange={setDestroyOpen}
        title="Delete this vault permanently"
        description="All files, encryption keys, shared links, and audit history will be permanently erased from this device. This cannot be undone."
        confirmLabel="Delete everything"
        destructive
        requireReason
        reasonLabel={`Type "${meta?.labName ?? ''}" to confirm`}
        onConfirm={async (reason) => {
          if (reason.trim() !== (meta?.labName ?? '').trim()) {
            throw new Error('That does not match the vault name.');
          }
          await destroyVault();
          toast.success('Vault deleted.');
          navigate('/');
        }} />
    </div>
  );
}