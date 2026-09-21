import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState } from
'react';
import { toast } from 'sonner';
import {
  STORES,
  deleteAssetCascade,
  estimateUsage,
  getAll,
  requestPersistence,
  storageAvailable } from
'../lib/db';
import { cryptoAvailable } from '../lib/crypto';
import { appendEvent, verifyChain } from '../lib/ledger';
import type { ChainReport } from '../lib/ledger';
import {
  WrongPassphraseError,
  changePassphrase as changePassphraseOp,
  createVault as createVaultOp,
  getContentKey,
  loadMeta,
  readAsset,
  recoverPassphrase as recoverPassphraseOp,
  unlockVault as unlockVaultOp,
  updateAsset as updateAssetOp,
  updateMeta as updateMetaOp } from
'../lib/vault';
import type { Actor } from '../lib/vault';
import {
  addPerson as addPersonOp,
  createGrant as createGrantOp,
  extendGrant as extendGrantOp,
  offboardPerson as offboardPersonOp,
  reinstatePerson as reinstatePersonOp,
  revokeGrant as revokeGrantOp,
  revokeMany as revokeManyOp,
  sweepExpired,
  updatePerson as updatePersonOp } from
'../lib/grants';
import type { CreateGrantInput } from '../lib/grants';
import { computeSignals } from '../lib/detection';
import { currentDevice, touchDevice } from '../lib/device';
import { announce, announceLock, enqueue as enqueueOutbox, flushOutbox, initSync, onSync, peerCount } from '../lib/sync';
import { useTransferQueue } from '../hooks/useTransferQueue';
import type { IngestOptions, QueueItem } from '../hooks/useTransferQueue';
import { useOnline } from '../hooks/useOnline';
import type {
  Asset,
  DeviceRecord,
  Grant,
  LedgerEvent,
  Person,
  Signal,
  SignalAck,
  VaultMeta } from
'../types';

export type Phase = 'booting' | 'unsupported' | 'no-vault' | 'locked' | 'unlocked' | 'error';

export interface Materialised {
  url: string;
  blob: Blob;
  integrityOk: boolean;
  failedChunk: number | null;
}

interface VaultValue {
  phase: Phase;
  fatal: string | null;
  meta: VaultMeta | null;
  owner: Person | null;
  device: DeviceRecord | null;
  actor: Actor | null;
  assets: Asset[];
  grants: Grant[];
  people: Person[];
  events: LedgerEvent[];
  devices: DeviceRecord[];
  signals: Signal[];
  acks: SignalAck[];
  storage: {usage: number;quota: number;} | null;
  online: boolean;
  peers: number;
  outboxCount: number;
  busy: boolean;

  createVault: (input: {
    username: string;
    labName: string;
    orgDomain: string;
    ownerName: string;
    ownerEmail: string;
    passphrase: string;
    securityQuestion?: string;
    securityAnswer?: string;
  }) => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  recoverPassphrase: (answer: string, newPassphrase: string) => Promise<void>;
  lock: (reason?: string) => void;
  refresh: () => Promise<void>;

  transfers: QueueItem[];
  activeTransfers: QueueItem[];
  ingest: (files: File[], options: IngestOptions) => {accepted: number;rejected: string[];};
  pauseTransfer: (id: string) => void;
  resumeTransfer: (id: string) => void;
  cancelTransfer: (id: string) => Promise<void>;
  retryTransfer: (id: string) => void;
  reattachTransfer: (id: string, file: File) => {ok: boolean;message: string;};
  clearFinishedTransfers: () => void;

  materialise: (asset: Asset, contentKey?: CryptoKey) => Promise<Materialised>;
  releaseMaterialised: (assetId: string) => void;
  recordOpen: (asset: Asset, grantId?: string | null) => Promise<void>;
  recordCapture: (kind: string, assetId?: string | null, grantId?: string | null) => Promise<void>;
  deleteAsset: (asset: Asset, reason: string) => Promise<void>;
  editAsset: (asset: Asset, patch: Partial<Pick<Asset, 'name' | 'project' | 'sensitivity'>>) => Promise<void>;

  issueGrant: (input: Omit<CreateGrantInput, 'masterKey' | 'actor'>) => Promise<{grant: Grant;token: string;link: string;}>;
  revoke: (grantId: string, reason: string) => Promise<void>;
  revokeBatch: (grantIds: string[], reason: string) => Promise<number>;
  extend: (grantId: string, hours: number) => Promise<void>;

  addPerson: (input: Parameters<typeof addPersonOp>[0]) => Promise<Person>;
  editPerson: (person: Person, patch: Parameters<typeof updatePersonOp>[2]) => Promise<void>;
  offboard: (personId: string) => Promise<number>;
  reinstate: (personId: string) => Promise<void>;

  ackSignal: (signalId: string, note: string) => Promise<void>;
  unackSignal: (signalId: string) => Promise<void>;
  verifyLedger: () => Promise<ChainReport>;
  rotatePassphrase: (current: string, next: string) => Promise<void>;
  saveSettings: (patch: Partial<VaultMeta>) => Promise<void>;
  destroyVault: () => Promise<void>;
}

const VaultContext = createContext<VaultValue | null>(null);

export function VaultProvider({ children }: {children: React.ReactNode;}) {
  const [phase, setPhase] = useState<Phase>('booting');
  const [fatal, setFatal] = useState<string | null>(null);
  const [meta, setMeta] = useState<VaultMeta | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [acks, setAcks] = useState<SignalAck[]>([]);
  const [device, setDevice] = useState<DeviceRecord | null>(null);
  const [storage, setStorage] = useState<{usage: number;quota: number;} | null>(null);
  const [peers, setPeers] = useState(0);
  const [outboxCount, setOutboxCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const masterKeyRef = useRef<CryptoKey | null>(null);
  const materialised = useRef(new Map<string, Materialised>());
  const lastActivity = useRef(Date.now());
  const { online } = useOnline();

  const owner = useMemo(
    () => people.find((p) => p.id === meta?.ownerPersonId) ?? null,
    [people, meta]
  );

  const actor = useMemo<Actor | null>(() => {
    if (!device) return null;
    return {
      actorId: owner?.id ?? meta?.ownerPersonId ?? 'unknown',
      actorLabel: owner?.name ?? 'Owner',
      deviceId: device.id,
      deviceLabel: device.label
    };
  }, [owner, meta, device]);

  const refresh = useCallback(async () => {
    const [a, g, p, e, d, k] = await Promise.all([
    getAll<Asset>(STORES.assets),
    getAll<Grant>(STORES.grants),
    getAll<Person>(STORES.people),
    getAll<LedgerEvent>(STORES.events),
    getAll<DeviceRecord>(STORES.devices),
    getAll<SignalAck>(STORES.acks)]
    );
    setAssets(a.sort((x, y) => y.createdAt - x.createdAt));
    setGrants(g.sort((x, y) => y.createdAt - x.createdAt));
    setPeople(p.sort((x, y) => x.name.localeCompare(y.name)));
    setEvents(e.sort((x, y) => y.seq - x.seq));
    setDevices(d);
    setAcks(k);
    setStorage(await estimateUsage());
  }, []);

  /* ------------------------------------------------------------- boot */
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!cryptoAvailable()) {
        setPhase('unsupported');
        setFatal(
          'This browser does not expose WebCrypto. Canopy will not run without real encryption — it will not silently fall back to something weaker.'
        );
        return;
      }
      if (!storageAvailable()) {
        setPhase('unsupported');
        setFatal(
          'Local storage is blocked here (private browsing often does this). A vault cannot be held on this device.'
        );
        return;
      }
      try {
        const dev = await currentDevice();
        if (!alive) return;
        setDevice(dev);
        initSync(dev.id);
        void requestPersistence();
        const existing = await loadMeta();
        if (!alive) return;
        setMeta(existing ?? null);
        await refresh();
        if (!alive) return;
        setPhase(existing ? 'locked' : 'no-vault');
      } catch (error) {
        if (!alive) return;
        setPhase('error');
        setFatal((error as Error).message);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refresh]);

  /* ----------------------------------------------- peer sync + outbox */
  useEffect(() => {
    const off = onSync((message) => {
      if (message.kind === 'mutation') void refresh();
      setPeers(peerCount());
    });
    const timer = window.setInterval(() => {
      setPeers(peerCount());
      setNow(Date.now());
      void flushOutbox().then(({ remaining }) => setOutboxCount(remaining));
    }, 5_000);
    return () => {
      off();
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!online) return;
    void flushOutbox().then(({ delivered, remaining }) => {
      setOutboxCount(remaining);
      if (delivered) toast.success(`Replicated ${delivered} pending change(s) to local peers.`);
    });
  }, [online]);

  const clearMaterialised = useCallback(() => {
    materialised.current.forEach((m) => URL.revokeObjectURL(m.url));
    materialised.current.clear();
  }, []);

  const lock = useCallback(
    (reason?: string) => {
      masterKeyRef.current = null;
      clearMaterialised();
      setPhase((current) => current === 'unlocked' ? 'locked' : current);
      announceLock(true);
      if (actor) {
        void appendEvent({
          type: 'vault.locked',
          actorId: actor.actorId,
          actorLabel: actor.actorLabel,
          deviceId: actor.deviceId,
          deviceLabel: actor.deviceLabel,
          detail: { reason: reason ?? 'manual' }
        }).then(refresh);
      }
      if (reason) toast.info(reason);
    },
    [actor, clearMaterialised, refresh]
  );

  /* --------------------------------------------------------- auto-lock */
  useEffect(() => {
    if (phase !== 'unlocked' || !meta) return;
    const bump = () => {
      lastActivity.current = Date.now();
    };
    const events_ = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'focus'] as const;
    events_.forEach((name) => window.addEventListener(name, bump, { passive: true }));
    const timer = window.setInterval(() => {
      const idleMs = Date.now() - lastActivity.current;
      if (meta.autoLockMinutes > 0 && idleMs > meta.autoLockMinutes * 60_000) {
        lock(`Vault locked after ${meta.autoLockMinutes} minutes idle.`);
      }
    }, 15_000);
    return () => {
      events_.forEach((name) => window.removeEventListener(name, bump));
      window.clearInterval(timer);
    };
  }, [phase, meta, lock]);

  useEffect(() => () => clearMaterialised(), [clearMaterialised]);

  /* ------------------------------------------------------------ actions */

  const track = useCallback(
    async (store: string, id: string) => {
      announce(store, id);
      // Only queue when the device genuinely cannot publish. Queuing while
      // online with no peer listening would manufacture a backlog that means
      // nothing.
      if (!online) await enqueueOutbox(store, id);
      await refresh();
    },
    [online, refresh]
  );

  const createVault = useCallback<VaultValue['createVault']>(
    async (input) => {
      if (!device) throw new Error('Device identity is not ready yet.');
      setBusy(true);
      try {
        const { meta: created, masterKey } = await createVaultOp({ ...input, device });
        masterKeyRef.current = masterKey;
        setMeta(created);
        setPhase('unlocked');
        lastActivity.current = Date.now();
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [device, refresh]
  );

  const unlock = useCallback<VaultValue['unlock']>(
    async (passphrase) => {
      if (!device) throw new Error('Device identity is not ready yet.');
      setBusy(true);
      try {
        const { meta: opened, masterKey } = await unlockVaultOp(passphrase, device);
        masterKeyRef.current = masterKey;
        setMeta(opened);
        setPhase('unlocked');
        lastActivity.current = Date.now();
        announceLock(false);
        await touchDevice();
        await refresh();
        const currentActor: Actor = {
          actorId: opened.ownerPersonId,
          actorLabel: 'Owner',
          deviceId: device.id,
          deviceLabel: device.label
        };
        const swept = await sweepExpired(currentActor);
        if (swept) {
          await refresh();
          toast.info(`${swept} access window(s) closed on schedule while you were away.`);
        }
      } catch (error) {
        if (error instanceof WrongPassphraseError) await refresh();
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [device, refresh]
  );

  const queue = useTransferQueue({
    meta,
    masterKeyRef,
    actor,
    onSealed: (asset, duplicateOf) => {
      void track(STORES.assets, asset.id);
      if (duplicateOf) {
        toast.info(`"${asset.name}" is byte-identical to an item already in the vault. Kept one copy.`);
      }
    },
    onError: (message) => toast.error(message)
  });

  const materialise = useCallback<VaultValue['materialise']>(
    async (asset, contentKey) => {
      const cached = materialised.current.get(asset.id);
      if (cached) return cached;
      const key = contentKey ?? (masterKeyRef.current ? await getContentKey(asset, masterKeyRef.current) : null);
      if (!key) throw new Error('The vault is locked. Unlock it to open this item.');
      const result = await readAsset(asset, key);
      if (!result.integrityOk && actor) {
        await appendEvent({
          type: 'asset.integrity_failed',
          actorId: actor.actorId,
          actorLabel: actor.actorLabel,
          deviceId: actor.deviceId,
          deviceLabel: actor.deviceLabel,
          assetId: asset.id,
          detail: { failedChunk: result.failedChunk }
        });
        await refresh();
      }
      const entry: Materialised = {
        url: URL.createObjectURL(result.blob),
        blob: result.blob,
        integrityOk: result.integrityOk,
        failedChunk: result.failedChunk
      };
      materialised.current.set(asset.id, entry);
      return entry;
    },
    [actor, refresh]
  );

  const releaseMaterialised = useCallback((assetId: string) => {
    const entry = materialised.current.get(assetId);
    if (entry) {
      URL.revokeObjectURL(entry.url);
      materialised.current.delete(assetId);
    }
  }, []);

  const recordOpen = useCallback<VaultValue['recordOpen']>(
    async (asset, grantId) => {
      if (!actor) return;
      await appendEvent({
        type: 'asset.opened',
        actorId: actor.actorId,
        actorLabel: actor.actorLabel,
        deviceId: actor.deviceId,
        deviceLabel: actor.deviceLabel,
        assetId: asset.id,
        grantId: grantId ?? null,
        detail: { name: asset.name }
      });
      await refresh();
    },
    [actor, refresh]
  );

  const recordCapture = useCallback<VaultValue['recordCapture']>(
    async (kind, assetId, grantId) => {
      if (!device) return;
      await appendEvent({
        type: 'capture.attempt',
        actorId: owner?.id ?? 'unknown',
        actorLabel: owner?.name ?? 'Viewer',
        deviceId: device.id,
        deviceLabel: device.label,
        assetId: assetId ?? null,
        grantId: grantId ?? null,
        detail: { kind }
      });
      await refresh();
    },
    [device, owner, refresh]
  );

  const deleteAsset = useCallback<VaultValue['deleteAsset']>(
    async (asset, reason) => {
      if (!actor) return;
      releaseMaterialised(asset.id);
      await deleteAssetCascade(asset.id);
      await appendEvent({
        type: 'asset.deleted',
        actorId: actor.actorId,
        actorLabel: actor.actorLabel,
        deviceId: actor.deviceId,
        deviceLabel: actor.deviceLabel,
        assetId: asset.id,
        detail: { name: asset.name, reason }
      });
      await track(STORES.assets, asset.id);
    },
    [actor, releaseMaterialised, track]
  );

  const editAsset = useCallback<VaultValue['editAsset']>(
    async (asset, patch) => {
      const next = await updateAssetOp(asset.id, asset.rev, patch);
      await track(STORES.assets, next.id);
    },
    [track]
  );

  const issueGrant = useCallback<VaultValue['issueGrant']>(
    async (input) => {
      if (!masterKeyRef.current || !actor) throw new Error('Unlock the vault to share.');
      const result = await createGrantOp({ ...input, masterKey: masterKeyRef.current, actor });
      await track(STORES.grants, result.grant.id);
      return result;
    },
    [actor, track]
  );

  const revoke = useCallback<VaultValue['revoke']>(
    async (grantId, reason) => {
      if (!actor) return;
      await revokeGrantOp(grantId, reason, actor);
      await track(STORES.grants, grantId);
    },
    [actor, track]
  );

  const revokeBatch = useCallback<VaultValue['revokeBatch']>(
    async (grantIds, reason) => {
      if (!actor) return 0;
      const { revoked } = await revokeManyOp(grantIds, reason, actor);
      await refresh();
      return revoked;
    },
    [actor, refresh]
  );

  const extend = useCallback<VaultValue['extend']>(
    async (grantId, hours) => {
      if (!actor) return;
      await extendGrantOp(grantId, hours, actor);
      await track(STORES.grants, grantId);
    },
    [actor, track]
  );

  const addPerson = useCallback<VaultValue['addPerson']>(
    async (input) => {
      if (!meta || !actor) throw new Error('Unlock the vault first.');
      const person = await addPersonOp(input, meta, actor);
      await track(STORES.people, person.id);
      return person;
    },
    [meta, actor, track]
  );

  const editPerson = useCallback<VaultValue['editPerson']>(
    async (person, patch) => {
      if (!actor) return;
      await updatePersonOp(person.id, person.rev, patch, actor);
      await track(STORES.people, person.id);
    },
    [actor, track]
  );

  const offboard = useCallback<VaultValue['offboard']>(
    async (personId) => {
      if (!actor) return 0;
      const { revoked } = await offboardPersonOp(personId, actor);
      await refresh();
      return revoked;
    },
    [actor, refresh]
  );

  const reinstate = useCallback<VaultValue['reinstate']>(
    async (personId) => {
      if (!actor) return;
      await reinstatePersonOp(personId, actor);
      await refresh();
    },
    [actor, refresh]
  );

  const ackSignal = useCallback<VaultValue['ackSignal']>(
    async (signalId, note) => {
      const { put } = await import('../lib/db');
      await put(STORES.acks, { id: signalId, ackedAt: Date.now(), note } satisfies SignalAck);
      await refresh();
    },
    [refresh]
  );

  const unackSignal = useCallback<VaultValue['unackSignal']>(
    async (signalId) => {
      const { del } = await import('../lib/db');
      await del(STORES.acks, signalId);
      await refresh();
    },
    [refresh]
  );

  const verifyLedger = useCallback(() => verifyChain(), []);

  const rotatePassphrase = useCallback<VaultValue['rotatePassphrase']>(
    async (current, next) => {
      if (!actor) throw new Error('Unlock the vault first.');
      const updated = await changePassphraseOp(current, next, actor);
      setMeta(updated);
      masterKeyRef.current = null;
      clearMaterialised();
      setPhase('locked');
      await refresh();
    },
    [actor, clearMaterialised, refresh]
  );

  const recoverPassphrase = useCallback<VaultValue['recoverPassphrase']>(
    async (answer, newPassphrase) => {
      if (!device) throw new Error('Device identity is not ready yet.');
      setBusy(true);
      try {
        const { meta: recovered, masterKey } = await recoverPassphraseOp({
          answer,
          newPassphrase,
          device
        });
        masterKeyRef.current = masterKey;
        setMeta(recovered);
        setPhase('unlocked');
        lastActivity.current = Date.now();
        await touchDevice();
        await refresh();
      } finally {
        setBusy(false);
      }
    },
    [device, refresh]
  );

  const saveSettings = useCallback<VaultValue['saveSettings']>(
    async (patch) => {
      const updated = await updateMetaOp(patch);
      setMeta(updated);
      await track(STORES.meta, 'vault');
    },
    [track]
  );



  const destroyVault = useCallback(async () => {
    const { clearStores } = await import('../lib/db');
    clearMaterialised();
    masterKeyRef.current = null;
    await clearStores([
    STORES.meta,
    STORES.assets,
    STORES.chunks,
    STORES.grants,
    STORES.people,
    STORES.events,
    STORES.transfers,
    STORES.outbox,
    STORES.acks]
    );
    setMeta(null);
    await refresh();
    setPhase('no-vault');
  }, [clearMaterialised, refresh]);

  const signals = useMemo(
    () =>
    meta ?
    computeSignals({
      events,
      grants,
      people,
      assets,
      devices,
      orgDomain: meta.orgDomain,
      ownerId: meta.ownerPersonId,
      now
    }) :
    [],
    [events, grants, people, assets, devices, meta, now]
  );

  const value = useMemo<VaultValue>(
    () => ({
      phase,
      fatal,
      meta,
      owner,
      device,
      actor,
      assets,
      grants,
      people,
      events,
      devices,
      signals,
      acks,
      storage,
      online,
      peers,
      outboxCount,
      busy,
      createVault,
      unlock,
      lock,
      refresh,
      transfers: queue.items,
      activeTransfers: queue.active,
      ingest: queue.enqueue,
      pauseTransfer: queue.pause,
      resumeTransfer: queue.resume,
      cancelTransfer: queue.cancel,
      retryTransfer: queue.retry,
      reattachTransfer: queue.reattach,
      clearFinishedTransfers: queue.clearFinished,
      materialise,
      releaseMaterialised,
      recordOpen,
      recordCapture,
      deleteAsset,
      editAsset,
      issueGrant,
      revoke,
      revokeBatch,
      extend,
      addPerson,
      editPerson,
      offboard,
      reinstate,
      ackSignal,
      unackSignal,
      verifyLedger,
      rotatePassphrase,
      recoverPassphrase,
      saveSettings,
      destroyVault
    }),
    [
    phase, fatal, meta, owner, device, actor, assets, grants, people, events, devices,
    signals, acks, storage, online, peers, outboxCount, busy, createVault, unlock, lock,
    refresh, queue, materialise, releaseMaterialised, recordOpen, recordCapture,
    deleteAsset, editAsset, issueGrant, revoke, revokeBatch, extend, addPerson,
    editPerson, offboard, reinstate, ackSignal, unackSignal, verifyLedger,
    rotatePassphrase, recoverPassphrase, saveSettings, destroyVault]

  );

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultValue {
  const value = useContext(VaultContext);
  if (!value) throw new Error('useVault must be used inside VaultProvider');
  return value;
}