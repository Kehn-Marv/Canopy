/**
 * Hash-chained audit ledger.
 *
 * Each entry commits to the hash of the one before it, so removing or editing
 * a row invalidates every row after it. `verifyChain` recomputes the whole
 * chain from scratch — it is a real check, not a badge.
 *
 * Sequence allocation is guarded by a Web Lock (falling back to an in-process
 * mutex) because hashing is async and two windows could otherwise mint the
 * same sequence number.
 */

import { sha256Hex } from './crypto';
import { STORES, getAll, idbFinished, idbRequest, openDb } from './db';
import type { LedgerEvent, EventType } from '../types';

export const GENESIS_HASH = '0'.repeat(64);

export interface AppendInput {
  type: EventType;
  actorId: string;
  actorLabel: string;
  deviceId: string;
  deviceLabel: string;
  assetId?: string | null;
  grantId?: string | null;
  detail?: Record<string, string | number | boolean | null>;
}

function canonical(e: Omit<LedgerEvent, 'hash'>): string {
  return JSON.stringify([
  e.seq,
  e.ts,
  e.type,
  e.actorId,
  e.deviceId,
  e.assetId ?? '',
  e.grantId ?? '',
  Object.keys(e.detail).
  sort().
  map((k) => [k, e.detail[k]]),
  e.prevHash]
  );
}

export async function hashEvent(e: Omit<LedgerEvent, 'hash'>): Promise<string> {
  return sha256Hex(new TextEncoder().encode(canonical(e)));
}

let localChain: Promise<unknown> = Promise.resolve();

async function withLedgerLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = (navigator as Navigator & {locks?: LockManager;}).locks;
  if (locks?.request) {
    return locks.request('canopy:ledger', { mode: 'exclusive' }, fn) as Promise<T>;
  }
  const run = localChain.then(fn, fn);
  localChain = run.catch(() => undefined);
  return run;
}

async function readTail(): Promise<{seq: number;hash: string;}> {
  const db = await openDb();
  const tx = db.transaction(STORES.events);
  const cursor = await idbRequest(
    tx.objectStore(STORES.events).openCursor(null, 'prev') as IDBRequest<IDBCursorWithValue | null>
  );
  if (!cursor) return { seq: 0, hash: GENESIS_HASH };
  const last = cursor.value as LedgerEvent;
  return { seq: last.seq, hash: last.hash };
}

export async function appendEvent(input: AppendInput): Promise<LedgerEvent> {
  return withLedgerLock(async () => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const tail = await readTail();
      const draft: Omit<LedgerEvent, 'hash'> = {
        seq: tail.seq + 1,
        ts: Date.now(),
        type: input.type,
        actorId: input.actorId,
        actorLabel: input.actorLabel,
        deviceId: input.deviceId,
        deviceLabel: input.deviceLabel,
        assetId: input.assetId ?? null,
        grantId: input.grantId ?? null,
        detail: input.detail ?? {},
        prevHash: tail.hash
      };
      const event: LedgerEvent = { ...draft, hash: await hashEvent(draft) };

      const db = await openDb();
      const tx = db.transaction(STORES.events, 'readwrite');
      const store = tx.objectStore(STORES.events);
      // `add` fails if the sequence was taken while we hashed — retry cleanly.
      const addReq = store.add(event as unknown as Record<string, unknown>);
      try {
        await idbRequest(addReq);
        await idbFinished(tx);
        return event;
      } catch {
        try {
          tx.abort();
        } catch {

          /* already aborted */}
      }
    }
    throw new Error('Could not append to the audit ledger after several attempts.');
  });
}

export interface ChainReport {
  total: number;
  valid: boolean;
  brokenAt: number | null;
  reason: string | null;
  checkedAt: number;
}

export async function verifyChain(): Promise<ChainReport> {
  const events = (await getAll<LedgerEvent>(STORES.events)).sort((a, b) => a.seq - b.seq);
  let prevHash = GENESIS_HASH;
  let expectedSeq = 1;
  for (const e of events) {
    if (e.seq !== expectedSeq) {
      return {
        total: events.length,
        valid: false,
        brokenAt: e.seq,
        reason: `Sequence gap: expected #${expectedSeq}, found #${e.seq}.`,
        checkedAt: Date.now()
      };
    }
    if (e.prevHash !== prevHash) {
      return {
        total: events.length,
        valid: false,
        brokenAt: e.seq,
        reason: `Entry #${e.seq} does not link to the previous entry.`,
        checkedAt: Date.now()
      };
    }
    const { hash, ...rest } = e;
    const recomputed = await hashEvent(rest);
    if (recomputed !== hash) {
      return {
        total: events.length,
        valid: false,
        brokenAt: e.seq,
        reason: `Entry #${e.seq} has been altered since it was written.`,
        checkedAt: Date.now()
      };
    }
    prevHash = hash;
    expectedSeq += 1;
  }
  return {
    total: events.length,
    valid: true,
    brokenAt: null,
    reason: null,
    checkedAt: Date.now()
  };
}

export const EVENT_LABELS: Record<EventType, string> = {
  'vault.created': 'Vault created',
  'vault.unlocked': 'Vault unlocked',
  'vault.locked': 'Vault locked',
  'vault.unlock_failed': 'Failed unlock attempt',
  'asset.sealed': 'Sealed into vault',
  'asset.opened': 'Opened in protected viewer',
  'asset.exported': 'Copy released',
  'asset.deleted': 'Withdrawn from vault',
  'asset.integrity_failed': 'Integrity check failed',
  'grant.created': 'Access granted',
  'grant.revoked': 'Access revoked',
  'grant.expired': 'Access expired',
  'grant.opened': 'Opened via link',
  'grant.denied': 'Access denied',
  'grant.terms_accepted': 'Terms accepted',
  'grant.terms_declined': 'Terms declined',
  'grant.extension_requested': 'Extension requested',
  'grant.extended': 'Access extended',
  'person.added': 'Collaborator added',
  'person.updated': 'Collaborator updated',
  'person.offboarded': 'Collaborator offboarded',
  'capture.attempt': 'Screen-capture attempt',
  'container.opened': 'Sealed container opened',
  'container.refused': 'Sealed container refused',
  'sync.replicated': 'Replicated to peer'
};

export const DENY_EVENTS: EventType[] = [
'grant.denied',
'container.refused',
'asset.integrity_failed',
'vault.unlock_failed'];