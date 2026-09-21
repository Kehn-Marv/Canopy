/**
 * Leak-pattern detection.
 *
 * These rules run over the real, hash-chained event ledger. Nothing here is
 * scored by a model — they are explicit, inspectable heuristics, each with an
 * evidence list pointing at the exact ledger entries that triggered it, and
 * each with a recommended action the owner can execute in one click.
 *
 * Known weaknesses (stated in the UI, not hidden):
 *  - They only see what happens inside Canopy. A photograph of a screen is
 *    invisible to them.
 *  - Thresholds are fixed; a patient attacker who stays below them is missed.
 *  - "Off hours" is wrong for genuinely nocturnal lab work and will produce
 *    false positives, which is why it is ranked low and never auto-acts.
 */

import { emailDomain } from './format';
import type {
  Asset,
  DeviceRecord,
  Grant,
  LedgerEvent,
  Person,
  Signal } from
'../types';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const ACCESS_TYPES = new Set(['asset.opened', 'asset.exported', 'grant.opened', 'container.opened']);

export interface DetectionInput {
  events: LedgerEvent[];
  grants: Grant[];
  people: Person[];
  assets: Asset[];
  devices: DeviceRecord[];
  orgDomain: string;
  /** The vault holder. Their own reading is not a leak signal. */
  ownerId: string;
  now: number;
}

export interface RuleDoc {
  id: string;
  name: string;
  what: string;
  blindSpot: string;
}

export const RULE_DOCS: RuleDoc[] = [
{
  id: 'bulk_egress',
  name: 'Bulk egress burst',
  what: 'One person touches five or more distinct items inside thirty minutes.',
  blindSpot: 'A steady drip of one file a day stays under it.'
},
{
  id: 'departure_surge',
  name: 'Departure surge',
  what: 'Heavy access by someone whose departure date is inside 45 days.',
  blindSpot: 'Only works if the departure date was actually entered.'
},
{
  id: 'external_recipient',
  name: 'Outside-domain release',
  what: 'A releasable or exportable grant pointing at a non-institutional address.',
  blindSpot: 'A personal address that also gets institutional mail looks external either way.'
},
{
  id: 'unrecognised_device',
  name: 'Unrecognised device',
  what: 'A link opened from a device this vault has never seen.',
  blindSpot: 'Clearing site data makes a known device look new.'
},
{
  id: 'revoked_retry',
  name: 'Retry after revocation',
  what: 'Repeated attempts to use a link that was already withdrawn.',
  blindSpot: 'Often just a confused collaborator, not an attacker.'
},
{
  id: 'off_hours',
  name: 'Off-hours access',
  what: 'Access between midnight and 05:00 local time.',
  blindSpot: 'Lab work genuinely happens at night. Ranked low for that reason.'
},
{
  id: 'capture_pressure',
  name: 'Capture pressure',
  what: 'Print-screen, print or copy attempts inside the protected viewer.',
  blindSpot: 'A phone camera pointed at the screen produces no event at all.'
},
{
  id: 'integrity_failure',
  name: 'Integrity failure',
  what: 'Stored ciphertext no longer matches its recorded digest.',
  blindSpot: 'Cannot tell disk corruption from deliberate tampering.'
},
{
  id: 'dormant_access',
  name: 'Dormant access',
  what: 'A live grant with no expiry that has not been used in 30 days.',
  blindSpot: 'Seasonal collaborators will be flagged every dry spell.'
}];


function label(people: Person[], actorId: string, fallback: string): string {
  return people.find((p) => p.id === actorId)?.name ?? fallback;
}

export function computeSignals(input: DetectionInput): Signal[] {
  const { events, grants, people, devices, orgDomain, ownerId, now } = input;
  const signals: Signal[] = [];
  const recent = events.filter((e) => now - e.ts <= 90 * DAY);

  /* ---------------------------------------------- 1. bulk egress bursts */
  const byActor = new Map<string, LedgerEvent[]>();
  for (const e of recent) {
    if (!ACCESS_TYPES.has(e.type) || e.actorId === ownerId) continue;
    const list = byActor.get(e.actorId) ?? [];
    list.push(e);
    byActor.set(e.actorId, list);
  }
  for (const [actorId, list] of byActor) {
    const sorted = [...list].sort((a, b) => a.ts - b.ts);
    let best: {window: LedgerEvent[];assets: Set<string>;} | null = null;
    let left = 0;
    for (let right = 0; right < sorted.length; right += 1) {
      while (sorted[right].ts - sorted[left].ts > 30 * MINUTE) left += 1;
      const window = sorted.slice(left, right + 1);
      const assetIds = new Set(window.map((e) => e.assetId).filter(Boolean) as string[]);
      if (assetIds.size >= 5 && (!best || assetIds.size > best.assets.size)) {
        best = { window, assets: assetIds };
      }
    }
    if (best) {
      const actorGrants = grants.
      filter((g) => g.recipientId === actorId && g.status === 'active').
      map((g) => g.id);
      signals.push({
        id: `bulk_egress:${actorId}:${best.window[0].seq}`,
        rule: 'bulk_egress',
        severity: best.assets.size >= 8 ? 'high' : 'medium',
        title: `${label(people, actorId, best.window[0].actorLabel)} pulled ${best.assets.size} items in half an hour`,
        summary:
        'A burst this wide is unusual for reading work. It matches the pattern of someone taking a copy of a project rather than consulting it.',
        firstAt: best.window[0].ts,
        lastAt: best.window[best.window.length - 1].ts,
        subjectId: actorId,
        subjectLabel: label(people, actorId, best.window[0].actorLabel),
        evidence: best.window.map((e) => e.seq),
        assetIds: [...best.assets],
        grantIds: actorGrants,
        action: actorGrants.length ?
        { kind: 'revoke_grants', label: `Revoke ${actorGrants.length} live link(s)`, grantIds: actorGrants } :
        { kind: 'review', label: 'Review activity' }
      });
    }
  }

  /* -------------------------------------------- 2. departure-window surge */
  for (const person of people) {
    if (person.status !== 'departing' || person.departureAt === null) continue;
    const untilDeparture = person.departureAt - now;
    if (untilDeparture > 45 * DAY) continue;
    const window = recent.filter(
      (e) => e.actorId === person.id && ACCESS_TYPES.has(e.type) && now - e.ts <= 14 * DAY
    );
    if (window.length < 3) continue;
    const personGrants = grants.filter((g) => g.recipientId === person.id && g.status === 'active');
    signals.push({
      id: `departure_surge:${person.id}`,
      rule: 'departure_surge',
      severity: 'high',
      title: `${person.name} is leaving soon and access is climbing`,
      summary: `${window.length} accesses in the last fortnight, with a departure date ${untilDeparture > 0 ? 'in' : 'passed'} ${Math.abs(Math.round(untilDeparture / DAY))} days. This is the pattern that costs labs their unpublished work.`,
      firstAt: Math.min(...window.map((e) => e.ts)),
      lastAt: Math.max(...window.map((e) => e.ts)),
      subjectId: person.id,
      subjectLabel: person.name,
      evidence: window.map((e) => e.seq),
      assetIds: [...new Set(window.map((e) => e.assetId).filter(Boolean) as string[])],
      grantIds: personGrants.map((g) => g.id),
      action: { kind: 'offboard_person', label: `Offboard ${person.name}`, personId: person.id }
    });
  }

  /* ------------------------------------------ 3. release outside the org */
  for (const grant of grants) {
    if (grant.status !== 'active') continue;
    const recipient = people.find((p) => p.id === grant.recipientId);
    if (!recipient) continue;
    const domain = emailDomain(recipient.email);
    const outside = Boolean(orgDomain) && domain !== orgDomain.toLowerCase();
    const leaky = grant.mode === 'released' || grant.permissions.export;
    if (!outside || !leaky) continue;
    signals.push({
      id: `external_recipient:${grant.id}`,
      rule: 'external_recipient',
      severity: grant.mode === 'released' ? 'medium' : 'low',
      title: `Exportable access held outside ${orgDomain}`,
      summary: `${recipient.name} (${domain}) can take a copy away. Collaboration across institutions is expected — this is a ledger entry to keep, not a reason to block.`,
      firstAt: grant.createdAt,
      lastAt: grant.lastOpenedAt ?? grant.createdAt,
      subjectId: recipient.id,
      subjectLabel: recipient.name,
      evidence: recent.filter((e) => e.grantId === grant.id).map((e) => e.seq),
      assetIds: [grant.assetId],
      grantIds: [grant.id],
      action: { kind: 'review', label: 'Review sharing terms' }
    });
  }

  /* ----------------------------------------------- 4. unrecognised device */
  const knownDeviceIds = new Set(devices.map((d) => d.id));
  const unknownOpens = recent.filter(
    (e) => e.type === 'grant.opened' && !knownDeviceIds.has(e.deviceId)
  );
  const byDevice = new Map<string, LedgerEvent[]>();
  for (const e of unknownOpens) {
    const list = byDevice.get(e.deviceId) ?? [];
    list.push(e);
    byDevice.set(e.deviceId, list);
  }
  for (const [deviceId, list] of byDevice) {
    signals.push({
      id: `unrecognised_device:${deviceId}`,
      rule: 'unrecognised_device',
      severity: 'medium',
      title: `Link opened from a device this vault has not seen before`,
      summary: `${list.length} opening(s) from "${list[0].deviceLabel}". Expected when a collaborator installs Canopy; worth a question if the person says it was not them.`,
      firstAt: Math.min(...list.map((e) => e.ts)),
      lastAt: Math.max(...list.map((e) => e.ts)),
      subjectId: list[0].actorId,
      subjectLabel: list[0].actorLabel,
      evidence: list.map((e) => e.seq),
      assetIds: [...new Set(list.map((e) => e.assetId).filter(Boolean) as string[])],
      grantIds: [...new Set(list.map((e) => e.grantId).filter(Boolean) as string[])],
      action: { kind: 'review', label: 'Confirm with collaborator' }
    });
  }

  /* --------------------------------------------- 5. retry after revocation */
  const denials = recent.filter((e) => e.type === 'grant.denied' || e.type === 'container.refused');
  const byGrant = new Map<string, LedgerEvent[]>();
  for (const e of denials) {
    const key = e.grantId ?? `unknown:${e.deviceId}`;
    const list = byGrant.get(key) ?? [];
    list.push(e);
    byGrant.set(key, list);
  }
  for (const [key, list] of byGrant) {
    if (list.length < 2) continue;
    signals.push({
      id: `revoked_retry:${key}`,
      rule: 'revoked_retry',
      severity: list.length >= 5 ? 'high' : 'medium',
      title: `${list.length} attempts to use access that is already closed`,
      summary:
      'Repeated refusals mean the material is still being reached for after it was withdrawn. Confirm the person understands access ended, and check whether a copy is circulating.',
      firstAt: Math.min(...list.map((e) => e.ts)),
      lastAt: Math.max(...list.map((e) => e.ts)),
      subjectId: list[0].actorId,
      subjectLabel: list[0].actorLabel,
      evidence: list.map((e) => e.seq),
      assetIds: [...new Set(list.map((e) => e.assetId).filter(Boolean) as string[])],
      grantIds: list[0].grantId ? [list[0].grantId] : [],
      action: { kind: 'review', label: 'Investigate attempts' }
    });
  }

  /* ---------------------------------------------------- 6. off-hours reads */
  const offHours = recent.filter((e) => {
    if (!ACCESS_TYPES.has(e.type) || e.actorId === ownerId) return false;
    const hour = new Date(e.ts).getHours();
    return hour >= 0 && hour < 5;
  });
  const offByActor = new Map<string, LedgerEvent[]>();
  for (const e of offHours) {
    const list = offByActor.get(e.actorId) ?? [];
    list.push(e);
    offByActor.set(e.actorId, list);
  }
  for (const [actorId, list] of offByActor) {
    if (list.length < 3) continue;
    signals.push({
      id: `off_hours:${actorId}`,
      rule: 'off_hours',
      severity: 'low',
      title: `${label(people, actorId, list[0].actorLabel)} is reading between midnight and 05:00`,
      summary:
      'Low confidence on purpose: real lab work happens at night. Useful only alongside another signal.',
      firstAt: Math.min(...list.map((e) => e.ts)),
      lastAt: Math.max(...list.map((e) => e.ts)),
      subjectId: actorId,
      subjectLabel: label(people, actorId, list[0].actorLabel),
      evidence: list.map((e) => e.seq),
      assetIds: [...new Set(list.map((e) => e.assetId).filter(Boolean) as string[])],
      grantIds: [],
      action: { kind: 'review', label: 'Note and watch' }
    });
  }

  /* -------------------------------------------------- 7. capture pressure */
  const captures = recent.filter((e) => e.type === 'capture.attempt');
  const capByActor = new Map<string, LedgerEvent[]>();
  for (const e of captures) {
    const list = capByActor.get(e.actorId) ?? [];
    list.push(e);
    capByActor.set(e.actorId, list);
  }
  for (const [actorId, list] of capByActor) {
    signals.push({
      id: `capture_pressure:${actorId}`,
      rule: 'capture_pressure',
      severity: list.length >= 3 ? 'high' : 'medium',
      title: `${list.length} screen-capture attempt(s) in the protected viewer`,
      summary:
      'Canopy blanks the viewer and logs the attempt. It cannot stop a camera pointed at the screen, so treat this as intent, not as a blocked leak.',
      firstAt: Math.min(...list.map((e) => e.ts)),
      lastAt: Math.max(...list.map((e) => e.ts)),
      subjectId: actorId,
      subjectLabel: label(people, actorId, list[0].actorLabel),
      evidence: list.map((e) => e.seq),
      assetIds: [...new Set(list.map((e) => e.assetId).filter(Boolean) as string[])],
      grantIds: [...new Set(list.map((e) => e.grantId).filter(Boolean) as string[])],
      action: { kind: 'review', label: 'Review viewer activity' }
    });
  }

  /* ------------------------------------------------- 8. integrity failures */
  const integrity = recent.filter((e) => e.type === 'asset.integrity_failed');
  for (const e of integrity) {
    signals.push({
      id: `integrity_failure:${e.seq}`,
      rule: 'integrity_failure',
      severity: 'high',
      title: 'Stored ciphertext no longer matches its digest',
      summary:
      'The chunk digests for this item do not reproduce its recorded root. Either the local store is damaged or something wrote to it outside Canopy.',
      firstAt: e.ts,
      lastAt: e.ts,
      subjectId: e.actorId,
      subjectLabel: e.actorLabel,
      evidence: [e.seq],
      assetIds: e.assetId ? [e.assetId] : [],
      grantIds: [],
      action: { kind: 'review', label: 'Inspect item' }
    });
  }

  /* ---------------------------------------------------- 9. dormant access */
  for (const grant of grants) {
    if (grant.status !== 'active' || grant.expiresAt !== null) continue;
    const last = grant.lastOpenedAt ?? grant.createdAt;
    if (now - last < 30 * DAY) continue;
    const recipient = people.find((p) => p.id === grant.recipientId);
    signals.push({
      id: `dormant_access:${grant.id}`,
      rule: 'dormant_access',
      severity: 'low',
      title: `${recipient?.name ?? 'A collaborator'} still holds never-expiring access nobody has used`,
      summary:
      'This is how permissions rot. Closing it costs nothing — the holder can ask for it back in one tap.',
      firstAt: grant.createdAt,
      lastAt: last,
      subjectId: grant.recipientId,
      subjectLabel: recipient?.name ?? grant.label,
      evidence: [],
      assetIds: [grant.assetId],
      grantIds: [grant.id],
      action: { kind: 'revoke_grants', label: 'Close this access', grantIds: [grant.id] }
    });
  }

  const order: Record<Signal['severity'], number> = { high: 0, medium: 1, low: 2 };
  return signals.sort((a, b) => order[a.severity] - order[b.severity] || b.lastAt - a.lastAt);
}