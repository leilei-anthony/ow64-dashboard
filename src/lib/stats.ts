import type { Action, Chart, DayKey, Logs, Pillar } from '../model/types';
import { addDays, dayRange, monthEnd, monthStart, weekStart } from './dates';
import { countDone, milestoneDoneOn } from './cadence';

export type HeatFilter =
  | { kind: 'all' }
  | { kind: 'pomodoro' }
  | { kind: 'habits' }
  | { kind: 'habit'; habitId: string }
  | { kind: 'pillar'; pillarId: string }
  | { kind: 'action'; actionId: string };

export interface ActionInfo {
  text: string;
  pillarId: string;
  retired: boolean;
}

/** Every action id ever used (current and retired) → its name and pillar. */
export function actionIndex(chart: Chart): Map<string, ActionInfo> {
  const map = new Map<string, ActionInfo>();
  for (const a of chart.archive) map.set(a.id, { text: a.text, pillarId: a.pillarId, retired: true });
  for (const p of chart.pillars) {
    for (const a of p.actions) map.set(a.id, { text: a.text, pillarId: p.id, retired: false });
  }
  return map;
}

/** How many of the day's ticks match the filter. */
export function dayCount(
  logs: Logs,
  day: DayKey,
  filter: HeatFilter,
  index: Map<string, ActionInfo>,
): number {
  const done = logs[day]?.done;
  if (!done) return 0;
  switch (filter.kind) {
    case 'all':
      return done.length;
    case 'pomodoro':
    case 'habits':
    case 'habit':
      return 0; // counted from the pomodoro / habit logs, not chart ticks
    case 'action':
      return done.includes(filter.actionId) ? 1 : 0;
    case 'pillar':
      return done.filter((id) => index.get(id)?.pillarId === filter.pillarId).length;
  }
}

export function totalTicks(logs: Logs, from: DayKey, to: DayKey): number {
  let n = 0;
  for (const day of dayRange(from, to)) n += logs[day]?.done.length ?? 0;
  return n;
}

export function activeDays(logs: Logs, from: DayKey, to: DayKey): number {
  return dayRange(from, to).filter((day) => (logs[day]?.done.length ?? 0) > 0).length;
}

export interface Completion {
  met: number;
  target: number;
  /** 0–1 */
  ratio: number;
}

/**
 * Share of this week's cadence targets met for one pillar, through `day`.
 * daily: one per elapsed day · weekly(n): n · monthly(n): n this month ·
 * milestone: done yet · anytime: done at least once this week.
 */
export function pillarWeekCompletion(
  pillar: Pillar,
  logs: Logs,
  day: DayKey,
  weekStartsOn: number,
): Completion {
  const from = weekStart(day, weekStartsOn);
  const elapsed = dayRange(from, day).length;
  let met = 0;
  let target = 0;
  for (const action of pillar.actions) {
    const [m, t] = actionWeekShare(action, logs, from, day, elapsed);
    met += m;
    target += t;
  }
  return { met, target, ratio: target ? met / target : 0 };
}

function actionWeekShare(
  action: Action,
  logs: Logs,
  from: DayKey,
  day: DayKey,
  elapsed: number,
): [met: number, target: number] {
  if (!action.text.trim()) return [0, 0];
  const c = action.cadence;
  switch (c.kind) {
    case 'daily':
      return [countDone(logs, action.id, from, day), elapsed];
    case 'weekly':
      return [Math.min(countDone(logs, action.id, from, addDays(from, 6)), c.times), c.times];
    case 'monthly':
      return [Math.min(countDone(logs, action.id, monthStart(day), monthEnd(day)), c.times), c.times];
    case 'milestone': {
      const doneOn = milestoneDoneOn(logs, action.id);
      return [doneOn && doneOn <= day ? 1 : 0, 1];
    }
    case 'anytime':
      return [countDone(logs, action.id, from, day) > 0 ? 1 : 0, 1];
  }
}
