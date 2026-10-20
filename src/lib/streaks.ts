import type { Action, DayKey, Logs } from '../model/types';
import { addDays, monthEnd, monthStart, weekStart } from './dates';
import { countDone, isDone } from './cadence';

export interface Streak {
  value: number;
  unit: 'day' | 'week' | 'month';
}

// A safety bound; real streaks stop at the first miss long before this.
const MAX_PERIODS = 3660;

/**
 * Current streak as of `today`. The period still in progress (today, this week,
 * this month) counts if its target is already met, and never breaks the streak if not.
 * Milestones have no streak; "anytime" actions get a plain day streak.
 */
export function currentStreak(
  action: Action,
  logs: Logs,
  today: DayKey,
  weekStartsOn: number,
): Streak | null {
  const c = action.cadence;
  if (c.kind === 'milestone') return null;

  if (c.kind === 'daily' || c.kind === 'anytime') {
    let day = isDone(logs, today, action.id) ? today : addDays(today, -1);
    let value = 0;
    while (value < MAX_PERIODS && isDone(logs, day, action.id)) {
      value++;
      day = addDays(day, -1);
    }
    return { value, unit: 'day' };
  }

  if (c.kind === 'weekly') {
    const met = (start: DayKey) => countDone(logs, action.id, start, addDays(start, 6)) >= c.times;
    let start = weekStart(today, weekStartsOn);
    if (!met(start)) start = addDays(start, -7);
    let value = 0;
    while (value < MAX_PERIODS && met(start)) {
      value++;
      start = addDays(start, -7);
    }
    return { value, unit: 'week' };
  }

  const met = (start: DayKey) => countDone(logs, action.id, start, monthEnd(start)) >= c.times;
  const prevMonth = (start: DayKey) => monthStart(addDays(start, -1));
  let start = monthStart(today);
  if (!met(start)) start = prevMonth(start);
  let value = 0;
  while (value < MAX_PERIODS && met(start)) {
    value++;
    start = prevMonth(start);
  }
  return { value, unit: 'month' };
}

export function streakLabel(s: Streak): string {
  const unit = s.unit === 'day' ? 'd' : s.unit === 'week' ? 'wk' : 'mo';
  return `${s.value}${unit}`;
}
