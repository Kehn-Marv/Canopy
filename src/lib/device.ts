/**
 * Stable per-installation device identity.
 *
 * This is an application-level identifier, not a hardware fingerprint: it is
 * random, stored locally, and cleared when the user clears site data. That
 * limitation is stated plainly in Settings rather than papered over.
 */

import { newId } from './crypto';
import { STORES, get, put } from './db';
import type { DeviceRecord } from '../types';

const DEVICE_KEY = 'canopy.device.id';
const LABEL_KEY = 'canopy.device.label';

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {

    /* storage blocked — identity becomes session-scoped, which we tolerate */}
}

export function detectForm(): 'desktop' | 'mobile' {
  if (typeof window === 'undefined') return 'desktop';
  const coarse = window.matchMedia?.('(pointer: coarse)').matches;
  const narrow = window.innerWidth < 900;
  return coarse && narrow ? 'mobile' : 'desktop';
}

export function detectPlatform(): string {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS';
  if (/Windows NT/i.test(ua)) return 'Windows';
  if (/Mac OS X/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return 'Unknown platform';
}

export function defaultLabel(): string {
  const platform = detectPlatform();
  const form = detectForm() === 'mobile' ? 'handset' : 'workstation';
  return `${platform} ${form}`;
}

let cached: DeviceRecord | null = null;

export function deviceIdSync(): string {
  const existing = readStorage(DEVICE_KEY);
  if (existing) return existing;
  const created = newId('dev');
  writeStorage(DEVICE_KEY, created);
  return created;
}

export async function currentDevice(): Promise<DeviceRecord> {
  if (cached) return cached;
  const id = deviceIdSync();
  const stored = await get<DeviceRecord>(STORES.devices, id);
  const label = readStorage(LABEL_KEY) ?? stored?.label ?? defaultLabel();
  const record: DeviceRecord = {
    id,
    label,
    platform: detectPlatform(),
    form: detectForm(),
    firstSeen: stored?.firstSeen ?? Date.now(),
    lastSeen: Date.now(),
    trusted: stored?.trusted ?? true
  };
  await put(STORES.devices, record);
  cached = record;
  return record;
}

export async function renameDevice(label: string): Promise<DeviceRecord> {
  const device = await currentDevice();
  const next = { ...device, label: label.trim() || defaultLabel() };
  writeStorage(LABEL_KEY, next.label);
  await put(STORES.devices, next);
  cached = next;
  return next;
}

export async function touchDevice(): Promise<void> {
  const device = await currentDevice();
  const next = { ...device, lastSeen: Date.now() };
  await put(STORES.devices, next);
  cached = next;
}