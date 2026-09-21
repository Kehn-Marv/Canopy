import { useRef, useState } from 'react';
import { FileUp, PackageOpen, ShieldAlert, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useVault } from '../contexts/VaultContext';
import { PageHeader } from '../components/AppShell';
import { ProtectedViewer } from '../components/ProtectedViewer';
import { Chip, Mono } from '../components/Chips';
import { ErrorNotice } from '../components/EmptyState';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import {
  ContainerFormatError,
  parseContainer,
  verifyContainer } from
'../lib/container';
import type { ParsedContainer } from '../lib/container';
import {
  decryptChunk,
  deriveGrantKey,
  fromBase64,
  fromBase64Url,
  tokenToGrantId,
  unwrapContentKey } from
'../lib/crypto';
import { STORES, get } from '../lib/db';
import { appendEvent } from '../lib/ledger';
import { effectiveStatus } from '../lib/policy';
import { formatBytes, formatDateTime } from '../lib/format';
import { cn } from '../lib/cn';
import type { Asset, Grant } from '../types';

function extractToken(input: string): string {
  const trimmed = input.trim();
  const marker = trimmed.lastIndexOf('/a/');
  return marker === -1 ? trimmed : trimmed.slice(marker + 3);
}

export function OpenContainer() {
  const { actor, recordCapture, refresh } = useVault();
  const [parsed, setParsed] = useState<ParsedContainer | null>(null);
  const [fileName, setFileName] = useState('');
  const [integrity, setIntegrity] = useState<{ok: boolean;failedChunk: number | null;} | null>(null);
  const [grant, setGrant] = useState<Grant | null>(null);
  const [grantKnown, setGrantKnown] = useState(false);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [content, setContent] = useState<{url: string;blob: Blob;} | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const reset = () => {
    setParsed(null);
    setIntegrity(null);
    setGrant(null);
    setGrantKnown(false);
    setToken('');
    setError(null);
    if (content) URL.revokeObjectURL(content.url);
    setContent(null);
  };

  const load = async (file: File) => {
    reset();
    setFileName(file.name);
    setBusy(true);
    try {
      const result = await parseContainer(file);
      setParsed(result);
      const check = await verifyContainer(result);
      setIntegrity(check);
      const known = await get<Grant>(STORES.grants, result.header.grantId);
      setGrant(known ?? null);
      setGrantKnown(Boolean(known));
      if (!check.ok) {
        toast.error('This container failed its integrity check. It will not be opened.');
      }
    } catch (err) {
      setError(
        err instanceof ContainerFormatError ? err.message : `Could not read that file: ${(err as Error).message}`
      );
    } finally {
      setBusy(false);
    }
  };

  const unseal = async () => {
    if (!parsed || !actor) return;
    setBusy(true);
    setError(null);
    try {
      const raw = extractToken(token);
      if (!raw) throw new Error('Paste the link you were sent, or just its token.');
      const derivedId = await tokenToGrantId(raw);
      if (derivedId !== parsed.header.grantId) {
        await appendEvent({
          type: 'container.refused',
          actorId: actor.actorId,
          actorLabel: actor.actorLabel,
          deviceId: actor.deviceId,
          deviceLabel: actor.deviceLabel,
          grantId: parsed.header.grantId,
          detail: { reason: 'token_mismatch', file: fileName }
        });
        await refresh();
        throw new Error('That link does not belong to this container.');
      }
      if (grant) {
        const { status } = effectiveStatus(grant);
        if (status !== 'active') {
          await appendEvent({
            type: 'container.refused',
            actorId: actor.actorId,
            actorLabel: actor.actorLabel,
            deviceId: actor.deviceId,
            deviceLabel: actor.deviceLabel,
            grantId: grant.id,
            detail: { reason: status, file: fileName }
          });
          await refresh();
          throw new Error(
            status === 'revoked' ?
            'The owner revoked this access. The container will not be opened.' :
            'The access window for this container has closed.'
          );
        }
      }
      if (!integrity?.ok) throw new Error('Integrity check failed. Refusing to decrypt.');

      const grantKey = await deriveGrantKey(
        fromBase64Url(raw),
        fromBase64(parsed.header.wrappedKey.salt)
      );
      const contentKey = await unwrapContentKey(grantKey, {
        iv: parsed.header.wrappedKey.iv,
        ct: parsed.header.wrappedKey.ct
      });
      const parts: ArrayBuffer[] = [];
      for (let i = 0; i < parsed.chunks.length; i += 1) {
        parts.push(await decryptChunk(contentKey, parsed.header.chunks[i].iv, parsed.chunks[i]));
      }
      const blob = new Blob(parts, { type: parsed.header.mime });
      setContent({ url: URL.createObjectURL(blob), blob });
      await appendEvent({
        type: 'container.opened',
        actorId: actor.actorId,
        actorLabel: actor.actorLabel,
        deviceId: actor.deviceId,
        deviceLabel: actor.deviceLabel,
        assetId: parsed.header.assetId,
        grantId: parsed.header.grantId,
        detail: { file: fileName, bytes: blob.size, revocationChecked: grantKnown }
      });
      await refresh();
      toast.success('Container opened in the protected viewer.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pseudoAsset: Asset | null = parsed ?
  {
    id: parsed.header.assetId,
    name: parsed.header.name,
    mime: parsed.header.mime,
    size: parsed.header.size,
    kind: 'other',
    root: parsed.header.root,
    chunkSize: parsed.header.chunkSize,
    chunkCount: parsed.header.chunkCount,
    createdAt: parsed.header.issuedAt,
    updatedAt: parsed.header.issuedAt,
    project: parsed.header.issuerLabel,
    sensitivity: 'restricted',
    wrappedKey: { iv: '', ct: '' },
    status: 'sealed',
    ownerId: '',
    rev: 0
  } :
  null;

  return (
    <div>
      <PageHeader
        title="Open a sealed copy"
        subtitle="A .canopy container is ciphertext plus its manifest. It carries no key. Opening it needs the link it was issued against, and the access must still be live." />
      

      <div className="space-y-4 px-4 py-5 sm:px-6 lg:px-8">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void load(file);
          }}
          className={cn(
            'surface-grid rounded-xl border border-dashed px-5 py-10 text-center transition-colors',
            dragging ? 'border-primary bg-primary/8' : 'border-border'
          )}>
          
          <PackageOpen className="mx-auto h-7 w-7 text-muted-foreground" aria-hidden />
          <p className="mt-2.5 text-[14px] font-medium">Drop a .canopy container</p>
          <p className="mt-1 text-[12.5px] text-muted-foreground">
            Or one that arrived by flash drive, chat or email. Nothing is decrypted until the link checks out.
          </p>
          <input
            ref={input}
            type="file"
            accept=".canopy,application/vnd.canopy.sealed"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void load(file);
              e.target.value = '';
            }} />
          
          <Button variant="outline" size="sm" className="mt-3 gap-2" onClick={() => input.current?.click()}>
            <FileUp className="h-3.5 w-3.5" /> Choose a container
          </Button>
        </div>

        {error && <ErrorNotice title="Refused" body={error} />}

        {parsed &&
        <section className="rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
              {integrity?.ok ?
            <Chip tone="ok">
                  <ShieldCheck className="h-3 w-3" /> Digests verified
                </Chip> :

            <Chip tone="danger">
                  <ShieldAlert className="h-3 w-3" />
                  {integrity?.failedChunk !== null && integrity?.failedChunk !== undefined ?
              `Chunk ${integrity.failedChunk} altered` :
              'Root digest mismatch'}
                </Chip>
            }
              <Chip tone={grantKnown ? grant && effectiveStatus(grant).status === 'active' ? 'ok' : 'danger' : 'warn'}>
                {grantKnown ?
              `Grant is ${grant ? effectiveStatus(grant).status : 'unknown'}` :
              'Revocation status unknown on this device'}
              </Chip>
            </div>

            <dl className="grid gap-3 px-4 py-4 text-[12.5px] sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">Original name</dt>
                <dd className="mt-0.5 truncate font-medium">{parsed.header.name}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Size</dt>
                <dd className="num mt-0.5 font-medium">{formatBytes(parsed.header.size)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Issued by</dt>
                <dd className="mt-0.5 truncate font-medium">{parsed.header.issuerLabel}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Issued to</dt>
                <dd className="mt-0.5 truncate font-medium">{parsed.header.recipientLabel}</dd>
              </div>
              <div className="sm:col-span-2 lg:col-span-4">
                <dt className="text-muted-foreground">Provenance</dt>
                <dd className="mt-0.5">
                  <Mono className="break-all">
                    sha256:{parsed.header.root} · issued {formatDateTime(parsed.header.issuedAt)}
                  </Mono>
                </dd>
              </div>
            </dl>

            {!grantKnown &&
          <p className="mx-4 mb-4 rounded-md border border-warn/35 bg-warn/10 px-3 py-2 text-[12px] leading-relaxed text-warn">
                This device does not hold the grant record, so Canopy cannot check whether the owner has
                since revoked access. It will still enforce the token and the digests. This is the real
                limit of offline revocation and we are not going to hide it.
              </p>
          }

            {!content &&
          <div className="space-y-2 border-t border-border px-4 py-4">
                <Label htmlFor="token">Paste the link you were sent</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                id="token"
                value={token}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setToken(e.target.value)}
                placeholder="https://…/#/a/…"
                className="min-w-[14rem] flex-1 font-mono text-[12px]" />
              
                  <Button onClick={() => void unseal()} disabled={busy || !token.trim()}>
                    {busy ? 'Checking…' : 'Open'}
                  </Button>
                  <Button variant="ghost" onClick={reset}>
                    Clear
                  </Button>
                </div>
              </div>
          }
          </section>
        }

        {content && pseudoAsset &&
        <ProtectedViewer
          asset={pseudoAsset}
          url={content.url}
          blob={content.blob}
          integrityOk
          loading={false}
          error={null}
          allowCopy={false}
          identity={{
            recipientLabel: parsed?.header.recipientLabel ?? 'Container holder',
            grantId: parsed?.header.grantId ?? '',
            seed: parsed?.header.root.slice(0, 8) ?? '',
            openedAt: Date.now()
          }}
          onCapture={(kind) => void recordCapture(kind, parsed?.header.assetId, parsed?.header.grantId)} />

        }
      </div>
    </div>);

}