import type { Action, Cadence, DayKey, Logs } from '../model/types';
import { addDays, monthEnd, monthShort, monthStart, weekStart } from './dates';

export function isDone(logs: Logs, day: DayKey, actionId: string): boolean {
  return logs[day]?.done.includes(actionId) ?? false;
}

/** Number of days in [from, to] on which the action was done. */
export function countDone(logs: Logs, actionId: string, from: DayKey, to: DayKey): number {
  let n = 0;
  for (let k = from; k <= to; k = addDays(k, 1)) if (isDone(logs, k, actionId)) n++;
  return n;
}

/** The first day a milestone was ticked, if it has been. */
export function milestoneDoneOn(logs: Logs, actionId: string): DayKey | undefined {
  let first: DayKey | undefined;
  for (const [day, entry] of Object.entries(logs)) {
    if (entry.done.includes(actionId) && (!first || day < first)) first = day;
  }
  return first;
}

export interface PeriodProgress {
  count: number;
  target: number;
  met: boolean;
  /** Short text shown on the cell, e.g. "2/4 wk". */
  label: string;
}

/** Progress toward the action's cadence target in the period containing `day`. */
export function periodProgress(
  action: Action,
  logs: Logs,
  day: DayKey,
  weekStartsOn: number,
): PeriodProgress | null {
  const c = action.cadence;
  switch (c.kind) {
    case 'weekly': {
      const from = weekStart(day, weekStartsOn);
      const count = countDone(logs, action.id, from, addDays(from, 6));
      return { count, target: c.times, met: count >= c.times, label: `${count}/${c.times} wk` };
    }
    case 'monthly': {
      const count = countDone(logs, action.id, monthStart(day), monthEnd(day));
      return {
        count,
        target: c.times,
        met: count >= c.times,
        label: `${count}/${c.times} ${monthShort(day)}`,
      };
    }
    case 'milestone': {
      const doneOn = milestoneDoneOn(logs, action.id);
      const met = !!doneOn && doneOn <= day;
      return { count: met ? 1 : 0, target: 1, met, label: met ? 'done' : 'milestone' };
    }
    default:
      return null;
  }
}

export function cadenceLabel(c: Cadence): string {
  switch (c.kind) {
    case 'daily':
      return 'Every day';
    case 'weekly':
      return `${c.times}× a week`;
    case 'monthly':
      return `${c.times}× a month`;
    case 'milestone':
      return 'One-time milestone';
    case 'anytime':
      return 'Anytime (no target)';
  }
}
