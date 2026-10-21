import { computed, signal } from '@preact/signals';
import type { CalendarCache, CalendarSource, CalEvent } from '../model/types';
import { uid } from '../model/ids';
import { chromeApi } from '../lib/ext';
import { calendarCache, calendarSources, flush, setCalendarCache, setCalendarSources } from './store';

// Google Calendar, read through each calendar's "secret address in iCal format".
// The only network access in the extension, and only to calendar.google.com
// once you've granted that permission by adding a calendar.

const ORIGIN = 'https://calendar.google.com/*';
const STALE_MS = 15 * 60_000;
const TIMEOUT_MS = 15_000;
export const WINDOW_DAYS = 7;

export const refreshing = signal(false);

/** Enabled calendars' cached events, merged. */
export const calendarEvents = computed<CalEvent[]>(() => {
  const cache = calendarCache.value.sources;
  return calendarSources.value.filter((s) => s.enabled).flatMap((s) => cache[s.id]?.events ?? []);
});

/** Accepts the secret iCal address (or the same link as webcal://). */
export function cleanIcsUrl(raw: string): string | null {
  const text = raw.trim().replace(/^webcal:\/\//i, 'https://');
  try {
    const url = new URL(text);
    const ok = url.protocol === 'https:' && url.hostname === 'calendar.google.com' && url.pathname.startsWith('/calendar/ical/') && url.pathname.endsWith('.ics');
    return ok ? url.toString() : null;
  } catch {
    return null;
  }
}

// ---- Permission ------------------------------------------------------------

const permissions = () => chromeApi?.permissions;

function dropPermission() {
  permissions()
    ?.remove({ origins: [ORIGIN] })
    .catch(() => {}); // e.g. a build where the permission is required rather than optional
}

async function hasPermission(): Promise<boolean> {
  return permissions() ? permissions()!.contains({ origins: [ORIGIN] }) : true;
}

/** Must be the first await in a click handler: browsers only show the prompt during a user gesture. */
function requestPermission(): Promise<boolean> {
  return permissions() ? permissions()!.request({ origins: [ORIGIN] }) : Promise.resolve(true);
}

// ---- Fetch & parse -----------------------------------------------------------

function windowFromNow(): [Date, Date] {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return [from, new Date(from.getFullYear(), from.getMonth(), from.getDate() + WINDOW_DAYS)];
}

async function fetchEvents(source: Pick<CalendarSource, 'id' | 'url'>): Promise<CalEvent[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let text: string;
  try {
    const res = await fetch(source.url, { signal: controller.signal, cache: 'no-store', credentials: 'omit' });
    if (res.status === 404 || res.status === 403) {
      throw new Error(
        new URL(source.url).pathname.includes('/public/')
          ? 'That’s the calendar’s public address, which only works for public calendars. Copy the “Secret address in iCal format” instead; it has “private-” in it.'
          : 'Google doesn’t recognize this link. It may have been reset; copy it again.',
      );
    }
    if (!res.ok) throw new Error(`Google Calendar returned an error (${res.status}).`);
    text = await res.text();
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new Error('Google Calendar took too long to answer.');
    if (err instanceof TypeError) throw new Error('Couldn’t reach Google Calendar. Are you offline?');
    throw err;
  } finally {
    clearTimeout(timer);
  }
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('That link didn’t return a calendar.');
  const { parseIcs } = await import('../lib/ics'); // ical.js loads only when a calendar is used
  const [from, to] = windowFromNow();
  return parseIcs(text, source.id, from, to);
}

/**
 * Refresh every enabled calendar. Skips if the last attempt (from any tab) was
 * under 15 minutes ago, unless forced. A failure keeps that calendar's old events.
 */
export async function refreshCalendars(force = false): Promise<void> {
  const sources = calendarSources.value.filter((s) => s.enabled);
  if (!sources.length || refreshing.value) return;
  const checked = Date.parse(calendarCache.value.checkedAt ?? '');
  if (!force && Date.now() - checked < STALE_MS) return;

  refreshing.value = true;
  // Claim this refresh right away so other open tabs don't fetch the same thing.
  setCalendarCache({ ...calendarCache.value, checkedAt: new Date().toISOString() });
  void flush();
  try {
    const allowed = await hasPermission();
    const results = await Promise.allSettled(
      sources.map((s) => (allowed ? fetchEvents(s) : Promise.reject(new Error('Calendar access was turned off. Add the calendar again in Settings.')))),
    );
    const prev = calendarCache.value.sources;
    const next: CalendarCache['sources'] = {};
    const at = new Date().toISOString();
    for (const source of calendarSources.value) {
      const i = sources.indexOf(source);
      const r = i >= 0 ? results[i] : undefined;
      if (!r) {
        if (prev[source.id]) next[source.id] = prev[source.id]; // disabled: keep what we had
      } else if (r.status === 'fulfilled') {
        next[source.id] = { fetchedAt: at, events: r.value };
      } else {
        next[source.id] = { ...prev[source.id], events: prev[source.id]?.events ?? [], error: (r.reason as Error).message };
      }
    }
    setCalendarCache({ checkedAt: at, sources: next });
  } finally {
    refreshing.value = false;
  }
}

// ---- Managing calendars ----------------------------------------------------

export type AddResult = { ok: true; count: number } | { ok: false; error: string };

/** Ask for access, test the link, then save it. Call straight from a click. */
export async function addCalendar(name: string, rawUrl: string, color: string): Promise<AddResult> {
  const url = cleanIcsUrl(rawUrl);
  if (!url) {
    return { ok: false, error: 'Paste the “Secret address in iCal format” (it starts with https://calendar.google.com/calendar/ical/ and ends in .ics).' };
  }
  if (calendarSources.value.some((s) => s.url === url)) return { ok: false, error: 'That calendar is already added.' };
  if (!(await requestPermission())) return { ok: false, error: 'Access to calendar.google.com wasn’t allowed, so the calendar can’t be read.' };

  const source: CalendarSource = { id: uid(), name: name.trim() || 'Calendar', url, color, enabled: true };
  let events: CalEvent[];
  try {
    events = await fetchEvents(source);
  } catch (err) {
    if (!calendarSources.value.length) dropPermission();
    return { ok: false, error: (err as Error).message };
  }
  setCalendarSources([...calendarSources.value, source]);
  setCalendarCache({
    ...calendarCache.value,
    sources: { ...calendarCache.value.sources, [source.id]: { fetchedAt: new Date().toISOString(), events } },
  });
  return { ok: true, count: events.length };
}

export function updateCalendar(id: string, patch: Partial<Pick<CalendarSource, 'name' | 'color' | 'enabled'>>) {
  setCalendarSources(calendarSources.value.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  if (patch.enabled) void refreshCalendars(true);
}

/** Removing the last calendar also gives back the calendar.google.com permission. */
export function removeCalendar(id: string) {
  const rest = calendarSources.value.filter((s) => s.id !== id);
  setCalendarSources(rest);
  const { [id]: _drop, ...sources } = calendarCache.value.sources;
  setCalendarCache({ ...calendarCache.value, sources });
  if (!rest.length) dropPermission();
}

/** Refresh on load, when a tab comes back into view, and every 15 minutes while open. */
export function startCalendarSync() {
  void refreshCalendars();
  setInterval(() => void refreshCalendars(), 60_000); // cheap: it only fetches once stale
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refreshCalendars();
  });
}
