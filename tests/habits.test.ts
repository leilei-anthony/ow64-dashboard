import { describe, expect, it } from 'vitest';
import type { Habit, HabitLog } from '../src/model/types';
import { daySummary, groupByTime, habitStreak, habitsMetOn, isDoneOn, isDue, isMet, weekProgress } from '../src/lib/habits';
import { dayRange } from '../src/lib/dates';

// 2026-10-19 is a Monday. Weeks start on Monday (1) unless stated.
const habit = (over: Partial<Habit> = {}): Habit => ({
  id: 'h',
  name: 'Make bed',
  kind: 'check',
  schedule: { kind: 'daily' },
  time: 'morning',
  createdAt: '2026-10-01',
  ...over,
});
const log = (days: string[], value = 1, id = 'h'): HabitLog => Object.fromEntries(days.map((d) => [d, { [id]: value }]));

describe('met and scheduled', () => {
  it('check, count and avoid habits', () => {
    expect(isMet(habit(), log(['2026-10-20']), '2026-10-20')).toBe(true);
    const water = habit({ kind: 'count', target: 8 });
    expect(isMet(water, log(['2026-10-20'], 5), '2026-10-20')).toBe(false);
    expect(isMet(water, log(['2026-10-20'], 8), '2026-10-20')).toBe(true);
    const phone = habit({ kind: 'avoid' });
    expect(isMet(phone, {}, '2026-10-20')).toBe(true);
    expect(isMet(phone, log(['2026-10-20']), '2026-10-20')).toBe(false);
  });

  it('only shows a specific-days habit on its days, and nothing before it was created or after archiving', () => {
    const gym = habit({ schedule: { kind: 'days', days: [1, 3, 5] } }); // Mon, Wed, Fri
    expect(isDue(gym, '2026-10-19')).toBe(true);
    expect(isDue(gym, '2026-10-20')).toBe(false);
    expect(isDue(habit({ createdAt: '2026-10-21' }), '2026-10-20')).toBe(false);
    expect(isDue(habit({ archivedAt: '2026-10-20' }), '2026-10-20')).toBe(false);
    expect(isDue(habit({ archivedAt: '2026-10-20' }), '2026-10-19')).toBe(true);
  });
});

describe('streaks', () => {
  it('daily: days in a row, and today in progress doesn’t break it', () => {
    const h = habit();
    expect(habitStreak(h, log(dayRange('2026-10-15', '2026-10-20')), '2026-10-20', 1)).toBe(6);
    expect(habitStreak(h, log(dayRange('2026-10-15', '2026-10-19')), '2026-10-20', 1)).toBe(5);
    expect(habitStreak(h, log(['2026-10-15', '2026-10-16', '2026-10-18', '2026-10-19']), '2026-10-20', 1)).toBe(2);
  });

  it('specific days: days off are skipped, not counted as misses', () => {
    const gym = habit({ schedule: { kind: 'days', days: [1, 3, 5] } });
    // Mon 12, Wed 14, Fri 16, Mon 19 → 4 in a row, viewed on Tue 20 (a day off).
    expect(habitStreak(gym, log(['2026-10-12', '2026-10-14', '2026-10-16', '2026-10-19']), '2026-10-20', 1)).toBe(4);
    // Missed Wed 14 → only Fri 16 and Mon 19 count.
    expect(habitStreak(gym, log(['2026-10-12', '2026-10-16', '2026-10-19']), '2026-10-20', 1)).toBe(2);
  });

  it('never counts days before the habit was created', () => {
    const h = habit({ createdAt: '2026-10-18' });
    expect(habitStreak(h, log(dayRange('2026-10-10', '2026-10-20')), '2026-10-20', 1)).toBe(3);
  });

  it('count habits need the full target', () => {
    const water = habit({ kind: 'count', target: 8 });
    const l = { ...log(['2026-10-18', '2026-10-19'], 8), ...log(['2026-10-17'], 7) };
    expect(habitStreak(water, l, '2026-10-20', 1)).toBe(2);
  });

  it('avoid: clean days in a row including today, reset by a slip', () => {
    const phone = habit({ kind: 'avoid', createdAt: '2026-10-10' });
    expect(habitStreak(phone, {}, '2026-10-20', 1)).toBe(11); // 10th..20th
    expect(habitStreak(phone, log(['2026-10-16']), '2026-10-20', 1)).toBe(4); // 17..20
    expect(habitStreak(phone, log(['2026-10-20']), '2026-10-20', 1)).toBe(0); // slipped today
  });

  it('N× a week: weeks in a row, with the current week not breaking it', () => {
    const gym = habit({ schedule: { kind: 'weekly', times: 3 }, createdAt: '2026-09-28' });
    // Week of Oct 5: 3 ✓ · week of Oct 12: 3 ✓ · this week (Oct 19): 1 so far.
    const l = log(['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12', '2026-10-13', '2026-10-15', '2026-10-19']);
    expect(habitStreak(gym, l, '2026-10-20', 1)).toBe(2);
    expect(weekProgress(gym, l, '2026-10-20', 1)).toEqual({ count: 1, target: 3, met: false });
    // Two more this week → the current week counts too.
    const more = { ...l, ...log(['2026-10-20', '2026-10-21']) };
    expect(habitStreak(gym, more, '2026-10-21', 1)).toBe(3);
    expect(isDoneOn(gym, more, '2026-10-23', 1)).toBe(true); // "done for the week" on Friday
  });
});

describe('the day’s list', () => {
  const habits = [
    habit({ id: 'bed' }),
    habit({ id: 'water', kind: 'count', target: 8, time: 'anytime' }),
    habit({ id: 'gym', schedule: { kind: 'days', days: [1, 3, 5] }, time: 'anytime' }),
    habit({ id: 'phone', kind: 'avoid', time: 'evening' }),
  ];
  const l: HabitLog = { '2026-10-20': { bed: 1, water: 3 } };

  it('summarises what is due and done', () => {
    // Tuesday: gym isn't due. Done: bed, phone (clean). Not done: water.
    expect(daySummary(habits, l, '2026-10-20', 1)).toEqual({ done: 2, total: 3 });
  });

  it('groups by time of day, keeping order', () => {
    const g = groupByTime(habits);
    expect(g.morning.map((h) => h.id)).toEqual(['bed']);
    expect(g.anytime.map((h) => h.id)).toEqual(['water', 'gym']);
    expect(g.evening.map((h) => h.id)).toEqual(['phone']);
  });

  it('heatmap counts habits you did (avoid habits need no action, so they’re left out)', () => {
    expect(habitsMetOn(habits, { '2026-10-20': { bed: 1, water: 8 } }, '2026-10-20').map((h) => h.id)).toEqual(['bed', 'water']);
  });
});
