/**
 * The .canopy sealed container.
 *
 * This is the honest version of the "file that knows where it is". A released
 * copy is a real, self-describing binary container:
 *
 *   magic "CANOPY01" | uint32 header length | JSON header | ciphertext chunks
 *
 * What it genuinely does
 *  - It is ciphertext on disk. Copying it to a flash drive or a WhatsApp group
 *    moves useless bytes.
 *  - It carries no key. Opening it requires the link token, which is separate.
 *  - When Canopy opens it, the grant is re-checked against the vault first, so
 *    a revoked or expired grant refuses the container and writes a refusal to
 *    the ledger.
 *  - Chunk digests and a root digest make tampering detectable.
 *
 * What it cannot do, and we say so in the UI
 *  - It cannot delete itself. No user-space file can, and any binary that
 *    tried would be malware.
 *  - It cannot phone home from inside another program. Only Canopy opening it
 *    produces a record.
 *  - Someone holding both the container and the token, permanently offline,
 *    can decrypt it forever. Revocation bites when the vault is reachable.
 */

import { fromBase64, sha256Hex, toBase64 } from './crypto';
import type { Asset, Grant } from '../types';

export const MAGIC = 'CANOPY01';
export const CONTAINER_EXT = '.canopy';

export interface ContainerHeader {
  v: 1;
  assetId: string;
  name: string;
  mime: string;
  size: number;
  root: string;
  chunkSize: number;
  chunkCount: number;
  chunks: {iv: string;digest: string;bytes: number;}[];
  grantId: string;
  /** Content key wrapped under the grant's own derived key. */
  wrappedKey: {iv: string;ct: string;salt: string;};
  issuedAt: number;
  issuerLabel: string;
  recipientLabel: string;
  termsHash: string | null;
  watermark: string;
  vaultHint: string;
}

export function buildContainer(header: ContainerHeader, chunks: ArrayBuffer[]): Blob {
  const headerJson = new TextEncoder().encode(JSON.stringify(header));
  const lengthPrefix = new Uint8Array(4);
  new DataView(lengthPrefix.buffer).setUint32(0, headerJson.byteLength, false);
  return new Blob([new TextEncoder().encode(MAGIC), lengthPrefix, headerJson, ...chunks], {
    type: 'application/vnd.canopy.sealed'
  });
}

export class ContainerFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContainerFormatError';
  }
}

export interface ParsedContainer {
  header: ContainerHeader;
  chunks: ArrayBuffer[];
}

export async function parseContainer(file: Blob): Promise<ParsedContainer> {
  if (file.size < MAGIC.length + 4) {
    throw new ContainerFormatError('This file is too small to be a sealed container.');
  }
  const head = new Uint8Array(await file.slice(0, MAGIC.length + 4).arrayBuffer());
  const magic = new TextDecoder().decode(head.subarray(0, MAGIC.length));
  if (magic !== MAGIC) {
    throw new ContainerFormatError(
      'Not a Canopy container. Sealed copies start with the CANOPY01 marker.'
    );
  }
  const headerLength = new DataView(head.buffer).getUint32(MAGIC.length, false);
  if (headerLength <= 0 || headerLength > 4_000_000) {
    throw new ContainerFormatError('The container header is missing or corrupted.');
  }
  const headerStart = MAGIC.length + 4;
  const headerBytes = await file.slice(headerStart, headerStart + headerLength).arrayBuffer();
  let header: ContainerHeader;
  try {
    header = JSON.parse(new TextDecoder().decode(headerBytes)) as ContainerHeader;
  } catch {
    throw new ContainerFormatError('The container header could not be read.');
  }
  if (header.v !== 1 || !Array.isArray(header.chunks)) {
    throw new ContainerFormatError('Unsupported container version.');
  }
  const chunks: ArrayBuffer[] = [];
  let offset = headerStart + headerLength;
  for (const meta of header.chunks) {
    const end = offset + meta.bytes;
    if (end > file.size) {
      throw new ContainerFormatError('The container is truncated — some chunks are missing.');
    }
    chunks.push(await file.slice(offset, end).arrayBuffer());
    offset = end;
  }
  return { header, chunks };
}

/** Recomputes the digest of every ciphertext chunk and the overall root. */
export async function verifyContainer(parsed: ParsedContainer): Promise<{
  ok: boolean;
  failedChunk: number | null;
}> {
  const digests: string[] = [];
  for (let i = 0; i < parsed.chunks.length; i += 1) {
    const digest = await sha256Hex(parsed.chunks[i]);
    if (digest !== parsed.header.chunks[i].digest) {
      return { ok: false, failedChunk: i };
    }
    digests.push(digest);
  }
  const root = await sha256Hex(new TextEncoder().encode(digests.join('')));
  return { ok: root === parsed.header.root, failedChunk: null };
}

export function containerFileName(asset: Asset, grant: Grant): string {
  const stem = asset.name.replace(/\.[^.]+$/, '');
  return `${stem}.${grant.id.slice(0, 6)}${CONTAINER_EXT}`;
}

/** Human-readable provenance block appended to released plaintext documents. */
export function provenanceFooter(opts: {
  labName: string;
  assetName: string;
  root: string;
  recipientLabel: string;
  grantId: string;
  issuedAt: number;
  termsHash: string | null;
}): string {
  return [
  '',
  '',
  '— — — — — — — — — — — — — — — — — — — — — — — — — — — —',
  `RELEASED COPY · ${opts.labName}`,
  `Item        : ${opts.assetName}`,
  `Digest      : sha256:${opts.root}`,
  `Released to : ${opts.recipientLabel}`,
  `Grant        : ${opts.grantId}`,
  `Released at : ${new Date(opts.issuedAt).toISOString()}`,
  opts.termsHash ? `Terms hash  : sha256:${opts.termsHash}` : 'Terms       : none recorded',
  'Redistribution outside the named collaboration is a breach of the accepted terms.',
  '— — — — — — — — — — — — — — — — — — — — — — — — — — — —'].
  join('\n');
}

export { fromBase64 as containerFromBase64, toBase64 as containerToBase64 };