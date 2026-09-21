/**
 * Vault operations: creation, unlocking, and the chunked sealing / reading
 * pipeline. Every byte that enters the vault is encrypted here before it
 * touches storage, and every byte that leaves is verified against its digest.
 */

import {
  CHUNK_SIZE,
  deriveMasterKey,
  encryptChunk,
  decryptChunk,
  fromBase64,
  generateContentKey,
  newId,
  randomBytes,
  rootFromChunkDigests,
  seal,
  sha256Hex,
  toBase64,
  unseal,
  unwrapContentKey,
  wrapContentKey,
  KDF_ITERATIONS } from
'./crypto';
import { STORES, casPut, get, getAll, getAllByIndex, put, putMany } from './db';
import { appendEvent } from './ledger';
import { kindFor, sanitiseFileName } from './format';
import type {
  Asset,
  ChunkRecord,
  Person,
  Sensitivity,
  Transfer,
  VaultMeta } from
'../types';

const VERIFIER_PLAINTEXT = 'canopy/vault/v1';

export const LIMITS = {
  maxBatchFiles: 12,
  maxFileBytes: 256 * 1024 * 1024,
  minFileBytes: 1
};

export interface Actor {
  actorId: string;
  actorLabel: string;
  deviceId: string;
  deviceLabel: string;
}

export class WrongPassphraseError extends Error {
  constructor() {
    super('That passphrase does not open this vault.');
    this.name = 'WrongPassphraseError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export async function loadMeta(): Promise<VaultMeta | undefined> {
  return get<VaultMeta>(STORES.meta, 'vault');
}

export async function createVault(input: {
  labName: string;
  orgDomain: string;
  ownerName: string;
  ownerEmail: string;
  passphrase: string;
  device: {id: string;label: string;};
}): Promise<{meta: VaultMeta;masterKey: CryptoKey;owner: Person;}> {
  if (input.passphrase.length < 10) {
    throw new ValidationError('Use at least 10 characters. This key protects unpublished work.');
  }
  const existing = await loadMeta();
  if (existing) throw new ValidationError('A vault already exists on this device.');

  const salt = randomBytes(16);
  const masterKey = await deriveMasterKey(input.passphrase, salt, KDF_ITERATIONS);
  const verifier = await seal(masterKey, new TextEncoder().encode(VERIFIER_PLAINTEXT));

  const owner: Person = {
    id: newId('per'),
    name: input.ownerName.trim(),
    email: input.ownerEmail.trim().toLowerCase(),
    affiliation: input.labName.trim(),
    role: 'pi',
    internal: true,
    status: 'active',
    departureAt: null,
    createdAt: Date.now(),
    rev: 0
  };

  const meta: VaultMeta = {
    id: 'vault',
    schema: 1,
    createdAt: Date.now(),
    labName: input.labName.trim(),
    orgDomain: input.orgDomain.trim().toLowerCase(),
    ownerPersonId: owner.id,
    kdfSalt: toBase64(salt),
    kdfIterations: KDF_ITERATIONS,
    verifier,
    defaultGrantTtlHours: 24 * 7,
    autoLockMinutes: 15,
    maxBatchFiles: LIMITS.maxBatchFiles,
    maxFileBytes: LIMITS.maxFileBytes,
    demoSeeded: false
  };

  await put(STORES.people, owner);
  await put(STORES.meta, meta);
  await appendEvent({
    type: 'vault.created',
    actorId: owner.id,
    actorLabel: owner.name,
    deviceId: input.device.id,
    deviceLabel: input.device.label,
    detail: { lab: meta.labName, domain: meta.orgDomain }
  });
  return { meta, masterKey, owner };
}

export async function unlockVault(
passphrase: string,
device: {id: string;label: string;})
: Promise<{meta: VaultMeta;masterKey: CryptoKey;}> {
  const meta = await loadMeta();
  if (!meta) throw new ValidationError('No vault on this device yet.');
  const masterKey = await deriveMasterKey(
    passphrase,
    fromBase64(meta.kdfSalt),
    meta.kdfIterations
  );
  try {
    const plain = new TextDecoder().decode(await unseal(masterKey, meta.verifier));
    if (plain !== VERIFIER_PLAINTEXT) throw new Error('mismatch');
  } catch {
    await appendEvent({
      type: 'vault.unlock_failed',
      actorId: meta.ownerPersonId,
      actorLabel: 'Unknown',
      deviceId: device.id,
      deviceLabel: device.label,
      detail: {}
    });
    throw new WrongPassphraseError();
  }
  const owner = await get<Person>(STORES.people, meta.ownerPersonId);
  await appendEvent({
    type: 'vault.unlocked',
    actorId: meta.ownerPersonId,
    actorLabel: owner?.name ?? 'Owner',
    deviceId: device.id,
    deviceLabel: device.label,
    detail: {}
  });
  return { meta, masterKey };
}

export async function changePassphrase(
current: string,
next: string,
actor: Actor)
: Promise<VaultMeta> {
  if (next.length < 10) throw new ValidationError('The new passphrase is too short.');
  const meta = await loadMeta();
  if (!meta) throw new ValidationError('No vault found.');
  const currentKey = await deriveMasterKey(current, fromBase64(meta.kdfSalt), meta.kdfIterations);
  try {
    await unseal(currentKey, meta.verifier);
  } catch {
    throw new WrongPassphraseError();
  }
  const salt = randomBytes(16);
  const nextKey = await deriveMasterKey(next, salt, KDF_ITERATIONS);

  // Re-wrap every asset key under the new master key, then commit the meta.
  const assets = await getAll<Asset>(STORES.assets);
  const rewrapped: Asset[] = [];
  for (const asset of assets) {
    const contentKey = await unwrapContentKey(currentKey, asset.wrappedKey);
    rewrapped.push({
      ...asset,
      wrappedKey: await wrapContentKey(nextKey, contentKey),
      rev: asset.rev + 1
    });
  }
  await putMany(STORES.assets, rewrapped);
  const nextMeta: VaultMeta = {
    ...meta,
    kdfSalt: toBase64(salt),
    kdfIterations: KDF_ITERATIONS,
    verifier: await seal(nextKey, new TextEncoder().encode(VERIFIER_PLAINTEXT))
  };
  await put(STORES.meta, nextMeta);
  await appendEvent({
    type: 'vault.locked',
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    deviceId: actor.deviceId,
    deviceLabel: actor.deviceLabel,
    detail: { reason: 'passphrase rotated', assetsRewrapped: rewrapped.length }
  });
  return nextMeta;
}

export async function updateMeta(patch: Partial<VaultMeta>): Promise<VaultMeta> {
  const meta = await loadMeta();
  if (!meta) throw new ValidationError('No vault found.');
  const next = { ...meta, ...patch, id: 'vault' as const };
  await put(STORES.meta, next);
  return next;
}

/* ------------------------------------------------------------- transfers */

export interface TransferControl {
  paused: boolean;
  cancelled: boolean;
}

export class TransferCancelled extends Error {
  constructor() {
    super('Transfer cancelled');
    this.name = 'TransferCancelled';
  }
}

async function waitWhilePaused(control: TransferControl): Promise<void> {
  while (control.paused && !control.cancelled) {
    await new Promise((r) => setTimeout(r, 180));
  }
  if (control.cancelled) throw new TransferCancelled();
}

export function validateFile(file: File, meta: VaultMeta): string | null {
  if (file.size < LIMITS.minFileBytes) {
    return 'Empty file (0 bytes). There is nothing to seal.';
  }
  if (file.size > meta.maxFileBytes) {
    return `Larger than the ${Math.round(meta.maxFileBytes / (1024 * 1024))} MB per-item limit.`;
  }
  return null;
}

export interface SealOptions {
  file: File;
  masterKey: CryptoKey;
  meta: VaultMeta;
  actor: Actor;
  project: string;
  sensitivity: Sensitivity;
  control: TransferControl;
  transferId?: string;
  onProgress?: (completed: number, total: number) => void;
}

export interface SealResult {
  asset: Asset;
  duplicateOf: Asset | null;
}

/**
 * Encrypt-then-store, one chunk at a time. Progress is persisted after every
 * chunk, so pausing, losing power, or closing the window never costs more than
 * the chunk in flight.
 */
export async function sealFile(options: SealOptions): Promise<SealResult> {
  const { file, masterKey, meta, actor, control } = options;
  const problem = validateFile(file, meta);
  if (problem) throw new ValidationError(problem);

  const name = sanitiseFileName(file.name);
  const chunkCount = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
  const transferId = options.transferId ?? newId('trf');

  let assetId = transferId.replace('trf_', 'ast_');
  let contentKey: CryptoKey;
  let existingAsset = await get<Asset>(STORES.assets, assetId);
  if (existingAsset) {
    contentKey = await unwrapContentKey(masterKey, existingAsset.wrappedKey);
  } else {
    contentKey = await generateContentKey();
    existingAsset = {
      id: assetId,
      name,
      mime: file.type || 'application/octet-stream',
      size: file.size,
      kind: kindFor(name, file.type || ''),
      root: '',
      chunkSize: CHUNK_SIZE,
      chunkCount,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      project: options.project,
      sensitivity: options.sensitivity,
      wrappedKey: await wrapContentKey(masterKey, contentKey),
      status: 'sealing',
      ownerId: actor.actorId,
      rev: 0
    };
    await put(STORES.assets, existingAsset);
  }
  assetId = existingAsset.id;

  const done = await getAllByIndex<ChunkRecord>(STORES.chunks, 'assetId', assetId);
  const digests: string[] = [];
  for (const chunk of done.sort((a, b) => a.index - b.index)) digests[chunk.index] = chunk.digest;
  let completed = digests.filter(Boolean).length;

  const transfer: Transfer = {
    id: transferId,
    kind: 'ingest',
    assetId,
    name,
    size: file.size,
    chunkSize: CHUNK_SIZE,
    chunkCount,
    completed,
    status: 'running',
    error: null,
    startedAt: Date.now(),
    updatedAt: Date.now()
  };
  await put(STORES.transfers, transfer);
  options.onProgress?.(completed, chunkCount);

  try {
    for (let index = 0; index < chunkCount; index += 1) {
      if (digests[index]) continue;
      await waitWhilePaused(control);
      if (control.cancelled) throw new TransferCancelled();

      const slice = file.slice(index * CHUNK_SIZE, Math.min((index + 1) * CHUNK_SIZE, file.size));
      const plain = new Uint8Array(await slice.arrayBuffer());
      const { iv, data } = await encryptChunk(contentKey, plain);
      const digest = await sha256Hex(data);
      const record: ChunkRecord = {
        assetId,
        index,
        iv,
        digest,
        bytes: data.byteLength,
        data
      };
      await put(STORES.chunks, record);
      digests[index] = digest;
      completed += 1;
      await put(STORES.transfers, {
        ...transfer,
        completed,
        status: 'running',
        updatedAt: Date.now()
      });
      options.onProgress?.(completed, chunkCount);
      // Yield so the interface stays responsive on modest hardware.
      await new Promise((r) => setTimeout(r, 0));
    }

    const root = await rootFromChunkDigests(digests);
    const sameRoot = (await getAllByIndex<Asset>(STORES.assets, 'root', root)).filter(
      (a) => a.id !== assetId && a.status === 'sealed'
    );
    if (sameRoot.length) {
      await put(STORES.transfers, {
        ...transfer,
        completed: chunkCount,
        status: 'done',
        updatedAt: Date.now()
      });
      const { deleteAssetCascade } = await import('./db');
      await deleteAssetCascade(assetId);
      return { asset: sameRoot[0], duplicateOf: sameRoot[0] };
    }

    const sealed: Asset = {
      ...existingAsset,
      root,
      status: 'sealed',
      updatedAt: Date.now(),
      rev: existingAsset.rev + 1
    };
    await put(STORES.assets, sealed);
    await put(STORES.transfers, {
      ...transfer,
      completed: chunkCount,
      status: 'done',
      updatedAt: Date.now()
    });
    await appendEvent({
      type: 'asset.sealed',
      actorId: actor.actorId,
      actorLabel: actor.actorLabel,
      deviceId: actor.deviceId,
      deviceLabel: actor.deviceLabel,
      assetId,
      detail: {
        name: sealed.name,
        bytes: sealed.size,
        chunks: chunkCount,
        root: root.slice(0, 16),
        sensitivity: sealed.sensitivity
      }
    });
    return { asset: sealed, duplicateOf: null };
  } catch (error) {
    const cancelled = error instanceof TransferCancelled;
    await put(STORES.transfers, {
      ...transfer,
      completed,
      status: cancelled ? 'cancelled' : 'error',
      error: cancelled ? null : (error as Error).message,
      updatedAt: Date.now()
    });
    if (cancelled) {
      const { deleteAssetCascade } = await import('./db');
      await deleteAssetCascade(assetId);
    }
    throw error;
  }
}

export async function getContentKey(asset: Asset, masterKey: CryptoKey): Promise<CryptoKey> {
  return unwrapContentKey(masterKey, asset.wrappedKey);
}

export interface ReadResult {
  blob: Blob;
  integrityOk: boolean;
  failedChunk: number | null;
}

/** Decrypts an asset chunk by chunk, verifying each ciphertext digest first. */
export async function readAsset(
asset: Asset,
contentKey: CryptoKey,
options: {
  control?: TransferControl;
  onProgress?: (completed: number, total: number) => void;
} = {})
: Promise<ReadResult> {
  const chunks = (await getAllByIndex<ChunkRecord>(STORES.chunks, 'assetId', asset.id)).sort(
    (a, b) => a.index - b.index
  );
  if (chunks.length !== asset.chunkCount) {
    return { blob: new Blob([]), integrityOk: false, failedChunk: chunks.length };
  }
  const parts: ArrayBuffer[] = [];
  const digests: string[] = [];
  for (const chunk of chunks) {
    if (options.control) await waitWhilePaused(options.control);
    const digest = await sha256Hex(chunk.data);
    if (digest !== chunk.digest) {
      return { blob: new Blob([]), integrityOk: false, failedChunk: chunk.index };
    }
    digests.push(digest);
    parts.push(await decryptChunk(contentKey, chunk.iv, chunk.data));
    options.onProgress?.(parts.length, chunks.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  const root = await rootFromChunkDigests(digests);
  if (root !== asset.root) {
    return { blob: new Blob([]), integrityOk: false, failedChunk: null };
  }
  return {
    blob: new Blob(parts, { type: asset.mime }),
    integrityOk: true,
    failedChunk: null
  };
}

/** Raw ciphertext chunks, used when producing a sealed container. */
export async function readCipherChunks(asset: Asset): Promise<ChunkRecord[]> {
  return (await getAllByIndex<ChunkRecord>(STORES.chunks, 'assetId', asset.id)).sort(
    (a, b) => a.index - b.index
  );
}

export async function updateAsset(
assetId: string,
expectedRev: number,
patch: Partial<Pick<Asset, 'name' | 'project' | 'sensitivity'>>)
: Promise<Asset> {
  return casPut<Asset>(STORES.assets, assetId, expectedRev, (current) => ({
    ...current,
    ...patch,
    name: patch.name ? sanitiseFileName(patch.name) : current.name,
    updatedAt: Date.now()
  }));
}