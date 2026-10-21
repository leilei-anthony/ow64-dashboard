import ICAL from 'ical.js';
import type { CalEvent } from '../model/types';

// Turns an iCalendar feed (Google's "secret address in iCal format") into the
// event occurrences that overlap [from, to). Loaded lazily: only pages with a
// calendar connected ever download ical.js.

const MEETING_HOST = /(^|\.)(meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com)$/i;
const URL_RE = /https:\/\/[^\s<>"'()]+/g;
const MAX_OCCURRENCES = 20_000; // safety bound for very old daily repeats

/** First https meeting link (Meet, Zoom, Teams) found in the given texts. */
export function findJoinUrl(...texts: (string | null | undefined)[]): string | undefined {
  for (const text of texts) {
    if (!text) continue;
    for (const match of text.matchAll(URL_RE)) {
      try {
        const url = new URL(match[0].replace(/[.,;:!?]+$/, ''));
        if (url.protocol === 'https:' && MEETING_HOST.test(url.hostname)) return url.toString();
      } catch {
        // not a URL; keep looking
      }
    }
  }
  return undefined;
}

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (t: ICAL.Time) => `${t.year}-${pad(t.month)}-${pad(t.day)}`;
/** All-day dates are floating: they mean that calendar date wherever you are. */
const localMidnight = (t: ICAL.Time) => new Date(t.year, t.month - 1, t.day).getTime();

export function parseIcs(text: string, sourceId: string, from: Date, to: Date): CalEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(tz);

  const masters = new Map<string, ICAL.Event>();
  const exceptions: ICAL.Component[] = [];
  for (const comp of root.getAllSubcomponents('vevent')) {
    if (comp.hasProperty('recurrence-id')) exceptions.push(comp);
    else masters.set(String(comp.getFirstPropertyValue('uid')), new ICAL.Event(comp));
  }
  const orphans: ICAL.Event[] = [];
  for (const comp of exceptions) {
    const master = masters.get(String(comp.getFirstPropertyValue('uid')));
    if (master) master.relateException(comp);
    else orphans.push(new ICAL.Event(comp)); // e.g. invited to a single instance only
  }

  const fromMs = from.getTime();
  const toMs = to.getTime();
  const out: CalEvent[] = [];

  const add = (item: ICAL.Event, start: ICAL.Time, end: ICAL.Time) => {
    if (String(item.component.getFirstPropertyValue('status') ?? '').toUpperCase() === 'CANCELLED') return;
    const allDay = start.isDate;
    const startMs = allDay ? localMidnight(start) : start.toJSDate().getTime();
    let endMs = allDay ? localMidnight(end) : end.toJSDate().getTime();
    if (endMs <= startMs) endMs = allDay ? startMs + 86_400_000 : startMs; // missing/odd DTEND
    if ((startMs < fromMs && endMs <= fromMs) || startMs >= toMs) return;
    const startText = allDay ? dateKey(start) : new Date(startMs).toISOString();
    const endText = allDay ? (end.compare(start) > 0 ? dateKey(end) : nextDay(start)) : new Date(endMs).toISOString();
    const conference = item.component.getFirstPropertyValue('x-google-conference');
    const location = item.location?.trim();
    const joinUrl = findJoinUrl(typeof conference === 'string' ? conference : undefined, location, item.description);
    out.push({
      id: `${item.uid}|${startText}`,
      sourceId,
      title: item.summary?.trim() || '(No title)',
      start: startText,
      end: endText,
      allDay,
      ...(location ? { location } : {}),
      ...(joinUrl ? { joinUrl } : {}),
    });
  };

  for (const event of masters.values()) {
    if (!event.isRecurring()) {
      add(event, event.startDate, event.endDate);
      continue;
    }
    const it = event.iterator();
    let next: ICAL.Time | null;
    for (let n = 0; n < MAX_OCCURRENCES && (next = it.next()); n++) {
      const details = event.getOccurrenceDetails(next);
      const startMs = details.startDate.isDate ? localMidnight(details.startDate) : details.startDate.toJSDate().getTime();
      // A moved occurrence can land later than its original slot, so look a little past `to`.
      if (startMs >= toMs + 31 * 86_400_000) break;
      add(details.item, details.startDate, details.endDate);
    }
  }
  for (const event of orphans) add(event, event.startDate, event.endDate);

  return out.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

function nextDay(t: ICAL.Time): string {
  const d = new Date(t.year, t.month - 1, t.day + 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const sortKey = (e: CalEvent) => (e.allDay ? `${e.start}T00:00:00.000` : localIso(e.start));

function localIso(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.001`;
}
