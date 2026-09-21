import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  Clock,
  Download,
  FileLock2,
  Loader2,
  MailQuestion,
  ShieldCheck } from
'lucide-react';
import { toast } from 'sonner';
import { useVault } from '../contexts/VaultContext';
import { ProtectedViewer } from '../components/ProtectedViewer';
import { CanopyMark, Wordmark } from '../components/Brand';
import { Chip, Mono } from '../components/Chips';
import { ErrorNotice, Loading } from '../components/EmptyState';
import { Button } from '../components/ui/Button';
import { Textarea } from '../components/ui/Textarea';
import { Checkbox } from '../components/ui/Checkbox';
import {
  acceptTerms,
  declineTerms,
  exportReleasedCopy,
  exportSealedContainer,
  inspectToken,
  openWithToken,
  requestExtension } from
'../lib/grants';
import { readAsset } from '../lib/vault';
import { saveBlob } from '../lib/download';
import { effectiveStatus } from '../lib/policy';
import { formatBytes, formatDateTime, formatDuration } from '../lib/format';
import type { AccessDecision, Asset, Grant } from '../types';
import type { Actor } from '../lib/vault';

type Stage = 'checking' | 'terms' | 'reading' | 'open' | 'denied';

const DENY_COPY: Record<AccessDecision['reason'], {title: string;hint: string;}> = {
  ok: { title: '', hint: '' },
  not_found: {
    title: 'This link does not match anything here',
    hint: 'It may have been mistyped, or the item was withdrawn from the vault entirely.'
  },
  revoked: {
    title: 'Access was withdrawn',
    hint: 'The key for this link was destroyed, so it cannot be reopened. Ask the owner for a fresh link.'
  },
  expired: {
    title: 'The access window has closed',
    hint: 'Do not worry, the owner can easily restore your access at any time.'
  },
  exhausted: {
    title: 'You have used all the permitted openings',
    hint: 'Ask the owner to raise the limit if you still need it.'
  },
  device_bound: {
    title: 'This link belongs to another device',
    hint: 'It was locked to the first device that opened it. A new link is needed for this one.'
  },
  terms_required: { title: 'Terms must be accepted first', hint: '' },
  key_missing: {
    title: 'No key could be produced',
    hint: 'The link may have been altered in transit. Ask for it to be sent again.'
  },
  integrity: {
    title: 'The stored material failed its integrity check',
    hint: 'Canopy refuses to show a file it cannot verify.'
  }
};

export function Access() {
  const { token = '' } = useParams<{token: string;}>();
  const { people, meta, device, recordCapture, refresh } = useVault();

  const [stage, setStage] = useState<Stage>('checking');
  const [grant, setGrant] = useState<Grant | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [decision, setDecision] = useState<AccessDecision | null>(null);
  const [content, setContent] = useState<{url: string;blob: Blob;integrityOk: boolean;} | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [note, setNote] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const opened = useRef(false);
  const urlRef = useRef<string | null>(null);

  const recipient = useMemo(
    () => people.find((p) => p.id === grant?.recipientId) ?? null,
    [people, grant]
  );

  const actor = useMemo<Actor | null>(() => {
    if (!device) return null;
    return {
      actorId: grant?.recipientId ?? 'unknown',
      actorLabel: recipient?.name ?? 'Link holder',
      deviceId: device.id,
      deviceLabel: device.label
    };
  }, [device, grant, recipient]);

  useEffect(
    () => () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    []
  );

  const attemptOpen = async () => {
    if (!actor) return;
    setStage('reading');
    try {
      const result = await openWithToken(token, actor);
      setDecision(result.decision);
      if (result.grant) setGrant(result.grant);
      if (result.asset) setAsset(result.asset);
      if (!result.decision.ok || !result.asset || !result.contentKey) {
        setStage('denied');
        await refresh();
        return;
      }

      const read = await readAsset(result.asset, result.contentKey);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(read.blob);
      urlRef.current = url;
      setContent({ url, blob: read.blob, integrityOk: read.integrityOk });
      setStage('open');
      await refresh();
    } catch (err) {
      setError((err as Error).message);
      setStage('denied');
    }
  };

  useEffect(() => {
    if (opened.current || !device) return;
    opened.current = true;
    void (async () => {
      const found = await inspectToken(token);
      if (!found.grant || !found.asset) {
        setDecision({ ok: false, reason: 'not_found', message: DENY_COPY.not_found.title });
        setStage('denied');
        return;
      }
      setGrant(found.grant);
      setAsset(found.asset);
      if (found.grant.requireTerms && found.grant.acceptedAt === null) {
        setStage('terms');
        return;
      }
      await attemptOpen();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, device]);

  const doExport = async () => {
    if (!asset || !grant || !meta || !recipient || !actor) return;
    setExporting(true);
    try {
      if (grant.mode === 'released') {
        if (!content?.blob) throw new Error('Nothing decrypted to release.');
        const result = await exportReleasedCopy(asset, content.blob, grant, meta, recipient, actor);
        saveBlob(result.blob, result.fileName);
        toast.success(
          result.watermarked ?
          'Released copy saved, watermarked with your name and the terms hash.' :
          'File saved. The system has securely logged this action in the audit trail.'
        );
      } else {
        const result = await exportSealedContainer(asset, grant, meta, recipient, actor);
        saveBlob(result.blob, result.fileName);
        toast.success('Sealed container saved. It is ciphertext and still needs this link to open.');
      }
      await refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const askForMore = async () => {
    if (!grant || !actor) return;
    setRequesting(true);
    try {
      await requestExtension(grant.id, note, actor);
      toast.success('The owner has been asked. You will get a fresh window if they agree.');
      setNote('');
      await refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRequesting(false);
    }
  };

  const status = grant ? effectiveStatus(grant) : null;

  return (
    <div className="min-h-full bg-background">
      <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-border bg-background/92 px-4 py-3 backdrop-blur sm:px-6">
        <Wordmark compact />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold">{asset?.name ?? 'Shared material'}</p>
          <p className="truncate text-[11.5px] text-muted-foreground">
            {meta?.labName ? `Shared by ${meta.labName}` : 'Canopy protected link'}
          </p>
        </div>
        <Link
          to="/"
          className="inline-flex shrink-0 items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground">
          
          <ArrowLeft className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Your vault</span>
        </Link>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        {stage === 'checking' && <Loading label="Checking this link" />}

        {stage === 'terms' && grant && asset &&
          <section className="mx-auto max-w-2xl overflow-hidden rounded-[24px] border border-border/30 bg-card/80 shadow-2xl backdrop-blur-3xl">
            <div className="px-8 pt-10 pb-8 text-center">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 shadow-inner">
                <FileLock2 className="h-7 w-7 text-primary" aria-hidden />
              </div>
              <h1 className="text-[22px] font-semibold tracking-tight text-foreground">Before you open this</h1>
              <p className="mx-auto mt-3 max-w-[420px] text-[13.5px] leading-relaxed text-muted-foreground">
                <strong className="font-medium text-foreground">{recipient?.name ?? 'You'}</strong>, please review the access terms for{' '}
                <strong className="font-medium text-foreground">{asset.name}</strong>. Accepting is
                recorded permanently, with a cryptographic hash of this exact wording.
              </p>
            </div>
            
            <div className="relative border-y border-border/10 bg-background/40">
              <pre className="max-h-[280px] overflow-y-auto whitespace-pre-wrap px-8 py-6 font-mono text-[12.5px] leading-relaxed text-muted-foreground custom-scrollbar">
                {grant.terms}
              </pre>
              <div className="pointer-events-none absolute bottom-0 left-0 h-10 w-full bg-gradient-to-t from-background/40 to-transparent" />
            </div>

            <div className="px-8 py-7 bg-muted/5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
                <label className="flex cursor-pointer items-center gap-3 text-[13.5px] font-medium text-foreground hover:text-primary transition-colors">
                  <Checkbox
                    checked={accepted}
                    onCheckedChange={(v: boolean | 'indeterminate') => setAccepted(Boolean(v))}
                    className="h-5 w-5 rounded-[6px] border-border/50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground transition-all" />
                  I have read these terms and accept them.
                </label>
                <Mono className="text-[10px] text-muted-foreground/40 truncate">
                  sha256:{grant.termsHash?.slice(0, 16)}…
                </Mono>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row-reverse">
                <Button
                  disabled={!accepted}
                  className="w-full sm:w-auto h-11 px-8 rounded-xl font-medium transition-all shadow-sm"
                  onClick={() =>
                    void acceptTerms(token, actor!).
                      then(async () => {
                        await refresh();
                        await attemptOpen();
                      }).
                      catch((e) => toast.error((e as Error).message))
                  }>
                  Accept and open
                </Button>
                <Button
                  variant="ghost"
                  className="w-full sm:w-auto h-11 px-8 rounded-xl text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() =>
                    void declineTerms(token, actor!).then(() => {
                      setDecision({
                        ok: false,
                        reason: 'terms_required',
                        message: 'You declined the terms, so the material stays closed.'
                      });
                      setStage('denied');
                      void refresh();
                    })
                  }>
                  Decline
                </Button>
              </div>
            </div>
          </section>
        }

        {stage === 'reading' && <Loading label="Deriving the key and verifying chunks" />}

        {stage === 'denied' &&
        <div className="space-y-4">
            <ErrorNotice
            title={
            error ?
            'Something went wrong opening this' :
            DENY_COPY[decision?.reason ?? 'not_found'].title
            }
            body={error ?? decision?.message ?? DENY_COPY[decision?.reason ?? 'not_found'].hint} />
          
            {decision && DENY_COPY[decision.reason].hint && !error &&
          <p className="text-[13px] leading-relaxed text-muted-foreground">
                {DENY_COPY[decision.reason].hint}
              </p>
          }
            {grant && ['expired', 'exhausted'].includes(decision?.reason ?? '') &&
          <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="flex items-center gap-2 text-[14px] font-semibold">
                  <MailQuestion className="h-4 w-4" /> Ask for it to be reopened
                </h2>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  This lands in the owner&apos;s queue. No email, no chasing.
                </p>
                <Textarea
              className="mt-3"
              rows={3}
              value={note}
              placeholder="Still working on the methods section, I need a couple more days."
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)} />
            
                <Button
              className="mt-3 gap-2"
              size="sm"
              disabled={requesting || Boolean(grant.extensionRequest)}
              onClick={() => void askForMore()}>
              
                  <Clock className="h-3.5 w-3.5" />
                  {grant.extensionRequest ? 'Already asked' : requesting ? 'Sending…' : 'Request more time'}
                </Button>
              </section>
          }
            <p className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
              <CanopyMark className="h-4 w-4" />
              This refusal was written to the owner&apos;s audit ledger, with the time and this device.
            </p>
          </div>
        }

        {stage === 'open' && asset && grant &&
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Chip tone="ok">
                <ShieldCheck className="h-3 w-3" /> Access permitted
              </Chip>
              <Chip tone="muted">For {recipient?.name ?? 'you'} only</Chip>
              {status?.expiresInMs !== null && status?.expiresInMs !== undefined &&
            <Chip tone={status.expiresInMs < 3_600_000 ? 'warn' : 'muted'}>
                  Closes in {formatDuration(status.expiresInMs)}
                </Chip>
            }
              {status?.opensLeft !== null && status?.opensLeft !== undefined &&
            <Chip tone="muted">{status.opensLeft} opening(s) left</Chip>
            }
              {grant.mode === 'released' && <Chip tone="warn">Copy release permitted</Chip>}
            </div>

            <ProtectedViewer
            asset={asset}
            url={content?.url ?? null}
            blob={content?.blob ?? null}
            integrityOk={content?.integrityOk ?? false}
            loading={false}
            error={null}
            allowCopy={grant.permissions.annotate}
            identity={{
              recipientLabel: recipient?.name ?? 'Link holder',
              grantId: grant.id,
              seed: grant.watermarkSeed,
              openedAt: Date.now()
            }}
            onCapture={(kind) => void recordCapture(kind, asset.id, grant.id)}
            footer={
            <div className="flex flex-wrap items-center gap-3">
                  <p className="flex-1 text-[11.5px] leading-relaxed text-muted-foreground">
                    Your name is woven across this view. Canopy blanks it when the window loses focus and
                    logs all download attempts. However, please remember that no system can prevent someone from taking a photo of their screen.
                  </p>
                  {grant.permissions.export &&
              <Button size="sm" variant="outline" className="gap-2" disabled={exporting} onClick={() => void doExport()}>
                      {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                      {grant.mode === 'released' ? 'Save a copy' : 'Save sealed copy'}
                    </Button>
              }
                </div>
            } />
          

            <dl className="grid gap-3 rounded-xl border border-border bg-card p-4 text-[12.5px] sm:grid-cols-3">
              <div>
                <dt className="text-muted-foreground">Size</dt>
                <dd className="num mt-0.5 font-medium">{formatBytes(asset.size)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Access closes</dt>
                <dd className="num mt-0.5 font-medium">
                  {grant.expiresAt ? formatDateTime(grant.expiresAt) : 'No end date'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Content digest</dt>
                <dd className="mt-0.5">
                  <Mono>sha256:{asset.root.slice(0, 20)}</Mono>
                </dd>
              </div>
            </dl>

            <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-muted-foreground">
              <Ban className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              If the owner revokes this link, the key wrapped for it is destroyed and this page will
              block access next time. Any files you already saved will remain on your device.
              why release is a deliberate choice, not a default.
            </p>
          </div>
        }
      </main>
    </div>);

}
