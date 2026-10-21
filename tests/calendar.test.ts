import { describe, expect, it } from 'vitest';
import ics from './fixtures/google.ics?raw';
import type { CalEvent } from '../src/model/types';
import { findJoinUrl, parseIcs } from '../src/lib/ics';
import { groupByDay, nextEvent, relativeTime, timeRange } from '../src/lib/agenda';

// Tests run in America/New_York (vite.config.ts), so Tokyo times shift by 13 hours.

const events = parseIcs(ics, 'src1', new Date(2026, 9, 12), new Date(2026, 9, 29));
const byTitle = (t: string) => events.filter((e) => e.title === t);

describe('parseIcs', () => {
  it('converts time zones to real instants', () => {
    const [lab] = byTitle('Lab meeting');
    expect(lab.start).toBe('2026-10-21T01:00:00.000Z'); // 10:00 JST
    expect(new Date(lab.start).getHours()).toBe(21); // 9 PM the evening before, in New York
    expect(lab).toMatchObject({ sourceId: 'src1', location: 'Room 4', allDay: false });
  });

  it('expands repeats, honouring skipped dates and moved occurrences', () => {
    const gym = events.filter((e) => e.id.startsWith('gym@test'));
    expect(gym.map((e) => [e.title, e.start])).toEqual([
      ['Gym', '2026-10-12T23:00:00.000Z'],
      ['Gym (moved)', '2026-10-27T23:00:00.000Z'],
    ]);
  });

  it('keeps all-day events as calendar dates and drops cancelled or out-of-range ones', () => {
    expect(byTitle('Conference')).toEqual([
      expect.objectContaining({ allDay: true, start: '2026-10-22', end: '2026-10-25' }),
    ]);
    expect(byTitle('Cancelled thing')).toEqual([]);
    expect(byTitle('Far future')).toEqual([]);
  });

  it('finds Meet, Zoom and Teams join links and ignores everything else', () => {
    expect(byTitle('Lab meeting')[0].joinUrl).toBe('https://meet.google.com/abc-defg-hij');
    expect(byTitle('Standup')[0].joinUrl).toBe('https://meet.google.com/xyz-abcd-efg');
    expect(byTitle('Interview')[0].joinUrl).toBe('https://us02web.zoom.us/j/123456?pwd=abc');
    expect(byTitle('Reading group')[0].joinUrl).toBeUndefined(); // docs link + insecure http
    expect(findJoinUrl('https://teams.microsoft.com/l/meetup-join/x.')).toBe('https://teams.microsoft.com/l/meetup-join/x');
    expect(findJoinUrl('https://meet.google.com.evil.example/x')).toBeUndefined();
  });

  it('returns events in start order', () => {
    const starts = events.map((e) => (e.allDay ? new Date(`${e.start}T00:00`).getTime() : Date.parse(e.start)));
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });
});

const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).toISOString();
const ev = (id: string, start: string, end: string, allDay = false): CalEvent => ({
  id,
  sourceId: 's',
  title: id,
  start,
  end,
  allDay,
});

describe('agenda', () => {
  const now = new Date(2026, 9, 21, 1, 0); // 1 AM, Wed Oct 21
  const list = [
    ev('late-yesterday', local(20, 23), local(21, 0, 30)), // ended at 00:30
    ev('night-owl', local(21, 0, 30), local(21, 2)), // happening now
    ev('standup', local(21, 9), local(21, 9, 30)),
    ev('conference', '2026-10-22', '2026-10-25', true),
  ];

  it('groups by calendar date: at 1 AM, "Today" is the new date', () => {
    const groups = groupByDay(list, now, 7);
    expect(groups.map((g) => g.label).slice(0, 2)).toEqual(['Today', 'Tomorrow']);
    expect(groups[0].day).toBe('2026-10-21');
    expect(groups[0].events.map((e) => e.id)).toEqual(['night-owl', 'standup']);
  });

  it('puts multi-day all-day events on each day they cover', () => {
    const groups = groupByDay(list, now, 7);
    expect(groups.filter((g) => g.events.some((e) => e.id === 'conference')).map((g) => g.day)).toEqual([
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
    ]);
  });

  it('reports the ongoing event, else the next timed one, never all-day ones', () => {
    expect(nextEvent(list, now)).toEqual({ event: list[1], now: true });
    expect(nextEvent(list, new Date(2026, 9, 21, 3))).toEqual({ event: list[2], now: false });
    expect(nextEvent([list[3]], now)).toBeNull();
  });

  it('formats times and distances', () => {
    expect(timeRange(list[2], '2026-10-21', false)).toBe('9 AM–9:30 AM');
    expect(timeRange(list[2], '2026-10-21', true)).toBe('09:00–09:30');
    expect(timeRange(list[0], '2026-10-21', false)).toBe('Until 12:30 AM');
    expect(timeRange(list[3], '2026-10-22', false)).toBe('All day');
    expect(relativeTime(25 * 60_000)).toBe('in 25 min');
    expect(relativeTime(3 * 3_600_000)).toBe('in 3 h');
    expect(relativeTime(50 * 3_600_000)).toBe('in 2 days');
  });
});
