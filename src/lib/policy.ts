/**
 * Grant policy evaluation — the single place that decides whether a link may
 * open. Both the recipient route and the sealed-container opener call this,
 * so there is exactly one enforcement path to reason about.
 */

import type { AccessDecision, Grant, GrantStatus } from '../types';

export interface EffectiveGrant {
  status: GrantStatus;
  expiresInMs: number | null;
  opensLeft: number | null;
}

export function effectiveStatus(grant: Grant, now = Date.now()): EffectiveGrant {
  const expiresInMs = grant.expiresAt === null ? null : grant.expiresAt - now;
  const opensLeft = grant.maxOpens === null ? null : Math.max(0, grant.maxOpens - grant.opens);

  let status: GrantStatus = grant.status;
  if (status === 'active') {
    if (grant.wrappedKey === null) status = 'revoked';else
    if (expiresInMs !== null && expiresInMs <= 0) status = 'expired';else
    if (opensLeft !== null && opensLeft <= 0) status = 'exhausted';
  }
  return { status, expiresInMs, opensLeft };
}

export function evaluateAccess(
grant: Grant | undefined,
deviceId: string,
now = Date.now())
: AccessDecision {
  if (!grant) {
    return {
      ok: false,
      reason: 'not_found',
      message: 'This link does not match anything in this vault.'
    };
  }
  const { status } = effectiveStatus(grant, now);
  if (status === 'revoked') {
    return {
      ok: false,
      reason: 'revoked',
      message: grant.revokedReason ?
      `Access was withdrawn: ${grant.revokedReason}` :
      'Access to this material was withdrawn by the owner.'
    };
  }
  if (status === 'expired') {
    return {
      ok: false,
      reason: 'expired',
      message: 'This access window has closed. You can ask the owner to reopen it.'
    };
  }
  if (status === 'exhausted') {
    return {
      ok: false,
      reason: 'exhausted',
      message: 'The number of permitted openings has been used up.'
    };
  }
  if (grant.bindDevice && grant.boundDeviceId && grant.boundDeviceId !== deviceId) {
    return {
      ok: false,
      reason: 'device_bound',
      message: 'This link is locked to the first device that opened it.'
    };
  }
  if (grant.wrappedKey === null) {
    return {
      ok: false,
      reason: 'key_missing',
      message: 'The decryption capability for this link is gone. It cannot be restored.'
    };
  }
  if (grant.requireTerms && grant.acceptedAt === null) {
    return {
      ok: false,
      reason: 'terms_required',
      message: 'You must accept the sharing terms before the material will open.'
    };
  }
  return { ok: true, reason: 'ok', message: 'Access permitted.' };
}

export const STATUS_TONE: Record<GrantStatus, 'ok' | 'warn' | 'danger' | 'muted'> = {
  active: 'ok',
  revoked: 'danger',
  expired: 'muted',
  exhausted: 'warn'
};

export const DEFAULT_TERMS = `This material is shared for the stated collaborative purpose only.

1. You will not redistribute, republish or forward this material, in whole or in part, to anyone outside the named collaboration.
2. You will not use it to file, support or contest any patent application without the owner's written agreement.
3. You will cite the originating laboratory in any work derived from it.
4. You will delete any released copy once the stated purpose is complete, or when the owner withdraws access.
5. Every opening of this material is recorded against your name in the owner's audit ledger.`;

export function ttlOptions(): {label: string;hours: number | null;}[] {
  return [
  { label: '4 hours', hours: 4 },
  { label: '24 hours', hours: 24 },
  { label: '7 days', hours: 24 * 7 },
  { label: '30 days', hours: 24 * 30 },
  { label: '90 days', hours: 24 * 90 },
  { label: 'No expiry', hours: null }];

}