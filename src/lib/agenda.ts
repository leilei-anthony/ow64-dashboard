import type { CalEvent, DayKey } from '../model/types';
import { addDays, shortDate } from './dates';

// Calendar events are grouped by real calendar date (midnight to midnight),
// not by the dashboard's 4 AM tracking day: an event at 1 AM is "today".

const pad = (n: number) => String(n).padStart(2, '0');

export function localDayKey(d: Date): DayKey {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const midnight = (day: DayKey) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
};

/** Start/end of an event in epoch ms (all-day events span local midnights). */
export function eventSpan(e: CalEvent): [number, number] {
  return e.allDay ? [midnight(e.start), midnight(e.end)] : [Date.parse(e.start), Date.parse(e.end)];
}

export const isOngoing = (e: CalEvent, now: Date) => {
  const [s, end] = eventSpan(e);
  return !e.allDay && s <= now.getTime() && now.getTime() < end;
};

export interface DayGroup {
  day: DayKey;
  label: string;
  events: CalEvent[];
}

/**
 * `days` calendar dates starting today. Each event appears on every date it
 * overlaps; timed events that already ended are left out. All-day first, then by start.
 */
export function groupByDay(events: CalEvent[], now: Date, days: number): DayGroup[] {
  const today = localDayKey(now);
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(today, i);
    const dayStart = midnight(day);
    const dayEnd = midnight(addDays(day, 1));
    const list = events
      .filter((e) => {
        const [s, end] = eventSpan(e);
        if (!e.allDay && end <= now.getTime() && end > s) return false;
        return s < dayEnd && (end > dayStart || (end === s && s >= dayStart));
      })
      .sort((a, b) => Number(b.allDay) - Number(a.allDay) || eventSpan(a)[0] - eventSpan(b)[0]);
    return { day, label: dayLabel(day, today), events: list };
  });
}

export function dayLabel(day: DayKey, today: DayKey): string {
  if (day === today) return 'Today';
  if (day === addDays(today, 1)) return 'Tomorrow';
  return shortDate(day);
}

/** The event happening now (earliest to end), else the next timed event. All-day events are skipped. */
export function nextEvent(events: CalEvent[], now: Date): { event: CalEvent; now: boolean } | null {
  const t = now.getTime();
  const timed = events.filter((e) => !e.allDay);
  const ongoing = timed.filter((e) => isOngoing(e, now)).sort((a, b) => eventSpan(a)[1] - eventSpan(b)[1]);
  if (ongoing.length) return { event: ongoing[0], now: true };
  const upcoming = timed.filter((e) => eventSpan(e)[0] > t).sort((a, b) => eventSpan(a)[0] - eventSpan(b)[0]);
  return upcoming.length ? { event: upcoming[0], now: false } : null;
}

export function formatTime(iso: string, h24: boolean): string {
  const d = new Date(iso);
  if (h24) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const h = d.getHours() % 12 || 12;
  const m = d.getMinutes() ? `:${pad(d.getMinutes())}` : '';
  return `${h}${m} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

/** "9 AM–9:30 AM", "All day", or "Until 10 AM" for an event that began on an earlier date. */
export function timeRange(e: CalEvent, day: DayKey, h24: boolean): string {
  if (e.allDay) return 'All day';
  const startsToday = localDayKey(new Date(e.start)) === day;
  const endsToday = localDayKey(new Date(e.end)) === day;
  if (!startsToday) return endsToday ? `Until ${formatTime(e.end, h24)}` : 'All day';
  return endsToday || e.end === e.start ? `${formatTime(e.start, h24)}–${formatTime(e.end, h24)}` : `${formatTime(e.start, h24)} →`;
}

/** "in 25 min", "in 3 h", "in 2 days". */
export function relativeTime(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `in ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `in ${h} h`;
  const d = Math.round(h / 24);
  return `in ${d} day${d === 1 ? '' : 's'}`;
}

/** The calendar date an event starts on (for tasks and countdowns made from it). */
export const eventDay = (e: CalEvent): DayKey => (e.allDay ? e.start : localDayKey(new Date(e.start)));

/** "just now", "5 min ago", "2 h ago", "3 days ago". */
export function agoText(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** Google Calendar's day view for a date (opens in a new tab; not a fetch). */
export function googleCalendarDayUrl(day: DayKey): string {
  const [y, m, d] = day.split('-');
  return `https://calendar.google.com/calendar/r/day/${y}/${Number(m)}/${Number(d)}`;
}
