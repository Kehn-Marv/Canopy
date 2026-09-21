/**
 * Durable local store. IndexedDB is the system of record on every client:
 * the app is fully usable with the network down, which is the normal
 * condition on a Nigerian campus during a power or link outage.
 *
 * Every write goes through either `put` (unconditional) or `casPut`
 * (compare-and-swap on `rev`) so two tabs / two windows editing the same
 * record cannot silently clobber each other.
 */

export const DB_NAME = 'canopy';
export const DB_VERSION = 1;

export const STORES = {
  meta: 'meta',
  assets: 'assets',
  chunks: 'chunks',
  grants: 'grants',
  people: 'people',
  events: 'events',
  transfers: 'transfers',
  devices: 'devices',
  outbox: 'outbox',
  acks: 'acks'
} as const;

export type StoreName = (typeof STORES)[keyof typeof STORES];

export class StaleWriteError extends Error {
  constructor(message = 'This record changed on another device. Reload and retry.') {
    super(message);
    this.name = 'StaleWriteError';
  }
}

export class StorageUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageUnavailableError';
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function storageAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (!storageAvailable()) {
    return Promise.reject(
      new StorageUnavailableError(
        'This browser blocks local storage (often private mode). Canopy cannot hold a vault here.'
      )
    );
  }
  dbPromise = new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.assets)) {
        const s = db.createObjectStore(STORES.assets, { keyPath: 'id' });
        s.createIndex('project', 'project');
        s.createIndex('createdAt', 'createdAt');
        s.createIndex('root', 'root');
      }
      if (!db.objectStoreNames.contains(STORES.chunks)) {
        const s = db.createObjectStore(STORES.chunks, { keyPath: ['assetId', 'index'] });
        s.createIndex('assetId', 'assetId');
      }
      if (!db.objectStoreNames.contains(STORES.grants)) {
        const s = db.createObjectStore(STORES.grants, { keyPath: 'id' });
        s.createIndex('assetId', 'assetId');
        s.createIndex('recipientId', 'recipientId');
        s.createIndex('status', 'status');
      }
      if (!db.objectStoreNames.contains(STORES.people)) {
        const s = db.createObjectStore(STORES.people, { keyPath: 'id' });
        s.createIndex('email', 'email', { unique: true });
      }
      if (!db.objectStoreNames.contains(STORES.events)) {
        const s = db.createObjectStore(STORES.events, { keyPath: 'seq' });
        s.createIndex('ts', 'ts');
        s.createIndex('actorId', 'actorId');
        s.createIndex('assetId', 'assetId');
        s.createIndex('type', 'type');
      }
      if (!db.objectStoreNames.contains(STORES.transfers)) {
        db.createObjectStore(STORES.transfers, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.devices)) {
        db.createObjectStore(STORES.devices, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.outbox)) {
        const s = db.createObjectStore(STORES.outbox, { keyPath: 'id' });
        s.createIndex('nextAttemptAt', 'nextAttemptAt');
      }
      if (!db.objectStoreNames.contains(STORES.acks)) {
        db.createObjectStore(STORES.acks, { keyPath: 'id' });
      }
    };
    open.onsuccess = () => {
      const db = open.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    open.onerror = () =>
    reject(
      new StorageUnavailableError(
        open.error?.message ?? 'Could not open the local vault store.'
      )
    );
    open.onblocked = () =>
    reject(
      new StorageUnavailableError(
        'Another Canopy window is upgrading the vault. Close it and retry.'
      )
    );
  });
  return dbPromise;
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('Transaction failed'));
  });
}

export async function get<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDb();
  return request<T | undefined>(db.transaction(store).objectStore(store).get(key) as IDBRequest<T | undefined>);
}

export async function getAll<T>(store: StoreName): Promise<T[]> {
  const db = await openDb();
  return request<T[]>(db.transaction(store).objectStore(store).getAll() as IDBRequest<T[]>);
}

export async function getAllByIndex<T>(
store: StoreName,
index: string,
key: IDBValidKey | IDBKeyRange)
: Promise<T[]> {
  const db = await openDb();
  return request<T[]>(
    db.transaction(store).objectStore(store).index(index).getAll(key) as IDBRequest<T[]>
  );
}

export async function put<T>(store: StoreName, value: T): Promise<T> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value as unknown as Record<string, unknown>);
  await finished(tx);
  return value;
}

export async function putMany<T>(store: StoreName, values: T[]): Promise<void> {
  if (!values.length) return;
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const v of values) os.put(v as unknown as Record<string, unknown>);
  await finished(tx);
}

export async function del(store: StoreName, key: IDBValidKey): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await finished(tx);
}

export async function clearStores(stores: StoreName[]): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(stores, 'readwrite');
  for (const s of stores) tx.objectStore(s).clear();
  await finished(tx);
}

/**
 * Compare-and-swap update. `mutate` receives the record as currently stored;
 * the write is rejected if `expectedRev` no longer matches, so a stale tab
 * cannot overwrite a newer revocation.
 */
export async function casPut<T extends {rev: number;}>(
store: StoreName,
key: IDBValidKey,
expectedRev: number,
mutate: (current: T) => T)
: Promise<T> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  const current = await request<T | undefined>(os.get(key) as IDBRequest<T | undefined>);
  if (!current) {
    tx.abort();
    throw new StaleWriteError('That record no longer exists.');
  }
  if (current.rev !== expectedRev) {
    tx.abort();
    throw new StaleWriteError();
  }
  const next = { ...mutate(current), rev: current.rev + 1 };
  os.put(next as unknown as Record<string, unknown>);
  await finished(tx);
  return next;
}

/** Deletes an asset and every chunk belonging to it in one atomic transaction. */
export async function deleteAssetCascade(assetId: string): Promise<number> {
  const db = await openDb();
  const tx = db.transaction([STORES.assets, STORES.chunks, STORES.grants], 'readwrite');
  tx.objectStore(STORES.assets).delete(assetId);
  const chunkIndex = tx.objectStore(STORES.chunks).index('assetId');
  let removed = 0;
  await new Promise<void>((resolve, reject) => {
    const cursorReq = chunkIndex.openCursor(IDBKeyRange.only(assetId));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        removed += 1;
        cursor.continue();
      } else resolve();
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
  const grantIndex = tx.objectStore(STORES.grants).index('assetId');
  await new Promise<void>((resolve, reject) => {
    const cursorReq = grantIndex.openCursor(IDBKeyRange.only(assetId));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        const value = cursor.value as {status: string;wrappedKey: unknown;revokedAt: number | null;revokedReason: string | null;rev: number;};
        cursor.update({
          ...value,
          status: 'revoked',
          wrappedKey: null,
          revokedAt: Date.now(),
          revokedReason: 'Source withdrawn from the vault',
          rev: value.rev + 1
        });
        cursor.continue();
      } else resolve();
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
  await finished(tx);
  return removed;
}

export async function estimateUsage(): Promise<{usage: number;quota: number;} | null> {
  if (!navigator.storage?.estimate) return null;
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return null;
  }
}

/** Ask the browser not to evict the vault under storage pressure. */
export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted?.()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export { request as idbRequest, finished as idbFinished };