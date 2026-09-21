/**
 * Grants, collaborators, and controlled release.
 *
 * A grant is a capability: the content key re-wrapped under a key derived from
 * that link's own 256-bit token. Revoking deletes the wrapped key, so the link
 * stops working because it can no longer produce a key — not because a flag
 * says so.
 */

import { toast } from 'sonner';
import {
  deriveGrantKey,
  fromBase64,
  fromBase64Url,
  newId,
  newLinkToken,
  randomBytes,
  sha256Text,
  toBase64,
  tokenToGrantId,
  unwrapContentKey,
  wrapContentKey } from
'./crypto';
import { STORES, casPut, get, getAll, getAllByIndex, put } from './db';
import { appendEvent } from './ledger';
import { effectiveStatus, evaluateAccess } from './policy';
import { buildContainer, containerFileName, provenanceFooter } from './container';
import { watermarkImage, watermarkText } from './watermark';
import { isValidEmail } from './format';
import { readCipherChunks } from './vault';
import { uploadToCloud } from './cloud';
import type {
  AccessDecision,
  Asset,
  Grant,
  GrantMode,
  GrantPermissions,
  Person,
  PersonRole,
  VaultMeta } from
'../types';
import type { Actor } from './vault';
import { ValidationError } from './vault';
import type { ChunkRecord } from '../types';

export function grantLink(token: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#/a/${token}`;
}

export async function listGrants(): Promise<Grant[]> {
  return (await getAll<Grant>(STORES.grants)).sort((a, b) => b.createdAt - a.createdAt);
}

export async function grantsForAsset(assetId: string): Promise<Grant[]> {
  return getAllByIndex<Grant>(STORES.grants, 'assetId', assetId);
}

export interface CreateGrantInput {
  asset: Asset;
  recipient: Person;
  masterKey: CryptoKey;
  actor: Actor;
  mode: GrantMode;
  permissions: GrantPermissions;
  ttlHours: number | null;
  maxOpens: number | null;
  requireTerms: boolean;
  terms: string;
  bindDevice: boolean;
  label: string;
}

export async function createGrant(
input: CreateGrantInput)
: Promise<{grant: Grant;token: string;link: string;}> {
  if (input.asset.status !== 'sealed') {
    throw new ValidationError('This item is still sealing. Wait for it to finish.');
  }
  if (!input.permissions.view) {
    throw new ValidationError('A link that cannot be viewed is not useful. Enable viewing.');
  }
  if (input.mode === 'released' && !input.requireTerms) {
    throw new ValidationError(
      'A released copy must carry terms. That record is the only leverage you keep.'
    );
  }
  if (input.maxOpens !== null && (input.maxOpens < 1 || input.maxOpens > 1000)) {
    throw new ValidationError('Opening limit must be between 1 and 1000.');
  }

  const { token, bytes } = newLinkToken();
  const id = await tokenToGrantId(token);
  const salt = randomBytes(16);
  const grantKey = await deriveGrantKey(bytes, salt);
  const contentKey = await unwrapContentKey(input.masterKey, input.asset.wrappedKey);
  const wrapped = await wrapContentKey(grantKey, contentKey);

  const grant: Grant = {
    id,
    assetId: input.asset.id,
    recipientId: input.recipient.id,
    label: input.label.trim() || input.asset.name,
    createdAt: Date.now(),
    createdBy: input.actor.actorId,
    expiresAt: input.ttlHours === null ? null : Date.now() + input.ttlHours * 3_600_000,
    maxOpens: input.maxOpens,
    opens: 0,
    lastOpenedAt: null,
    mode: input.mode,
    permissions: input.permissions,
    requireTerms: input.requireTerms,
    terms: input.requireTerms ? input.terms : '',
    termsHash: input.requireTerms ? await sha256Text(input.terms) : null,
    acceptedAt: null,
    status: 'active',
    revokedAt: null,
    revokedReason: null,
    wrappedKey: { ...wrapped, salt: toBase64(salt) },
    watermarkSeed: newId('wm').slice(3),
    boundDeviceId: null,
    bindDevice: input.bindDevice,
    extensionRequest: null,
    rev: 0
  };

  await put(STORES.grants, grant);
  await appendEvent({
    type: 'grant.created',
    actorId: input.actor.actorId,
    actorLabel: input.actor.actorLabel,
    deviceId: input.actor.deviceId,
    deviceLabel: input.actor.deviceLabel,
    assetId: input.asset.id,
    grantId: id,
    detail: {
      recipient: input.recipient.name,
      recipientEmail: input.recipient.email,
      mode: input.mode,
      expiresAt: grant.expiresAt,
      maxOpens: grant.maxOpens,
      exportable: input.permissions.export,
      deviceBound: input.bindDevice
    }
  });

  try {
    const chunks = await getAllByIndex<ChunkRecord>(STORES.chunks, 'assetId', input.asset.id);
    await uploadToCloud(input.asset, chunks, grant);
  } catch (err) {
    console.error('Failed to sync grant to cloud:', err);
    toast.error('Failed to upload share to cloud. Ensure Turso tables are created.');
  }

  return { grant, token, link: grantLink(token) };
}

export async function revokeGrant(
grantId: string,
reason: string,
actor: Actor)
: Promise<Grant> {
  const current = await get<Grant>(STORES.grants, grantId);
  if (!current) throw new ValidationError('That access no longer exists.');
  if (current.status === 'revoked') return current;
  const next = await casPut<Grant>(STORES.grants, grantId, current.rev, (g) => ({
    ...g,
    status: 'revoked',
    revokedAt: Date.now(),
    revokedReason: reason.trim() || 'Withdrawn by the owner',
    // Destroying the wrapped key is what actually ends access.
    wrappedKey: null
  }));
  await appendEvent({
    type: 'grant.revoked',
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    deviceId: actor.deviceId,
    deviceLabel: actor.deviceLabel,
    assetId: current.assetId,
    grantId,
    detail: { reason: next.revokedReason, opensBefore: current.opens }
  });
  return next;
}

export async function revokeMany(
grantIds: string[],
reason: string,
actor: Actor)
: Promise<{revoked: number;failed: number;}> {
  let revoked = 0;
  let failed = 0;
  for (const id of grantIds) {
    try {
      await revokeGrant(id, reason, actor);
      revoked += 1;
    } catch {
      failed += 1;
    }
  }
  return { revoked, failed };
}

export async function extendGrant(
grantId: string,
hours: number,
actor: Actor)
: Promise<Grant> {
  const current = await get<Grant>(STORES.grants, grantId);
  if (!current) throw new ValidationError('That access no longer exists.');
  if (current.wrappedKey === null) {
    throw new ValidationError(
      'This link was revoked. Its key is gone for good — issue a fresh link instead.'
    );
  }
  const base = Math.max(Date.now(), current.expiresAt ?? Date.now());
  const next = await casPut<Grant>(STORES.grants, grantId, current.rev, (g) => ({
    ...g,
    status: 'active',
    expiresAt: base + hours * 3_600_000,
    opens: g.maxOpens !== null && g.opens >= g.maxOpens ? 0 : g.opens,
    extensionRequest: null
  }));
  await appendEvent({
    type: 'grant.extended',
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    deviceId: actor.deviceId,
    deviceLabel: actor.deviceLabel,
    assetId: current.assetId,
    grantId,
    detail: { hours, newExpiry: next.expiresAt }
  });
  return next;
}

export async function requestExtension(
grantId: string,
note: string,
actor: Actor)
: Promise<void> {
  const current = await get<Grant>(STORES.grants, grantId);
  if (!current) throw new ValidationError('That access no longer exists.');
  if (current.extensionRequest) return;
  await casPut<Grant>(STORES.grants, grantId, current.rev, (g) => ({
    ...g,
    extensionRequest: { at: Date.now(), note: note.trim().slice(0, 280) }
  }));
  await appendEvent({
    type: 'grant.extension_requested',
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    deviceId: actor.deviceId,
    deviceLabel: actor.deviceLabel,
    assetId: current.assetId,
    grantId,
    detail: { note: note.trim().slice(0, 280) }
  });
}

/** Marks links whose window has closed, so the list reflects reality. */
export async function sweepExpired(actor: Actor): Promise<number> {
  const grants = await getAll<Grant>(STORES.grants);
  let swept = 0;
  for (const grant of grants) {
    if (grant.status !== 'active') continue;
    const { status } = effectiveStatus(grant);
    if (status === 'active') continue;
    try {
      await casPut<Grant>(STORES.grants, grant.id, grant.rev, (g) => ({ ...g, status }));
      await appendEvent({
        type: 'grant.expired',
        actorId: actor.actorId,
        actorLabel: 'System',
        deviceId: actor.deviceId,
        deviceLabel: actor.deviceLabel,
        assetId: grant.assetId,
        grantId: grant.id,
        detail: { status }
      });
      swept += 1;
    } catch {

      /* another window swept it first — that is fine */}
  }
  return swept;
}

/* ------------------------------------------------------- recipient access */

export interface OpenResult {
  decision: AccessDecision;
  grant?: Grant;
  asset?: Asset;
  contentKey?: CryptoKey;
}

import { fetchGrantFromCloud } from './cloud';

export async function inspectToken(token: string): Promise<{grant?: Grant;asset?: Asset;}> {
  let id: string;
  try {
    id = await tokenToGrantId(token);
  } catch {
    return {};
  }
  const grant = await get<Grant>(STORES.grants, id);
  if (!grant) {
    // Fall back to cloud fetch
    const remote = await fetchGrantFromCloud(id);
    if (!remote) return {};
    
    // Cache the remote asset and grant locally so local casPut operations don't fail
    await put(STORES.assets, remote.asset);
    await put(STORES.grants, remote.grant);
    
    return { grant: remote.grant, asset: remote.asset };
  }
  const asset = await get<Asset>(STORES.assets, grant.assetId);
  return { grant, asset };
}

export async function acceptTerms(token: string, actor: Actor): Promise<Grant> {
  const { grant } = await inspectToken(token);
  if (!grant) throw new ValidationError('This link is not recognised.');
  if (grant.acceptedAt) return grant;
  const next = await casPut<Grant>(STORES.grants, grant.id, grant.rev, (g) => ({
    ...g,
    acceptedAt: Date.now()
  }));
  await appendEvent({
    type: 'grant.terms_accepted',
    actorId: grant.recipientId,
    actorLabel: actor.actorLabel,
    deviceId: actor.deviceId,
    deviceLabel: actor.deviceLabel,
    assetId: grant.assetId,
    grantId: grant.id,
    detail: { termsHash: grant.termsHash }
  });
  return next;
}

export async function declineTerms(token: string, actor: Actor): Promise<void> {
  const { grant } = await inspectToken(token);
  if (!grant) return;
  await appendEvent({
    type: 'grant.terms_declined',
    actorId: grant.recipientId,
    actorLabel: actor.actorLabel,
    deviceId: actor.deviceId,
    deviceLabel: actor.deviceLabel,
    assetId: grant.assetId,
    grantId: grant.id,
    detail: { termsHash: grant.termsHash }
  });
}

/**
 * The only path by which a link turns into a usable key. Refusals are recorded
 * with the same weight as successes — a denial is evidence.
 */
export async function openWithToken(token: string, actor: Actor): Promise<OpenResult> {
  const { grant, asset } = await inspectToken(token);
  const decision = evaluateAccess(grant, actor.deviceId);
  if (!grant || !asset) {
    await appendEvent({
      type: 'grant.denied',
      actorId: actor.actorId,
      actorLabel: actor.actorLabel,
      deviceId: actor.deviceId,
      deviceLabel: actor.deviceLabel,
      detail: { reason: decision.reason }
    });
    return { decision };
  }
  if (!decision.ok) {
    if (decision.reason !== 'terms_required') {
      await appendEvent({
        type: 'grant.denied',
        actorId: grant.recipientId,
        actorLabel: actor.actorLabel,
        deviceId: actor.deviceId,
        deviceLabel: actor.deviceLabel,
        assetId: grant.assetId,
        grantId: grant.id,
        detail: { reason: decision.reason }
      });
    }
    return { decision, grant, asset };
  }

  let contentKey: CryptoKey;
  try {
    const wrapped = grant.wrappedKey!;
    const grantKey = await deriveGrantKey(fromBase64Url(token), fromBase64(wrapped.salt));
    contentKey = await unwrapContentKey(grantKey, { iv: wrapped.iv, ct: wrapped.ct });
  } catch {
    await appendEvent({
      type: 'grant.denied',
      actorId: grant.recipientId,
      actorLabel: actor.actorLabel,
      deviceId: actor.deviceId,
      deviceLabel: actor.deviceLabel,
      assetId: grant.assetId,
      grantId: grant.id,
      detail: { reason: 'key_unwrap_failed' }
    });
    return {
      decision: {
        ok: false,
        reason: 'key_missing',
        message: 'This link could not produce a valid key. It may have been altered.'
      },
      grant,
      asset
    };
  }

  const updated = await casPut<Grant>(STORES.grants, grant.id, grant.rev, (g) => ({
    ...g,
    opens: g.opens + 1,
    lastOpenedAt: Date.now(),
    boundDeviceId: g.bindDevice ? g.boundDeviceId ?? actor.deviceId : g.boundDeviceId
  }));
  await appendEvent({
    type: 'grant.opened',
    actorId: grant.recipientId,
    actorLabel: actor.actorLabel,
    deviceId: actor.deviceId,
    deviceLabel: actor.deviceLabel,
    assetId: grant.assetId,
    grantId: grant.id,
    detail: { opens: updated.opens, mode: grant.mode }
  });
  return { decision, grant: updated, asset, contentKey };
}

/* -------------------------------------------------------------- releasing */

export async function exportSealedContainer(
asset: Asset,
grant: Grant,
meta: VaultMeta,
recipient: Person,
actor: Actor)
: Promise<{blob: Blob;fileName: string;}> {
  if (!grant.permissions.export) {
    throw new ValidationError('This link does not permit taking a copy away.');
  }
  if (!grant.wrappedKey) {
    throw new ValidationError('Access was withdrawn. No copy can be produced.');
  }
  const chunks = await readCipherChunks(asset);
  if (chunks.length !== asset.chunkCount) {
    throw new ValidationError('Stored chunks are incomplete. Refusing to produce a partial copy.');
  }
  const blob = buildContainer(
    {
      v: 1,
      assetId: asset.id,
      name: asset.name,
      mime: asset.mime,
      size: asset.size,
      root: asset.root,
      chunkSize: asset.chunkSize,
      chunkCount: asset.chunkCount,
      chunks: chunks.map((c) => ({ iv: c.iv, digest: c.digest, bytes: c.bytes })),
      grantId: grant.id,
      wrappedKey: grant.wrappedKey,
      issuedAt: Date.now(),
      issuerLabel: meta.labName,
      recipientLabel: recipient.name,
      termsHash: grant.termsHash,
      watermark: watermarkText({
        recipientLabel: recipient.name,
        grantId: grant.id,
        seed: grant.watermarkSeed,
        openedAt: Date.now()
      }),
      vaultHint: meta.orgDomain
    },
    chunks.map((c) => c.data)
  );
  await appendEvent({
    type: 'asset.exported',
    actorId: grant.recipientId,
    actorLabel: actor.actorLabel,
    deviceId: actor.deviceId,
    deviceLabel: actor.deviceLabel,
    assetId: asset.id,
    grantId: grant.id,
    detail: { form: 'sealed container', bytes: blob.size }
  });
  return { blob, fileName: containerFileName(asset, grant) };
}

const TEXTUAL = /^(text\/|application\/(json|xml|csv|x-ndjson))/;

export async function exportReleasedCopy(
asset: Asset,
plaintext: Blob,
grant: Grant,
meta: VaultMeta,
recipient: Person,
actor: Actor)
: Promise<{blob: Blob;fileName: string;watermarked: boolean;}> {
  if (grant.mode !== 'released' || !grant.permissions.export) {
    throw new ValidationError('This link does not permit a plain copy.');
  }
  const identity = {
    recipientLabel: recipient.name,
    grantId: grant.id,
    seed: grant.watermarkSeed,
    openedAt: Date.now()
  };
  let blob = plaintext;
  let fileName = asset.name;
  let watermarked = false;

  if (TEXTUAL.test(asset.mime) || /\.(txt|md|csv|json|tsv)$/i.test(asset.name)) {
    const text = await plaintext.text();
    blob = new Blob(
      [
      text +
      provenanceFooter({
        labName: meta.labName,
        assetName: asset.name,
        root: asset.root,
        recipientLabel: recipient.name,
        grantId: grant.id,
        issuedAt: identity.openedAt,
        termsHash: grant.termsHash
      })],

      { type: asset.mime || 'text/plain' }
    );
    watermarked = true;
  } else if (asset.mime.startsWith('image/')) {
    try {
      blob = await watermarkImage(plaintext, identity);
      fileName = `${asset.name.replace(/\.[^.]+$/, '')}.watermarked.png`;
      watermarked = true;
    } catch {
      blob = plaintext;
      watermarked = false;
    }
  }

  await appendEvent({
    type: 'asset.exported',
    actorId: grant.recipientId,
    actorLabel: actor.actorLabel,
    deviceId: actor.deviceId,
    deviceLabel: actor.deviceLabel,
    assetId: asset.id,
    grantId: grant.id,
    detail: { form: 'released copy', watermarked, bytes: blob.size }
  });
  return { blob, fileName, watermarked };
}

/* ----------------------------------------------------------- collaborators */

export async function listPeople(): Promise<Person[]> {
  return (await getAll<Person>(STORES.people)).sort((a, b) => a.name.localeCompare(b.name));
}

export async function addPerson(
input: {
  name: string;
  email: string;
  affiliation: string;
  role: PersonRole;
  departureAt: number | null;
},
meta: VaultMeta,
actor: Actor)
: Promise<Person> {
  const email = input.email.trim().toLowerCase();
  if (!input.name.trim()) throw new ValidationError('A name is required.');
  if (!isValidEmail(email)) throw new ValidationError('That email address does not look valid.');
  const existing = (await listPeople()).find((p) => p.email === email);
  if (existing) throw new ValidationError(`${existing.name} already uses that address.`);

  const person: Person = {
    id: newId('per'),
    name: input.name.trim(),
    email,
    affiliation: input.affiliation.trim() || 'Unaffiliated',
    role: input.role,
    internal: Boolean(meta.orgDomain) && email.endsWith(`@${meta.orgDomain}`),
    status: input.departureAt ? 'departing' : 'active',
    departureAt: input.departureAt,
    createdAt: Date.now(),
    rev: 0
  };
  await put(STORES.people, person);
  await appendEvent({
    type: 'person.added',
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    deviceId: actor.deviceId,
    deviceLabel: actor.deviceLabel,
    detail: { name: person.name, email: person.email, role: person.role, internal: person.internal }
  });
  return person;
}

export async function updatePerson(
personId: string,
expectedRev: number,
patch: Partial<Pick<Person, 'name' | 'affiliation' | 'role' | 'departureAt' | 'status'>>,
actor: Actor)
: Promise<Person> {
  const next = await casPut<Person>(STORES.people, personId, expectedRev, (p) => ({
    ...p,
    ...patch,
    status: patch.departureAt !== undefined ?
    patch.departureAt ?
    'departing' :
    p.status === 'departing' ?
    'active' :
    p.status :
    patch.status ?? p.status
  }));
  await appendEvent({
    type: 'person.updated',
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    deviceId: actor.deviceId,
    deviceLabel: actor.deviceLabel,
    detail: { name: next.name, status: next.status, departureAt: next.departureAt }
  });
  return next;
}

/**
 * One action closes everything a leaver holds. This is the direct answer to
 * "students leave every year and nobody removes their access".
 */
export async function offboardPerson(
personId: string,
actor: Actor)
: Promise<{person: Person;revoked: number;}> {
  const person = await get<Person>(STORES.people, personId);
  if (!person) throw new ValidationError('That collaborator no longer exists.');
  const held = (await getAllByIndex<Grant>(STORES.grants, 'recipientId', personId)).filter(
    (g) => g.status === 'active'
  );
  const { revoked } = await revokeMany(
    held.map((g) => g.id),
    `Offboarded: ${person.name} left the collaboration`,
    actor
  );
  const next = await casPut<Person>(STORES.people, personId, person.rev, (p) => ({
    ...p,
    status: 'offboarded',
    departureAt: p.departureAt ?? Date.now()
  }));
  await appendEvent({
    type: 'person.offboarded',
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    deviceId: actor.deviceId,
    deviceLabel: actor.deviceLabel,
    detail: { name: person.name, grantsRevoked: revoked }
  });
  return { person: next, revoked };
}

export async function reinstatePerson(personId: string, actor: Actor): Promise<Person> {
  const person = await get<Person>(STORES.people, personId);
  if (!person) throw new ValidationError('That collaborator no longer exists.');
  const next = await casPut<Person>(STORES.people, personId, person.rev, (p) => ({
    ...p,
    status: 'active',
    departureAt: null
  }));
  await appendEvent({
    type: 'person.updated',
    actorId: actor.actorId,
    actorLabel: actor.actorLabel,
    deviceId: actor.deviceId,
    deviceLabel: actor.deviceLabel,
    detail: { name: next.name, status: 'active', note: 'reinstated (previous links stay revoked)' }
  });
  return next;
}