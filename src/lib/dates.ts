import type { DayKey } from '../model/types';

// Day-key arithmetic runs in UTC so daylight-saving shifts can never skip or
// repeat a day. Only `logicalDay` looks at the local clock.

const DAY_MS = 86_400_000;
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n: number) => String(n).padStart(2, '0');

export function isDayKey(value: unknown): value is DayKey {
  if (typeof value !== 'string' || !DAY_KEY_RE.test(value)) return false;
  return toUtc(value).toISOString().slice(0, 10) === value;
}

function toUtc(key: DayKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): DayKey {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** The tracking day for a moment in local time: before `dayStartHour` it's still yesterday. */
export function logicalDay(now: Date, dayStartHour: number): DayKey {
  const local = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (now.getHours() < dayStartHour) local.setDate(local.getDate() - 1);
  return `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`;
}

export function addDays(key: DayKey, n: number): DayKey {
  const date = toUtc(key);
  date.setUTCDate(date.getUTCDate() + n);
  return fromUtc(date);
}

export function daysBetween(from: DayKey, to: DayKey): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function dayOfWeek(key: DayKey): number {
  return toUtc(key).getUTCDay();
}

export function weekStart(key: DayKey, weekStartsOn: number): DayKey {
  return addDays(key, -((dayOfWeek(key) - weekStartsOn + 7) % 7));
}

export const monthKey = (key: DayKey) => key.slice(0, 7);
export const yearOf = (key: DayKey) => Number(key.slice(0, 4));

export function monthStart(key: DayKey): DayKey {
  return `${monthKey(key)}-01`;
}

export function monthEnd(key: DayKey): DayKey {
  const date = toUtc(monthStart(key));
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return fromUtc(date);
}

/** Inclusive list of day keys from `from` to `to`. */
export function dayRange(from: DayKey, to: DayKey): DayKey[] {
  const out: DayKey[] = [];
  for (let k = from; k <= to; k = addDays(k, 1)) out.push(k);
  return out;
}

export function formatDay(key: DayKey, options: Intl.DateTimeFormatOptions): string {
  return toUtc(key).toLocaleDateString(undefined, { ...options, timeZone: 'UTC' });
}

export const shortDate = (key: DayKey) =>
  formatDay(key, { weekday: 'short', month: 'short', day: 'numeric' });

export const longDate = (key: DayKey) =>
  formatDay(key, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

export const monthShort = (key: DayKey) => formatDay(key, { month: 'short' });
