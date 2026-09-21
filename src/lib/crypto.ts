/**
 * Real WebCrypto. No hand-rolled primitives, no simulated encryption.
 *
 * Key hierarchy
 *   passphrase --PBKDF2(SHA-256, 250k)--> masterKey (AES-GCM 256)
 *   masterKey  --wraps-->                 contentKey (AES-GCM 256, one per asset)
 *   contentKey --encrypts-->              each 1 MiB chunk with a unique IV
 *   linkToken  --HKDF(SHA-256)-->         grantKey, which re-wraps contentKey
 *
 * Because a share link's decryption capability is a copy of contentKey wrapped
 * under a key derived from that link's own token, deleting the wrapped copy
 * genuinely revokes the link. Revocation is not a flag the client may ignore.
 */

const subtle = globalThis.crypto?.subtle;

export const KDF_ITERATIONS = 250_000;
export const CHUNK_SIZE = 1024 * 1024; // 1 MiB

export function cryptoAvailable(): boolean {
  return Boolean(subtle && globalThis.crypto?.getRandomValues);
}

function requireSubtle(): SubtleCrypto {
  if (!subtle) {
    throw new Error(
      'WebCrypto is unavailable. Canopy refuses to run without real encryption.'
    );
  }
  return subtle;
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  globalThis.crypto.getRandomValues(out);
  return out;
}

/* ------------------------------------------------------------------ codecs */

export function toBase64(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function toBase64Url(input: ArrayBuffer | Uint8Array): string {
  return toBase64(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  return fromBase64(padded + '='.repeat((4 - padded.length % 4) % 4));
}

export function toHex(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let out = '';
  for (let i = 0; i < bytes.length; i += 1) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

/* ------------------------------------------------------------------ digest */

export async function sha256(data: BufferSource): Promise<ArrayBuffer> {
  return requireSubtle().digest('SHA-256', data);
}

export async function sha256Hex(data: BufferSource): Promise<string> {
  return toHex(await sha256(data));
}

export async function sha256B64Url(data: BufferSource): Promise<string> {
  return toBase64Url(await sha256(data));
}

export async function sha256Text(text: string): Promise<string> {
  return sha256Hex(new TextEncoder().encode(text));
}

/**
 * Merkle-style root over per-chunk digests. Lets us fingerprint files of any
 * size without ever holding the whole plaintext in memory.
 */
export async function rootFromChunkDigests(hexDigests: string[]): Promise<string> {
  const joined = new TextEncoder().encode(hexDigests.join(''));
  return sha256Hex(joined);
}

/* --------------------------------------------------------------- key deriv */

export async function deriveMasterKey(
passphrase: string,
salt: Uint8Array,
iterations = KDF_ITERATIONS)
: Promise<CryptoKey> {
  const s = requireSubtle();
  const base = await s.importKey(
    'raw',
    new TextEncoder().encode(passphrase.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  return s.deriveKey(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Derives a link's wrapping key from the raw token bytes. */
export async function deriveGrantKey(
tokenBytes: Uint8Array,
salt: Uint8Array)
: Promise<CryptoKey> {
  const s = requireSubtle();
  try {
    const base = await s.importKey('raw', tokenBytes as BufferSource, 'HKDF', false, [
    'deriveKey']
    );
    return await s.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: salt as BufferSource,
        info: new TextEncoder().encode('canopy/grant/v1')
      },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  } catch {
    // Some engines ship WebCrypto without HKDF. PBKDF2 over a 256-bit random
    // token is an acceptable substitute; the token already has full entropy.
    const base = await s.importKey('raw', tokenBytes as BufferSource, 'PBKDF2', false, [
    'deriveKey']
    );
    return s.deriveKey(
      { name: 'PBKDF2', salt: salt as BufferSource, iterations: 120_000, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }
}

export async function generateContentKey(): Promise<CryptoKey> {
  return requireSubtle().generateKey({ name: 'AES-GCM', length: 256 }, true, [
  'encrypt',
  'decrypt']
  );
}

/* ------------------------------------------------------------ seal / unseal */

export interface Sealed {
  iv: string;
  ct: string;
}

export async function seal(key: CryptoKey, plaintext: BufferSource): Promise<Sealed> {
  const iv = randomBytes(12);
  const ct = await requireSubtle().encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    plaintext
  );
  return { iv: toBase64(iv), ct: toBase64(ct) };
}

export async function unseal(key: CryptoKey, sealed: Sealed): Promise<ArrayBuffer> {
  return requireSubtle().decrypt(
    { name: 'AES-GCM', iv: fromBase64(sealed.iv) as BufferSource },
    key,
    fromBase64(sealed.ct) as BufferSource
  );
}

export async function wrapContentKey(
wrappingKey: CryptoKey,
contentKey: CryptoKey)
: Promise<Sealed> {
  const raw = await requireSubtle().exportKey('raw', contentKey);
  return seal(wrappingKey, raw);
}

export async function unwrapContentKey(
wrappingKey: CryptoKey,
sealed: Sealed)
: Promise<CryptoKey> {
  const raw = await unseal(wrappingKey, sealed);
  return requireSubtle().importKey('raw', raw, { name: 'AES-GCM' }, true, [
  'encrypt',
  'decrypt']
  );
}

export async function encryptChunk(
key: CryptoKey,
bytes: Uint8Array)
: Promise<{iv: string;data: ArrayBuffer;}> {
  const iv = randomBytes(12);
  const data = await requireSubtle().encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    key,
    bytes as BufferSource
  );
  return { iv: toBase64(iv), data };
}

export async function decryptChunk(
key: CryptoKey,
iv: string,
data: ArrayBuffer)
: Promise<ArrayBuffer> {
  return requireSubtle().decrypt(
    { name: 'AES-GCM', iv: fromBase64(iv) as BufferSource },
    key,
    data
  );
}

/* ---------------------------------------------------------------- identity */

/** 256-bit capability token. Shown to the sharer once, never persisted. */
export function newLinkToken(): {token: string;bytes: Uint8Array;} {
  const bytes = randomBytes(32);
  return { token: toBase64Url(bytes), bytes };
}

export async function tokenToGrantId(token: string): Promise<string> {
  return sha256B64Url(fromBase64Url(token) as BufferSource);
}

export function newId(prefix: string): string {
  return `${prefix}_${toBase64Url(randomBytes(9))}`;
}

/** Short, human-readable fingerprint used in watermarks and audit rows. */
export function shortPrint(value: string, groups = 3): string {
  const cleaned = value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const out: string[] = [];
  for (let i = 0; i < groups; i += 1) out.push(cleaned.slice(i * 4, i * 4 + 4));
  return out.filter(Boolean).join('-');
}

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}