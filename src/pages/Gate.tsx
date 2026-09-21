import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useVault } from '../contexts/VaultContext';

import { CanopyMark, Wordmark } from '../components/Brand';
import { ErrorNotice } from '../components/EmptyState';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { cn } from '../lib/cn';

function strength(value: string): {score: number;label: string;tone: string;} {
  let pool = 0;
  if (/[a-z]/.test(value)) pool += 26;
  if (/[A-Z]/.test(value)) pool += 26;
  if (/[0-9]/.test(value)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(value)) pool += 30;
  const bits = value.length * (pool ? Math.log2(pool) : 0);
  if (bits < 45) return { score: 1, label: 'Too easy to guess', tone: 'bg-destructive' };
  if (bits < 70) return { score: 2, label: 'Workable', tone: 'bg-warn' };
  if (bits < 100) return { score: 3, label: 'Strong', tone: 'bg-ok' };
  return { score: 4, label: 'Very strong', tone: 'bg-ok' };
}

function Backdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="surface-grid absolute inset-0 opacity-30" />
      <div className="absolute -left-20 -top-20 h-[22rem] w-[22rem] rounded-full border border-border/50" />
      <div className="absolute -bottom-28 -right-20 h-[26rem] w-[26rem] rounded-full border border-border/40" />
      <CanopyMark className="absolute right-8 top-1/2 -translate-y-1/2 h-48 w-48 text-primary/[0.045]" />
    </div>);

}

function CreateVault() {
  const { createVault, busy } = useVault();
  const [form, setForm] = useState({
    labName: '',
    orgDomain: '',
    ownerName: '',
    ownerEmail: '',
    passphrase: '',
    confirm: '',
    securityQuestion: '',
    securityAnswer: ''
  });
  const [error, setError] = useState<string | null>(null);
  const meter = strength(form.passphrase);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!form.labName.trim()) return setError('Name the laboratory or group this vault belongs to.');
    if (!form.ownerName.trim()) return setError('Enter your name — it is what appears in the audit ledger.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.ownerEmail)) return setError('Enter a valid email address.');
    if (form.passphrase.length < 10) return setError('Use at least 10 characters.');
    if (form.passphrase !== form.confirm) return setError('The two passphrases do not match.');
    if (form.securityQuestion.trim() && !form.securityAnswer.trim()) return setError('You set a security question but left the answer blank.');
    try {
      await createVault({
        labName: form.labName,
        orgDomain: form.orgDomain.replace(/^@/, '').trim(),
        ownerName: form.ownerName,
        ownerEmail: form.ownerEmail,
        passphrase: form.passphrase,
        securityQuestion: form.securityQuestion.trim() || undefined,
        securityAnswer: form.securityAnswer.trim() || undefined
      });
      toast.success('Vault created. Nothing leaves this device unless you share it.');
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-8 sm:gap-10" noValidate>
      <div className="space-y-2">
        <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.015em] sm:text-[28px]">Set up your vault</h1>
        <p className="max-w-md text-[13.5px] leading-[1.6] text-muted-foreground/90">
          Your password locks your files securely on this device. We never save it or send it anywhere.
          If you forget it, your files cannot be recovered.
        </p>
      </div>

      <div className="flex flex-col gap-7 sm:gap-8">
        {/* Identity Group */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="labName" className="text-[13px] font-medium text-foreground/80">Laboratory or research group</Label>
            <Input
              id="labName"
              className="h-11 bg-background/50 shadow-sm transition-all placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              value={form.labName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, labName: e.target.value })}
              placeholder="Molecular Parasitology Unit"
              autoComplete="organization" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="orgDomain" className="text-[13px] font-medium text-foreground/80">Institutional domain</Label>
            <Input
              id="orgDomain"
              className="h-11 bg-background/50 shadow-sm transition-all placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              value={form.orgDomain}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, orgDomain: e.target.value })}
              placeholder="unilag.edu.ng" />
            <p className="pt-0.5 text-[11.5px] leading-relaxed text-muted-foreground/70">
              Helps identify who is part of your organization. You can still share files with external people, and the system will keep track of it clearly.
            </p>
          </div>
        </div>

        <div className="h-px w-full bg-border/40" />

        {/* Personal Details Group */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ownerName" className="text-[13px] font-medium text-foreground/80">Your name</Label>
            <Input
              id="ownerName"
              className="h-11 bg-background/50 shadow-sm transition-all placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              value={form.ownerName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, ownerName: e.target.value })}
              placeholder="Dr Adaeze Nwosu"
              autoComplete="name" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ownerEmail" className="text-[13px] font-medium text-foreground/80">Your institutional email</Label>
            <Input
              id="ownerEmail"
              type="email"
              className="h-11 bg-background/50 shadow-sm transition-all placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              value={form.ownerEmail}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                const email = e.target.value;
                const at = email.lastIndexOf('@');
                setForm({
                  ...form,
                  ownerEmail: email,
                  orgDomain: form.orgDomain || (at > -1 ? email.slice(at + 1) : '')
                });
              }}
              placeholder="a.nwosu@unilag.edu.ng"
              autoComplete="email" />
          </div>
        </div>

        <div className="h-px w-full bg-border/40" />

        {/* Security Group */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="passphrase" className="text-[13px] font-medium text-foreground/80">Vault passphrase</Label>
            <Input
              id="passphrase"
              type="password"
              className="h-11 bg-background/50 shadow-sm transition-all placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              value={form.passphrase}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, passphrase: e.target.value })}
              autoComplete="new-password" />
            
            <div className="flex items-center gap-3 pt-1.5">
              <div className="flex h-1.5 flex-1 gap-1">
                {[1, 2, 3, 4].map((step) =>
                <span
                  key={step}
                  className={cn(
                    'h-full flex-1 rounded-full transition-all duration-300',
                    form.passphrase && meter.score >= step ? meter.tone : 'bg-muted'
                  )} />
                )}
              </div>
              <span className="w-24 shrink-0 text-right text-[11px] font-medium text-muted-foreground/70">
                {form.passphrase ? meter.label : '10 characters min'}
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm" className="text-[13px] font-medium text-foreground/80">Confirm passphrase</Label>
            <Input
              id="confirm"
              type="password"
              className="h-11 bg-background/50 shadow-sm transition-all placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              value={form.confirm}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, confirm: e.target.value })}
              autoComplete="new-password" />
          </div>
        </div>

        <div className="h-px w-full bg-border/40" />

        {/* Recovery Group */}
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="securityQuestion" className="text-[13px] font-medium text-foreground/80">Security question (optional)</Label>
            <Input
              id="securityQuestion"
              className="h-11 bg-background/50 shadow-sm transition-all placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              value={form.securityQuestion}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, securityQuestion: e.target.value })}
              placeholder="What was the name of your first research supervisor?" />
            <p className="pt-0.5 text-[11.5px] leading-relaxed text-muted-foreground/70">
              If you set this, you can recover your vault if you forget your passphrase.
            </p>
          </div>
          {form.securityQuestion.trim() &&
          <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="securityAnswer" className="text-[13px] font-medium text-foreground/80">Your answer</Label>
              <Input
                id="securityAnswer"
                type="password"
                className="h-11 bg-background/50 shadow-sm transition-all placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                value={form.securityAnswer}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, securityAnswer: e.target.value })}
                placeholder="Answer (case-insensitive)" />
            </div>
          }
        </div>
      </div>

      {error &&
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3">
        <p role="alert" className="text-[13px] font-medium text-destructive">
          {error}
        </p>
      </div>
      }

      <div className="flex justify-end pt-2 -translate-y-3.5">
        <button type="submit" className="group flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border/50 bg-background/30 text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary disabled:pointer-events-none disabled:opacity-50" disabled={busy} aria-label="Create vault">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.25} /> : <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" strokeWidth={1.25} />}
        </button>
      </div>
    </form>);

}

function UnlockVault() {
  const { unlock, recoverPassphrase, meta, busy, events } = useVault();
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [mode, setMode] = useState<'unlock' | 'recover'>('unlock');
  const [recoveryAnswer, setRecoveryAnswer] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const hasRecovery = Boolean(meta?.securityQuestion && meta?.recoveryWrappedKey);

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const recentFailures = useMemo(
    () => events.filter((e) => e.type === 'vault.unlock_failed' && Date.now() - e.ts < 86_400_000).length,
    [events]
  );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (cooldown > 0) return;
    setError(null);
    try {
      await unlock(passphrase);
      setPassphrase('');
      setAttempts(0);
    } catch (err) {
      const next = attempts + 1;
      setAttempts(next);
      setError((err as Error).message);
      setPassphrase('');
      if (next >= 3) setCooldown(Math.min(60, 5 * 2 ** (next - 3)));
    }
  };

  const submitRecovery = async (event: React.FormEvent) => {
    event.preventDefault();
    setRecoveryError(null);
    if (!recoveryAnswer.trim()) return setRecoveryError('Enter your answer.');
    if (newPass.length < 10) return setRecoveryError('New passphrase must be at least 10 characters.');
    if (newPass !== confirmPass) return setRecoveryError('The two passphrases do not match.');
    try {
      await recoverPassphrase(recoveryAnswer, newPass);
      toast.success('Password recovered. Your vault is now unlocked.');
    } catch (err) {
      setRecoveryError((err as Error).message);
    }
  };

  if (mode === 'recover' && hasRecovery) {
    return (
      <form onSubmit={submitRecovery} className="flex flex-col gap-8 sm:gap-10">
        <div className="space-y-2">
          <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.015em] sm:text-[28px]">Recover your vault</h1>
          <p className="max-w-md text-[13.5px] leading-[1.6] text-muted-foreground/90">
            Answer the security question you set when creating the vault, then choose a new passphrase.
          </p>
        </div>

        <div className="flex flex-col gap-5">
          <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3">
            <p className="text-[13px] font-semibold text-foreground/90">{meta?.securityQuestion}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="recoveryAnswer" className="text-[13px] font-medium text-foreground/80">Your answer</Label>
            <Input
              ref={inputRef}
              id="recoveryAnswer"
              type="password"
              className="h-11 bg-background/50 shadow-sm transition-all placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              value={recoveryAnswer}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRecoveryAnswer(e.target.value)}
              placeholder="Answer (case-insensitive)" />
          </div>

          <div className="h-px w-full bg-border/40" />

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="newPass" className="text-[13px] font-medium text-foreground/80">New passphrase</Label>
              <Input
                id="newPass"
                type="password"
                className="h-11 bg-background/50 shadow-sm transition-all placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                value={newPass}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPass(e.target.value)}
                autoComplete="new-password" />
              {newPass && <div className="flex items-center gap-3 pt-1.5">
                <div className="flex h-1.5 flex-1 gap-1">
                  {[1, 2, 3, 4].map((step) =>
                    <span
                      key={step}
                      className={cn(
                        'h-full flex-1 rounded-full transition-all duration-300',
                        strength(newPass).score >= step ? strength(newPass).tone : 'bg-muted'
                      )} />
                  )}
                </div>
                <span className="w-24 shrink-0 text-right text-[11px] font-medium text-muted-foreground/70">
                  {strength(newPass).label}
                </span>
              </div>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirmPass" className="text-[13px] font-medium text-foreground/80">Confirm passphrase</Label>
              <Input
                id="confirmPass"
                type="password"
                className="h-11 bg-background/50 shadow-sm transition-all placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                value={confirmPass}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPass(e.target.value)}
                autoComplete="new-password" />
            </div>
          </div>
        </div>

        {recoveryError &&
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3">
          <p role="alert" className="text-[13px] font-medium text-destructive">{recoveryError}</p>
        </div>
        }

        <div className="flex items-center justify-between pt-2 -translate-y-3.5">
          <button type="button" onClick={() => { setMode('unlock'); setRecoveryError(null); }} className="text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground">
            Back to unlock
          </button>
          <button type="submit" className="group flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border/50 bg-background/30 text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary disabled:pointer-events-none disabled:opacity-50" disabled={busy} aria-label="Recover vault">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.25} /> : <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" strokeWidth={1.25} />}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-8 sm:gap-10">
      <div className="space-y-2">
        <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.015em] sm:text-[28px]">{meta?.labName}</h1>
        <p className="max-w-md text-[13.5px] leading-[1.6] text-muted-foreground/90">
          The vault is locked. Your password is only kept active while you are using the app.
          Once you close this window, your vault locks automatically.
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="unlock" className="text-[13px] font-medium text-foreground/80">Vault passphrase</Label>
          <button type="button" onClick={() => hasRecovery ? setMode('recover') : setError('No security question was set for this vault. Your data cannot be recovered without the passphrase.')} className="text-[11.5px] font-medium text-primary/70 transition-colors hover:text-primary">
            Forgot password?
          </button>
        </div>
        <Input
          ref={inputRef}
          id="unlock"
          type="password"
          className="h-11 bg-background/50 shadow-sm transition-all placeholder:text-muted-foreground/40 focus:border-primary/50 focus:bg-background focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          value={passphrase}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassphrase(e.target.value)}
          autoComplete="current-password"
          disabled={cooldown > 0} />
      </div>

      {error &&
      <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3">
        <p role="alert" className="text-[13px] font-medium text-destructive">
          {error}
          {cooldown > 0 && <> Wait {cooldown}s before trying again.</>}
        </p>
      </div>
      }

      {recentFailures >= 3 &&
      <div className="rounded-lg border border-warn/35 bg-warn/10 px-4 py-3">
        <p className="text-[13px] font-medium text-warn">
          {recentFailures} failed unlock attempts recorded in the last 24 hours. Every one is in the
          ledger with its device.
        </p>
      </div>
      }

      <div className="flex justify-end pt-2 -translate-y-3.5">
        <button type="submit" className="group flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border/50 bg-background/30 text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary disabled:pointer-events-none disabled:opacity-50" disabled={busy || cooldown > 0 || !passphrase} aria-label="Unlock vault">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.25} /> : <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" strokeWidth={1.25} />}
        </button>
      </div>
    </form>);

}

export function Gate() {
  const { phase, fatal } = useVault();

  return (
    <div className="relative flex min-h-dvh w-full flex-col lg:flex-row">
      {/* ─── left panel ─── */}
      <aside className="relative hidden w-1/2 shrink-0 flex-col justify-between overflow-hidden border-r border-border bg-sidebar px-8 py-8 lg:flex xl:px-12 xl:py-12">
        <Backdrop />
        <div className="relative">
          <Wordmark />
        </div>
        <div className="relative max-w-[28rem] space-y-6">
          <p className="text-[22px] font-semibold leading-snug tracking-tight sm:text-[26px]">
            Unpublished work is only valuable while nobody else has it.
          </p>
          <p className="text-[14px] leading-relaxed text-muted-foreground sm:text-[15px]">
            Canopy secures your sensitive research right on your device. You can share access with specific people and always see exactly who opened what.
          </p>
          <ul className="space-y-2.5 text-[13px] text-muted-foreground/80 sm:text-[14px]">
            <li className="flex items-start gap-3">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary/70" />
              <span className="leading-snug">Remove someone's access instantly with a single click.</span>
            </li>
            <li className="flex items-start gap-3">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary/70" />
              <span className="leading-snug">Easily close all shared files when a team member leaves.</span>
            </li>
          </ul>
        </div>
        <p className="relative font-mono text-[9.5px] uppercase tracking-[0.2em] text-muted-foreground/50">
          AES-256-GCM · PBKDF2-SHA256 · hash-chained ledger
        </p>
      </aside>

      {/* ─── right panel ─── */}
      <main className="relative flex w-full flex-1 flex-col items-center justify-center px-6 py-10 sm:px-10 lg:w-1/2 lg:flex-none lg:px-14">

        <div className="w-full max-w-lg">
          <div className="mb-8 lg:hidden">
            <Wordmark />
          </div>
          {phase === 'unsupported' || phase === 'error' ?
          <ErrorNotice
            title={phase === 'unsupported' ? 'This device cannot hold a vault' : 'Something went wrong at startup'}
            body={fatal ?? 'Unknown error.'}
            action={
            <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
                  Reload
                </Button>
            } /> :

          phase === 'no-vault' ?
          <CreateVault /> :

          <UnlockVault />
          }
        </div>
      </main>
    </div>);

}
