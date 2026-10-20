import { describe, expect, it } from 'vitest';
import { currentStreak } from '../src/lib/streaks';
import { dayRange } from '../src/lib/dates';
import { action, ticks } from './helpers';

const TODAY = '2026-10-14'; // Wednesday

describe('daily streaks', () => {
  const a = action({ kind: 'daily' });

  it('includes today when it is already done', () => {
    const logs = ticks('a1', dayRange('2026-10-10', TODAY));
    expect(currentStreak(a, logs, TODAY, 1)).toEqual({ value: 5, unit: 'day' });
  });

  it('does not break just because today is not done yet', () => {
    const logs = ticks('a1', dayRange('2026-10-10', '2026-10-13'));
    expect(currentStreak(a, logs, TODAY, 1)?.value).toBe(4);
  });

  it('stops at the first missed day', () => {
    const logs = ticks('a1', ['2026-10-08', '2026-10-09', '2026-10-11', '2026-10-12', '2026-10-13']);
    expect(currentStreak(a, logs, TODAY, 1)?.value).toBe(3);
  });

  it('is zero after a missed yesterday', () => {
    const logs = ticks('a1', ['2026-10-10', '2026-10-11']);
    expect(currentStreak(a, logs, TODAY, 1)?.value).toBe(0);
  });
});

describe('weekly streaks', () => {
  const a = action({ kind: 'weekly', times: 2 });

  it('counts consecutive weeks that met the target, skipping an unfinished current week', () => {
    // Weeks (Mon start): Sep 28, Oct 5 met; current week (Oct 12) has only 1 so far.
    const logs = ticks('a1', ['2026-09-28', '2026-10-01', '2026-10-05', '2026-10-09', '2026-10-13']);
    expect(currentStreak(a, logs, TODAY, 1)).toEqual({ value: 2, unit: 'week' });
  });

  it('includes the current week once its target is met', () => {
    const logs = ticks('a1', ['2026-10-05', '2026-10-09', '2026-10-12', '2026-10-13']);
    expect(currentStreak(a, logs, TODAY, 1)?.value).toBe(2);
  });

  it('breaks on a week below target', () => {
    const logs = ticks('a1', ['2026-09-28', '2026-10-01', '2026-10-06', '2026-10-12', '2026-10-13']);
    expect(currentStreak(a, logs, TODAY, 1)?.value).toBe(1);
  });
});

describe('monthly streaks', () => {
  it('counts consecutive months across a year boundary', () => {
    const a = action({ kind: 'monthly', times: 1 });
    const logs = ticks('a1', ['2025-11-03', '2025-12-20', '2026-01-02']);
    expect(currentStreak(a, logs, '2026-01-15', 1)).toEqual({ value: 3, unit: 'month' });
    // February not done yet: the in-progress month doesn't break it.
    expect(currentStreak(a, logs, '2026-02-10', 1)?.value).toBe(3);
  });
});

describe('milestones', () => {
  it('have no streak', () => {
    expect(currentStreak(action({ kind: 'milestone' }), {}, TODAY, 1)).toBeNull();
  });
});
