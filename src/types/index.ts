/**
 * Canopy domain model.
 *
 * One product, two client surfaces (desktop-density and touch-density).
 * Every record below is really persisted in IndexedDB and every key material
 * field is really produced by WebCrypto — nothing here is decorative.
 */

export interface SealedBlob {
  /** base64 AES-GCM initialisation vector (96-bit, unique per operation). */
  iv: string;
  /** base64 ciphertext. */
  ct: string;
}

export interface VaultMeta {
  id: 'vault';
  schema: number;
  createdAt: number;
  labName: string;
  orgDomain: string;
  ownerPersonId: string;
  /** base64 PBKDF2 salt, 16 random bytes. */
  kdfSalt: string;
  kdfIterations: number;
  /** Decrypts to a known plaintext only when the passphrase is correct. */
  verifier: SealedBlob;
  defaultGrantTtlHours: number;
  autoLockMinutes: number;
  maxBatchFiles: number;
  maxFileBytes: number;
  demoSeeded: boolean;
}

export type AssetKind = 'document' | 'dataset' | 'image' | 'archive' | 'other';
export type Sensitivity = 'internal' | 'restricted' | 'embargoed';
export type AssetStatus = 'sealing' | 'sealed' | 'failed';

export interface Asset {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: AssetKind;
  /** Merkle root: SHA-256 over the concatenated per-chunk SHA-256 digests. */
  root: string;
  chunkSize: number;
  chunkCount: number;
  createdAt: number;
  updatedAt: number;
  project: string;
  sensitivity: Sensitivity;
  /** Content key wrapped under the vault master key. */
  wrappedKey: SealedBlob;
  status: AssetStatus;
  ownerId: string;
  /** Optimistic-concurrency token; every mutation must carry the read value. */
  rev: number;
}

export interface ChunkRecord {
  assetId: string;
  index: number;
  iv: string;
  digest: string;
  bytes: number;
  data: ArrayBuffer;
}

export type GrantMode = 'protected' | 'released';
export type GrantStatus = 'active' | 'revoked' | 'expired' | 'exhausted';

export interface GrantPermissions {
  view: boolean;
  annotate: boolean;
  /** Allows producing a sealed .canopy container (protected) or a plain copy (released). */
  export: boolean;
}

export interface Grant {
  /** SHA-256(token), base64url. The raw token is never stored anywhere. */
  id: string;
  assetId: string;
  recipientId: string;
  label: string;
  createdAt: number;
  createdBy: string;
  expiresAt: number | null;
  maxOpens: number | null;
  opens: number;
  lastOpenedAt: number | null;
  mode: GrantMode;
  permissions: GrantPermissions;
  requireTerms: boolean;
  terms: string;
  termsHash: string | null;
  acceptedAt: number | null;
  status: GrantStatus;
  revokedAt: number | null;
  revokedReason: string | null;
  /**
   * Content key re-wrapped under a key derived from the link token itself.
   * Deleting this field is what actually revokes the link: without it the
   * token can no longer reconstruct the content key. Revocation is
   * cryptographic, not a boolean the client could ignore.
   */
  wrappedKey: (SealedBlob & {salt: string;}) | null;
  watermarkSeed: string;
  /** Set on first open; later opens from other devices are refused. */
  boundDeviceId: string | null;
  bindDevice: boolean;
  extensionRequest: {at: number;note: string;} | null;
  rev: number;
}

export type PersonRole = 'pi' | 'postgrad' | 'assistant' | 'collaborator' | 'external';
export type PersonStatus = 'active' | 'departing' | 'offboarded';

export interface Person {
  id: string;
  name: string;
  email: string;
  affiliation: string;
  role: PersonRole;
  internal: boolean;
  status: PersonStatus;
  departureAt: number | null;
  createdAt: number;
  rev: number;
}

export type EventType =
'vault.created' |
'vault.unlocked' |
'vault.locked' |
'vault.unlock_failed' |
'asset.sealed' |
'asset.opened' |
'asset.exported' |
'asset.deleted' |
'asset.integrity_failed' |
'grant.created' |
'grant.revoked' |
'grant.expired' |
'grant.opened' |
'grant.denied' |
'grant.terms_accepted' |
'grant.terms_declined' |
'grant.extension_requested' |
'grant.extended' |
'person.added' |
'person.updated' |
'person.offboarded' |
'capture.attempt' |
'container.opened' |
'container.refused' |
'sync.replicated';

export interface LedgerEvent {
  seq: number;
  ts: number;
  type: EventType;
  actorId: string;
  actorLabel: string;
  deviceId: string;
  deviceLabel: string;
  assetId: string | null;
  grantId: string | null;
  detail: Record<string, string | number | boolean | null>;
  /** Hash of the previous entry; makes the log tamper-evident. */
  prevHash: string;
  hash: string;
}

export type RuleId =
'bulk_egress' |
'departure_surge' |
'external_recipient' |
'unrecognised_device' |
'revoked_retry' |
'off_hours' |
'capture_pressure' |
'integrity_failure' |
'dormant_access';

export type Severity = 'low' | 'medium' | 'high';

export interface Signal {
  id: string;
  rule: RuleId;
  severity: Severity;
  title: string;
  summary: string;
  firstAt: number;
  lastAt: number;
  subjectId: string;
  subjectLabel: string;
  evidence: number[];
  assetIds: string[];
  grantIds: string[];
  action:
  {kind: 'revoke_grants';label: string;grantIds: string[];} |
  {kind: 'offboard_person';label: string;personId: string;} |
  {kind: 'review';label: string;};
}

export interface SignalAck {
  id: string;
  ackedAt: number;
  note: string;
}

export type TransferKind = 'ingest' | 'egress';
export type TransferStatus =
'queued' |
'running' |
'paused' |
'error' |
'done' |
'cancelled';

export interface Transfer {
  id: string;
  kind: TransferKind;
  assetId: string;
  name: string;
  size: number;
  chunkSize: number;
  chunkCount: number;
  /** Chunks completed. Progress survives pause, error and app restart. */
  completed: number;
  status: TransferStatus;
  error: string | null;
  startedAt: number;
  updatedAt: number;
}

export interface DeviceRecord {
  id: string;
  label: string;
  platform: string;
  form: 'desktop' | 'mobile';
  firstSeen: number;
  lastSeen: number;
  trusted: boolean;
}

export interface OutboxOp {
  id: string;
  kind: 'replicate';
  /** Serialisable payload; replayed in order once a peer is reachable. */
  payload: {store: string;recordId: string;};
  attempts: number;
  nextAttemptAt: number;
  createdAt: number;
  lastError: string | null;
}

export interface AccessDecision {
  ok: boolean;
  reason:
  'ok' |
  'not_found' |
  'revoked' |
  'expired' |
  'exhausted' |
  'device_bound' |
  'terms_required' |
  'key_missing' |
  'integrity';
  message: string;
}