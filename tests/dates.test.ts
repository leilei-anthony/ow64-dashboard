import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayOfWeek,
  daysBetween,
  isDayKey,
  logicalDay,
  monthEnd,
  monthStart,
  weekStart,
} from '../src/lib/dates';

// vite.config.ts runs tests in America/New_York so the DST cases are real.

describe('logicalDay', () => {
  it('counts the hours before the day-start hour as the previous day', () => {
    expect(logicalDay(new Date(2026, 9, 13, 3, 59), 4)).toBe('2026-10-12');
    expect(logicalDay(new Date(2026, 9, 13, 4, 0), 4)).toBe('2026-10-13');
    expect(logicalDay(new Date(2026, 9, 13, 23, 59), 4)).toBe('2026-10-13');
  });

  it('uses the calendar day when the day starts at midnight', () => {
    expect(logicalDay(new Date(2026, 9, 13, 0, 1), 0)).toBe('2026-10-13');
  });

  it('crosses month and year boundaries', () => {
    expect(logicalDay(new Date(2027, 0, 1, 2, 0), 4)).toBe('2026-12-31');
    expect(logicalDay(new Date(2026, 2, 1, 1, 0), 4)).toBe('2026-02-28');
  });

  it('handles the daylight-saving switch nights', () => {
    // US clocks jump 2:00 → 3:00 on 2026-03-08 and fall back on 2026-11-01.
    expect(logicalDay(new Date(2026, 2, 8, 3, 30), 4)).toBe('2026-03-07');
    expect(logicalDay(new Date(2026, 2, 8, 4, 0), 4)).toBe('2026-03-08');
    expect(logicalDay(new Date(2026, 10, 1, 1, 30), 4)).toBe('2026-10-31');
  });
});

describe('day-key arithmetic', () => {
  it('adds days across DST, months, years and leap days', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('measures days between keys', () => {
    expect(daysBetween('2026-10-13', '2028-04-01')).toBe(536);
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(daysBetween('2026-10-13', '2026-10-12')).toBe(-1);
  });

  it('validates day keys', () => {
    expect(isDayKey('2026-10-13')).toBe(true);
    expect(isDayKey('2026-02-30')).toBe(false);
    expect(isDayKey('2026-1-3')).toBe(false);
    expect(isDayKey(20261013)).toBe(false);
  });
});

describe('weeks and months', () => {
  it('finds the start of the week for Monday and Sunday starts', () => {
    expect(dayOfWeek('2026-10-13')).toBe(2); // Tuesday
    expect(weekStart('2026-10-13', 1)).toBe('2026-10-12');
    expect(weekStart('2026-10-12', 1)).toBe('2026-10-12');
    expect(weekStart('2026-10-18', 1)).toBe('2026-10-12'); // Sunday belongs to the Monday week
    expect(weekStart('2026-10-18', 0)).toBe('2026-10-18');
    expect(weekStart('2026-01-01', 1)).toBe('2025-12-29');
  });

  it('finds month bounds', () => {
    expect(monthStart('2026-10-13')).toBe('2026-10-01');
    expect(monthEnd('2026-02-10')).toBe('2026-02-28');
    expect(monthEnd('2028-02-10')).toBe('2028-02-29');
    expect(monthEnd('2026-12-05')).toBe('2026-12-31');
  });
});
