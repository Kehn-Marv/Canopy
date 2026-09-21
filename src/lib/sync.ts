/**
 * Peer replication and the offline outbox.
 *
 * Scope, stated honestly: Canopy replicates between Canopy windows on the same
 * machine over a BroadcastChannel. That is a real, working second surface — a
 * desktop window and a phone-width window stay consistent, links opened in one
 * appear in the other, revocations propagate immediately.
 *
 * A remote relay (for machine-to-machine sync) is a configuration this build
 * does not ship with. Rather than fake it, unsent changes are held in a durable
 * outbox with exponential backoff and surfaced as "pending" in the UI.
 */

import { newId } from './crypto';
import { STORES, del, getAll, put } from './db';
import type { OutboxOp } from '../types';

export type SyncMessage =
{kind: 'mutation';store: string;recordId: string;at: number;from: string;} |
{kind: 'hello';from: string;} |
{kind: 'here';from: string;} |
{kind: 'ack';opId: string;from: string;} |
{kind: 'lock';locked: boolean;from: string;};

type Listener = (message: SyncMessage) => void;

const CHANNEL = 'canopy.sync.v1';

let channel: BroadcastChannel | null = null;
const listeners = new Set<Listener>();
const peers = new Map<string, number>();
let selfId = '';

export function initSync(deviceId: string): void {
  if (channel) return;
  selfId = deviceId;
  if (typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event: MessageEvent<SyncMessage>) => {
    const message = event.data;
    if (!message || message.from === selfId) return;
    peers.set(message.from, Date.now());
    if (message.kind === 'hello') {
      channel?.postMessage({ kind: 'here', from: selfId } satisfies SyncMessage);
    }
    listeners.forEach((l) => l(message));
  };
  channel.postMessage({ kind: 'hello', from: selfId } satisfies SyncMessage);
  window.addEventListener('pagehide', () => channel?.close());
}

export function onSync(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function peerCount(): number {
  const cutoff = Date.now() - 30_000;
  for (const [id, at] of peers) if (at < cutoff) peers.delete(id);
  return peers.size;
}

export function announce(store: string, recordId: string): void {
  channel?.postMessage({
    kind: 'mutation',
    store,
    recordId,
    at: Date.now(),
    from: selfId
  } satisfies SyncMessage);
}

export function announceLock(locked: boolean): void {
  channel?.postMessage({ kind: 'lock', locked, from: selfId } satisfies SyncMessage);
}

/* ------------------------------------------------------------- the outbox */

export async function enqueue(store: string, recordId: string): Promise<void> {
  const op: OutboxOp = {
    id: newId('op'),
    kind: 'replicate',
    payload: { store, recordId },
    attempts: 0,
    nextAttemptAt: Date.now(),
    createdAt: Date.now(),
    lastError: null
  };
  await put(STORES.outbox, op);
}

export async function pendingOps(): Promise<OutboxOp[]> {
  return (await getAll<OutboxOp>(STORES.outbox)).sort((a, b) => a.createdAt - b.createdAt);
}

const BACKOFF_MS = [0, 2_000, 8_000, 30_000, 120_000, 600_000];

/**
 * Attempts delivery of everything due. Returns how many ops were delivered.
 * If nothing can receive them, attempts are recorded and retried later —
 * never dropped, never reported as success.
 */
export async function flushOutbox(): Promise<{delivered: number;remaining: number;}> {
  const ops = await pendingOps();
  const now = Date.now();
  let delivered = 0;
  // The local channel is the transport. Publishing succeeds when the channel is
  // open and the device is online; if no peer window is listening there is
  // genuinely nothing to deliver to, which is not the same as a failure.
  const reachable = Boolean(channel) && navigator.onLine !== false;

  for (const op of ops) {
    if (op.nextAttemptAt > now) continue;
    if (reachable) {
      announce(op.payload.store, op.payload.recordId);
      await del(STORES.outbox, op.id);
      delivered += 1;
    } else {
      const attempts = op.attempts + 1;
      await put(STORES.outbox, {
        ...op,
        attempts,
        nextAttemptAt: now + (BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)] ?? 600_000),
        lastError: navigator.onLine === false ? 'Device is offline' : 'No peer reachable'
      } satisfies OutboxOp);
    }
  }
  const remaining = (await pendingOps()).length;
  return { delivered, remaining };
}

export async function discardOutbox(): Promise<void> {
  const ops = await pendingOps();
  for (const op of ops) await del(STORES.outbox, op.id);
}