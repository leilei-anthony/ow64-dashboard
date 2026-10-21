import type { DayKey, Habit, HabitLog, HabitTime } from '../model/types';
import { addDays, dayOfWeek, weekStart } from './dates';

// Pure habit logic. Days are the dashboard's tracking days (4 AM start).

const MAX_DAYS = 3660; // safety bound for streak walks

export const habitValue = (log: HabitLog, day: DayKey, id: string) => log[day]?.[id] ?? 0;

/** Tracked on this day: created by then and not archived yet. */
export const isActive = (h: Habit, day: DayKey) => h.createdAt <= day && (!h.archivedAt || day < h.archivedAt);

/** Whether the habit is meant to happen on this day ("N× a week" habits can happen any day). */
export function isScheduled(h: Habit, day: DayKey): boolean {
  return h.schedule.kind === 'days' ? h.schedule.days.includes(dayOfWeek(day)) : true;
}

/** check: ticked · count: reached the target · avoid: no slip-up. */
export function isMet(h: Habit, log: HabitLog, day: DayKey): boolean {
  const v = habitValue(log, day, h.id);
  if (h.kind === 'avoid') return v === 0;
  if (h.kind === 'count') return v >= (h.target ?? 1);
  return v >= 1;
}

export interface WeekProgress {
  count: number;
  target: number;
  met: boolean;
}

/** For "N× a week" habits: days met this week (Mon–Sun or Sun–Sat), up to the end of the week. */
export function weekProgress(h: Habit, log: HabitLog, day: DayKey, weekStartsOn: number): WeekProgress {
  const target = h.schedule.kind === 'weekly' ? h.schedule.times : 7;
  const from = weekStart(day, weekStartsOn);
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(from, i);
    if (isActive(h, d) && isMet(h, log, d)) count++;
  }
  return { count, target, met: count >= target };
}

/**
 * Current streak as of `today`:
 * - every day / specific days: scheduled days met in a row (days off are skipped; today in progress never breaks it)
 * - N× a week: weeks in a row that hit the target (the current week never breaks it)
 * - avoid: clean days in a row, today included unless you've slipped
 * Never counts days before the habit was created.
 */
export function habitStreak(h: Habit, log: HabitLog, today: DayKey, weekStartsOn: number): number {
  if (h.schedule.kind === 'weekly') {
    let start = weekStart(today, weekStartsOn);
    if (!weekProgress(h, log, start, weekStartsOn).met) start = addDays(start, -7);
    let n = 0;
    while (n < MAX_DAYS && addDays(start, 6) >= h.createdAt && weekProgress(h, log, start, weekStartsOn).met) {
      n++;
      start = addDays(start, -7);
    }
    return n;
  }

  let day = today;
  // A habit not done yet today is still in progress: count from yesterday. (An avoid habit is clean until you slip.)
  if (h.kind !== 'avoid' && isScheduled(h, today) && !isMet(h, log, today)) day = addDays(today, -1);
  let n = 0;
  for (let i = 0; i < MAX_DAYS && day >= h.createdAt; i++, day = addDays(day, -1)) {
    if (!isScheduled(h, day)) continue;
    if (!isMet(h, log, day)) break;
    n++;
  }
  return n;
}

/** Shown on the day's list: active, and either scheduled that day or an "N× a week" habit. */
export const isDue = (h: Habit, day: DayKey) => isActive(h, day) && isScheduled(h, day);

/** Counts as done in the list: met that day, or a weekly habit that already hit its target this week. */
export function isDoneOn(h: Habit, log: HabitLog, day: DayKey, weekStartsOn: number): boolean {
  if (isMet(h, log, day)) return true;
  return h.schedule.kind === 'weekly' && weekProgress(h, log, day, weekStartsOn).met;
}

export function daySummary(habits: Habit[], log: HabitLog, day: DayKey, weekStartsOn: number): { done: number; total: number } {
  const due = habits.filter((h) => isDue(h, day));
  return { done: due.filter((h) => isDoneOn(h, log, day, weekStartsOn)).length, total: due.length };
}

export const HABIT_TIMES: HabitTime[] = ['morning', 'anytime', 'evening'];

export function groupByTime(habits: Habit[]): Record<HabitTime, Habit[]> {
  return {
    morning: habits.filter((h) => h.time === 'morning'),
    anytime: habits.filter((h) => h.time === 'anytime'),
    evening: habits.filter((h) => h.time === 'evening'),
  };
}

/** Habits met on a day (for the heatmap), counting only those active and scheduled that day. */
export function habitsMetOn(habits: Habit[], log: HabitLog, day: DayKey): Habit[] {
  return habits.filter((h) => isActive(h, day) && isScheduled(h, day) && habitValue(log, day, h.id) > 0 && isMet(h, log, day));
}
