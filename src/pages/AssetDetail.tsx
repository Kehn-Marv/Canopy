import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  CalendarClock,
  Download,
  Pencil,
  Share2,
  Trash2 } from
'lucide-react';
import { toast } from 'sonner';
import { useVault } from '../contexts/VaultContext';
import { ProtectedViewer } from '../components/ProtectedViewer';
import { ShareComposer } from '../components/ShareComposer';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { LedgerTable } from '../components/LedgerTable';
import { Chip, GrantStatusChip, Mono, SensitivityChip } from '../components/Chips';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/Tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/Select';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle } from
'../components/ui/Dialog';
import { effectiveStatus } from '../lib/policy';
import { saveBlob } from '../lib/download';
import { appendEvent } from '../lib/ledger';
import { formatBytes, formatDateTime, formatDuration, relativeTime } from '../lib/format';
import type { Materialised } from '../contexts/VaultContext';
import type { Sensitivity } from '../types';

export function AssetDetail() {
  const { id } = useParams<{id: string;}>();
  const navigate = useNavigate();
  const {
    assets, grants, people, events, owner, actor,
    materialise, releaseMaterialised, recordOpen, recordCapture,
    deleteAsset, editAsset, revoke, extend, refresh
  } = useVault();

  const asset = assets.find((a) => a.id === id);
  const [content, setContent] = useState<Materialised | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', project: '', sensitivity: 'restricted' as Sensitivity });

  const assetGrants = useMemo(
    () => grants.filter((g) => g.assetId === id).sort((a, b) => b.createdAt - a.createdAt),
    [grants, id]
  );
  const assetEvents = useMemo(() => events.filter((e) => e.assetId === id), [events, id]);

  useEffect(() => {
    if (!asset) return;
    setDraft({
      name: asset.name,
      project: asset.project,
      sensitivity: asset.sensitivity
    });
  }, [asset]);

  useEffect(() => {
    if (!asset) return;
    let alive = true;
    setLoading(true);
    setError(null);
    void materialise(asset).
    then((result) => {
      if (!alive) return;
      setContent(result);
      if (result.integrityOk) void recordOpen(asset);
    }).
    catch((err) => alive && setError((err as Error).message)).
    finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.id]);

  useEffect(() => () => {
    if (asset) releaseMaterialised(asset.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset?.id]);

  if (!asset) {
    return (
      <div className="p-4 sm:p-6">
        <EmptyState
          title="That item is not in this vault"
          body="It may have been withdrawn, or the link you followed is stale."
          action={
          <Button variant="outline" onClick={() => navigate('/')}>
              Back to the library
            </Button>
          } />
        
      </div>);

  }

  const ownerCopy = async () => {
    if (!content?.blob || !actor) return;
    saveBlob(content.blob, asset.name);
    await appendEvent({
      type: 'asset.exported',
      actorId: actor.actorId,
      actorLabel: actor.actorLabel,
      deviceId: actor.deviceId,
      deviceLabel: actor.deviceLabel,
      assetId: asset.id,
      detail: { form: 'owner copy', bytes: content.blob.size }
    });
    await refresh();
    toast.info('A decrypted copy left the vault. That is recorded against your name.');
  };

  return (
    <div>
      <div className="border-b border-border px-4 py-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground">
          
          <ArrowLeft className="h-3.5 w-3.5" /> Library
        </Link>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="break-words text-[21px] font-semibold leading-tight tracking-tight lg:text-[25px]">
              {asset.name}
            </h1>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <SensitivityChip value={asset.sensitivity} />
              <Chip tone="muted">{asset.project || 'Unfiled'}</Chip>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button className="gap-2" onClick={() => setShareOpen(true)}>
              <Share2 className="h-4 w-4" /> Share
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              disabled={!content?.integrityOk}
              onClick={() => void ownerCopy()}>
              
              <Download className="h-4 w-4" /> Save a copy
            </Button>
            <Button variant="ghost" className="gap-2 text-destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" /> Withdraw
            </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="view" className="px-4 py-5 sm:px-6 lg:px-8">
        <TabsList className="flex gap-1.5 sm:gap-2">
          <TabsTrigger value="view">View</TabsTrigger>
          <TabsTrigger value="access">Access ({assetGrants.length})</TabsTrigger>
          <TabsTrigger value="activity">Activity ({assetEvents.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="view" className="mt-4">
          <ProtectedViewer
            asset={asset}
            url={content?.url ?? null}
            blob={content?.blob ?? null}
            integrityOk={content?.integrityOk ?? true}
            loading={loading}
            error={error}
            allowCopy
            identity={{
              recipientLabel: owner?.name ?? 'Owner',
              grantId: asset.id,
              seed: asset.root.slice(0, 8),
              openedAt: Date.now()
            }}
            onCapture={(kind) => void recordCapture(kind, asset.id)}
            footer={
            <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                As the owner, you can copy and save files freely. All actions are still
                recorded in the audit ledger. Restrictions apply to the people you share with.
              </p>
            } />
          
        </TabsContent>

        <TabsContent value="access" className="mt-4">
          {assetGrants.length ?
          <div className="squircle-element border border-border/30 bg-card/60 shadow-sm backdrop-blur-xl">
            <ul className="divide-y divide-border/20">
              {assetGrants.map((grant) => {
                const person = people.find((p) => p.id === grant.recipientId);
                const { status, expiresInMs, opensLeft } = effectiveStatus(grant);
                return (
                  <li key={grant.id} className="group flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 px-5 py-4 transition-colors hover:bg-muted/5">
                    {/* Left Side: Who and Tags */}
                    <div className="min-w-0 flex-1 flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[13.5px] font-semibold text-foreground truncate">
                          {person?.name ?? 'Unknown recipient'}
                        </span>
                        {person?.email && <span className="text-[12.5px] text-muted-foreground truncate">{person.email}</span>}
                      </div>
                      
                      <div className="flex items-center gap-2 mt-0.5 text-[12px] text-muted-foreground">
                        <span>Issued {relativeTime(grant.createdAt)}</span>
                        
                        {(grant.mode === 'released' || grant.bindDevice) && (
                          <div className="flex gap-1.5 border-l border-border/40 pl-2 ml-1">
                            {grant.mode === 'released' && (
                              <span className="shrink-0 rounded bg-warn/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-warn">Copy Released</span>
                            )}
                            {grant.bindDevice && (
                              <span className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Device Locked</span>
                            )}
                          </div>
                        )}
                      </div>
                      
                      {grant.extensionRequest &&
                        <div className="mt-1.5 inline-flex items-center gap-1.5 rounded-md border border-info/20 bg-info/5 px-2.5 py-1 text-[11.5px] text-info">
                          <span className="font-medium">Extension requested:</span>
                          <span className="truncate opacity-80">{grant.extensionRequest.note || 'No reason provided'}</span>
                        </div>
                      }
                    </div>

                    {/* Right Side: Status, Metadata & Actions */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-2 sm:gap-1.5 shrink-0 mt-2 sm:mt-0">
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
                  </li>
                );
              })}
            </ul>
          </div> :

          <EmptyState
            title="Nobody has access to this yet"
            body="Issue a link to one named person. Each link carries its own key, so you can close any of them without touching the others."
            action={<Button onClick={() => setShareOpen(true)}>Share this item</Button>} />

          }
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <LedgerTable
              events={assetEvents}
              assets={assets}
              emptyLabel="No recorded activity for this item yet." />
            
          </div>
        </TabsContent>
      </Tabs>

      <ShareComposer asset={asset} open={shareOpen} onOpenChange={setShareOpen} />

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit item details</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-2 pb-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Name</Label>
              <Input id="edit-name" value={draft.name} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, name: e.target.value })} className="font-mono text-[13px]" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-project" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Project</Label>
              <Input
                id="edit-project"
                value={draft.project}
                className="text-[13px]"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDraft({ ...draft, project: e.target.value })} />
              
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-sens" className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">Sensitivity</Label>
              <Select
                value={draft.sensitivity}
                onValueChange={(v) => setDraft({ ...draft, sensitivity: v as Sensitivity })}>
                
                <SelectTrigger id="edit-sens" className="text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="internal">Internal</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
                  <SelectItem value="embargoed">Embargoed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
              void editAsset(asset, draft).
              then(() => {
                setEditOpen(false);
                toast.success('Details updated.');
              }).
              catch((e) => toast.error((e as Error).message))
              }>
              
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Withdraw this item from the vault"
        description="The ciphertext and every chunk are destroyed, and all links to it are revoked. The audit trail stays. This cannot be undone."
        confirmLabel="Withdraw permanently"
        destructive
        requireReason
        reasonLabel="Why are you withdrawing it?"
        reasonPlaceholder="Superseded by v3"
        onConfirm={async (reason) => {
          await deleteAsset(asset, reason);
          toast.success('Item withdrawn. Links to it no longer resolve.');
          navigate('/');
        }} />
      

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
        title="Revoke this access"
        description="Access is permanently disabled everywhere. This cannot be undone, you would need to create a brand new link to restore access."
        confirmLabel="Revoke access"
        destructive
        requireReason
        reasonLabel="Reason (recorded permanently)"
        reasonPlaceholder="Collaboration ended"
        onConfirm={async (reason) => {
          if (!revokeTarget) return;
          await revoke(revokeTarget, reason);
          setRevokeTarget(null);
          toast.success('Access revoked.');
        }} />
      
    </div>);

}