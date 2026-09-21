import { useCallback, useEffect, useRef, useState } from 'react';
import { LIMITS, TransferCancelled, ValidationError, sealFile, validateFile } from '../lib/vault';
import type { Actor, TransferControl } from '../lib/vault';
import { STORES, getAll, put } from '../lib/db';
import { newId } from '../lib/crypto';
import type { Asset, Sensitivity, Transfer, VaultMeta } from '../types';

export interface QueueItem {
  id: string;
  name: string;
  size: number;
  status: Transfer['status'] | 'rejected';
  completed: number;
  chunkCount: number;
  error: string | null;
  bytesPerSecond: number;
  assetId: string | null;
  /** Present while the page lives; lost on restart, which is why we can ask for it again. */
  file: File | null;
  project: string;
  sensitivity: Sensitivity;
  needsReattach: boolean;
}

export interface IngestOptions {
  project: string;
  sensitivity: Sensitivity;
}

interface Deps {
  meta: VaultMeta | null;
  masterKeyRef: React.MutableRefObject<CryptoKey | null>;
  actor: Actor | null;
  onSealed: (asset: Asset, duplicateOf: Asset | null) => void;
  onError: (message: string) => void;
}

/**
 * A single-lane, resumable ingest queue.
 *
 * One item encrypts at a time: AES-GCM over 1 MiB chunks is CPU-bound, and
 * racing four files at once on a modest laptop makes the whole interface
 * stutter. Progress is written to IndexedDB after every chunk, so pausing,
 * losing power, or closing the window never costs more than one chunk.
 */
export function useTransferQueue(deps: Deps) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const controls = useRef(new Map<string, TransferControl>());
  const running = useRef(false);
  const queue = useRef<string[]>([]);
  const itemsRef = useRef<QueueItem[]>([]);
  itemsRef.current = items;

  const patch = useCallback((id: string, next: Partial<QueueItem>) => {
    setItems((current) => current.map((i) => i.id === id ? { ...i, ...next } : i));
  }, []);

  /* Recover transfers interrupted by a crash, power cut or closed window. */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stored = await getAll<Transfer>(STORES.transfers);
      const stale = stored.filter((t) => t.kind === 'ingest' && (t.status === 'running' || t.status === 'paused'));
      if (cancelled || !stale.length) return;
      setItems((current) => {
        const known = new Set(current.map((i) => i.id));
        const recovered: QueueItem[] = stale.
        filter((t) => !known.has(t.id)).
        map((t) => ({
          id: t.id,
          name: t.name,
          size: t.size,
          status: 'paused',
          completed: t.completed,
          chunkCount: t.chunkCount,
          error: null,
          bytesPerSecond: 0,
          assetId: t.assetId,
          file: null,
          project: 'Recovered',
          sensitivity: 'internal',
          needsReattach: true
        }));
        return [...recovered, ...current];
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      while (queue.current.length) {
        const id = queue.current.shift()!;
        const item = itemsRef.current.find((i) => i.id === id);
        const masterKey = deps.masterKeyRef.current;
        if (!item || !item.file || !masterKey || !deps.meta || !deps.actor) {
          patch(id, { status: 'paused', needsReattach: !item?.file });
          continue;
        }
        const control: TransferControl = controls.current.get(id) ?? { paused: false, cancelled: false };
        controls.current.set(id, control);
        patch(id, { status: 'running', error: null });

        const startedAt = performance.now();
        const startChunk = item.completed;
        try {
          const result = await sealFile({
            file: item.file,
            masterKey,
            meta: deps.meta,
            actor: deps.actor,
            project: item.project,
            sensitivity: item.sensitivity,
            control,
            transferId: id,
            onProgress: (completed, total) => {
              const elapsed = (performance.now() - startedAt) / 1000;
              const movedChunks = Math.max(0, completed - startChunk);
              patch(id, {
                completed,
                chunkCount: total,
                bytesPerSecond: elapsed > 0.3 ? movedChunks * 1024 * 1024 / elapsed : 0
              });
            }
          });
          patch(id, {
            status: 'done',
            completed: result.asset.chunkCount,
            assetId: result.asset.id,
            file: null
          });
          deps.onSealed(result.asset, result.duplicateOf);
        } catch (error) {
          if (error instanceof TransferCancelled) {
            patch(id, { status: 'cancelled', file: null });
          } else {
            const message =
            error instanceof ValidationError ?
            error.message :
            `Sealing failed: ${(error as Error).message}`;
            patch(id, { status: 'error', error: message });
            deps.onError(message);
          }
        }
      }
    } finally {
      running.current = false;
    }
  }, [deps, patch]);

  const enqueue = useCallback(
    (files: File[], options: IngestOptions) => {
      if (!deps.meta) return { accepted: 0, rejected: [] as string[] };
      const capacity = deps.meta.maxBatchFiles;
      const accepted: QueueItem[] = [];
      const rejected: string[] = [];

      files.slice(0, capacity).forEach((file) => {
        const problem = validateFile(file, deps.meta as VaultMeta);
        const id = newId('trf');
        if (problem) {
          rejected.push(`${file.name} — ${problem}`);
          accepted.push({
            id,
            name: file.name,
            size: file.size,
            status: 'rejected',
            completed: 0,
            chunkCount: 0,
            error: problem,
            bytesPerSecond: 0,
            assetId: null,
            file: null,
            project: options.project,
            sensitivity: options.sensitivity,
            needsReattach: false
          });
          return;
        }
        accepted.push({
          id,
          name: file.name,
          size: file.size,
          status: 'queued',
          completed: 0,
          chunkCount: Math.max(1, Math.ceil(file.size / (1024 * 1024))),
          error: null,
          bytesPerSecond: 0,
          assetId: null,
          file,
          project: options.project,
          sensitivity: options.sensitivity,
          needsReattach: false
        });
      });

      if (files.length > capacity) {
        rejected.push(
          `${files.length - capacity} file(s) were not queued — ${capacity} per batch keeps the device responsive.`
        );
      }

      setItems((current) => [...accepted, ...current]);
      itemsRef.current = [...accepted, ...itemsRef.current];
      queue.current.push(...accepted.filter((i) => i.status === 'queued').map((i) => i.id));
      void pump();
      return { accepted: accepted.filter((i) => i.status === 'queued').length, rejected };
    },
    [deps.meta, pump]
  );

  const pause = useCallback(
    (id: string) => {
      const control = controls.current.get(id);
      if (control) control.paused = true;
      patch(id, { status: 'paused', bytesPerSecond: 0 });
    },
    [patch]
  );

  const resume = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item) return;
      if (!item.file) {
        patch(id, { needsReattach: true, status: 'paused' });
        return;
      }
      const control = controls.current.get(id);
      if (control) {
        control.paused = false;
        patch(id, { status: 'running' });
        return;
      }
      patch(id, { status: 'queued' });
      queue.current.push(id);
      void pump();
    },
    [patch, pump]
  );

  const cancel = useCallback(
    async (id: string) => {
      const control = controls.current.get(id);
      if (control) {
        control.cancelled = true;
        control.paused = false;
      } else {
        queue.current = queue.current.filter((q) => q !== id);
        patch(id, { status: 'cancelled', file: null });
        const stored = (await getAll<Transfer>(STORES.transfers)).find((t) => t.id === id);
        if (stored) await put(STORES.transfers, { ...stored, status: 'cancelled', updatedAt: Date.now() });
      }
    },
    [patch]
  );

  const retry = useCallback(
    (id: string) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item?.file) {
        patch(id, { needsReattach: true });
        return;
      }
      controls.current.set(id, { paused: false, cancelled: false });
      patch(id, { status: 'queued', error: null });
      queue.current.push(id);
      void pump();
    },
    [patch, pump]
  );

  /** Re-attaching the same file after a restart continues from the last chunk. */
  const reattach = useCallback(
    (id: string, file: File) => {
      const item = itemsRef.current.find((i) => i.id === id);
      if (!item) return { ok: false, message: 'That transfer is gone.' };
      if (file.size !== item.size) {
        return {
          ok: false,
          message: 'That is a different file — the size does not match. Resuming would corrupt it.'
        };
      }
      controls.current.set(id, { paused: false, cancelled: false });
      setItems((current) =>
      current.map((i) => i.id === id ? { ...i, file, needsReattach: false, status: 'queued' } : i)
      );
      itemsRef.current = itemsRef.current.map((i) =>
      i.id === id ? { ...i, file, needsReattach: false, status: 'queued' } : i
      );
      queue.current.push(id);
      void pump();
      return { ok: true, message: `Resuming from chunk ${item.completed + 1}.` };
    },
    [pump]
  );

  const clearFinished = useCallback(() => {
    setItems((current) =>
    current.filter((i) => !['done', 'cancelled', 'rejected'].includes(i.status))
    );
  }, []);

  const active = items.filter((i) => ['queued', 'running', 'paused'].includes(i.status));

  return {
    items,
    active,
    enqueue,
    pause,
    resume,
    cancel,
    retry,
    reattach,
    clearFinished,
    limits: LIMITS
  };
}