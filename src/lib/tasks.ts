import type { Chart, DayKey, Recurrence, Task } from '../model/types';
import { addDays, dayOfWeek, daysBetween, monthEnd } from './dates';

// Pure task logic. Carry-over is derived from dates, never applied by a job:
// an open task shows on every day from its start until it's finished.

export const taskStart = (t: Task): DayKey => t.scheduledFor ?? t.createdAt;
export const isFinished = (t: Task) => !!(t.completedAt || t.droppedAt);
export const finishedOn = (t: Task): DayKey | undefined => t.completedAt ?? t.droppedAt;

/** Open and already started by `day` (so it shows on that day, carried or not). */
export const isCurrent = (t: Task, day: DayKey) => !isFinished(t) && taskStart(t) <= day;
export const isUpcoming = (t: Task, today: DayKey) => !isFinished(t) && taskStart(t) > today;

export function carriedDays(t: Task, today: DayKey): number {
  return Math.max(0, daysBetween(taskStart(t), today));
}

export function isStale(t: Task, today: DayKey, staleDays: number): boolean {
  return staleDays > 0 && carriedDays(t, today) >= staleDays;
}

/** First day strictly after `after` that matches the rule. Day 31 means the last day of shorter months. */
export function nextOccurrence(rule: Recurrence, after: DayKey): DayKey {
  if (rule.kind === 'weekly') {
    const days = rule.days.length ? rule.days : [dayOfWeek(after)];
    for (let i = 1; i <= 7; i++) {
      const d = addDays(after, i);
      if (days.includes(dayOfWeek(d))) return d;
    }
    return addDays(after, 7);
  }
  const inMonthOf = (key: DayKey) => {
    const last = Number(monthEnd(key).slice(8));
    return `${key.slice(0, 8)}${String(Math.min(rule.day, last)).padStart(2, '0')}`;
  };
  const candidate = inMonthOf(after);
  return candidate > after ? candidate : inMonthOf(addDays(monthEnd(after), 1));
}

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function recurrenceLabel(rule: Recurrence, weekStartsOn: number): string {
  if (rule.kind === 'monthly') return `Monthly on the ${ordinal(rule.day)}`;
  if (rule.days.length === 7) return 'Every day';
  const order = (d: number) => (d - weekStartsOn + 7) % 7;
  return [...rule.days].sort((a, b) => order(a) - order(b)).map((d) => WEEKDAY_SHORT[d]).join(', ');
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}

export const starredFor = (tasks: Task[], day: DayKey) => tasks.filter((t) => t.top3 === day && !t.droppedAt);

/** Top 3 first (in list order), then everything else in list order. */
export function sortForDay(tasks: Task[], day: DayKey): Task[] {
  const starred = tasks.filter((t) => t.top3 === day);
  return [...starred, ...tasks.filter((t) => t.top3 !== day)];
}

function liveActionIds(chart: Chart): Set<string> {
  return new Set(chart.pillars.flatMap((p) => p.actions.filter((a) => a.text.trim()).map((a) => a.id)));
}

/** The action Top 3 completes: an explicit id, none, or (auto) the one named like "Daily top 3". */
export function resolveTop3Action(chart: Chart, setting: string): string | undefined {
  if (setting === 'none') return undefined;
  const live = liveActionIds(chart);
  if (setting !== 'auto') return live.has(setting) ? setting : undefined;
  return chart.pillars.flatMap((p) => p.actions).find((a) => /top\s*3/i.test(a.text))?.id;
}

/** Actions that tasks say should be ticked on `day`. Replaced (archived) actions are never ticked. */
export function desiredAutoTicks(day: DayKey, tasks: Task[], chart: Chart, top3Setting: string): Set<string> {
  const live = liveActionIds(chart);
  const desired = new Set<string>();
  for (const t of tasks) {
    if (t.completedAt === day && t.actionId && live.has(t.actionId)) desired.add(t.actionId);
  }
  const top3Action = resolveTop3Action(chart, top3Setting);
  const starred = starredFor(tasks, day);
  if (top3Action && starred.length === 3 && starred.every((t) => t.completedAt === day)) desired.add(top3Action);
  return desired;
}

/**
 * Brings one day's ticks in line with what tasks want. Ticks the user made
 * themselves (in `done` but not `auto`) are never removed.
 */
export function reconcileAutoTicks(
  done: string[],
  auto: string[],
  desired: Set<string>,
): { done: string[]; auto: string[]; changed: boolean } {
  const add = [...desired].filter((id) => !done.includes(id));
  const remove = auto.filter((id) => !desired.has(id));
  if (!add.length && !remove.length) return { done, auto, changed: false };
  return {
    done: [...done.filter((id) => !remove.includes(id)), ...add],
    auto: [...auto.filter((id) => desired.has(id)), ...add],
    changed: true,
  };
}

// ---- List operations (return a new list; the input is untouched) ----------

/** Complete or drop a task. A recurring task creates its next instance. */
export function finishIn(
  list: Task[],
  id: string,
  day: DayKey,
  how: 'completed' | 'dropped',
  makeId: () => string,
): Task[] {
  const t = list.find((x) => x.id === id);
  if (!t || isFinished(t)) return list;
  const finished: Task = { ...t, ...(how === 'completed' ? { completedAt: day } : { droppedAt: day }) };
  if (!t.recurrence || t.spawnedId) return list.map((x) => (x.id === id ? finished : x));

  const start = taskStart(t);
  const next: Task = {
    id: makeId(),
    text: t.text,
    createdAt: day,
    scheduledFor: nextOccurrence(t.recurrence, start > day ? start : day),
    subtasks: t.subtasks.map((s) => ({ id: makeId(), text: s.text, done: false })),
    recurrence: t.recurrence,
    ...(t.actionId ? { actionId: t.actionId } : {}),
    ...(t.countdown ? { countdown: true } : {}),
  };
  finished.spawnedId = next.id;
  return [...list.map((x) => (x.id === id ? finished : x)), next];
}

/** Undo complete/drop. Removes the recurring next instance if it hasn't been touched. */
export function reopenIn(list: Task[], id: string): Task[] {
  const t = list.find((x) => x.id === id);
  if (!t || !isFinished(t)) return list;
  const { completedAt: _c, droppedAt: _d, spawnedId, ...rest } = t;
  const spawned = spawnedId ? list.find((x) => x.id === spawnedId) : undefined;
  const untouched =
    !spawned || (!isFinished(spawned) && spawned.text === t.text && spawned.subtasks.every((s) => !s.done));
  if (spawnedId && untouched) {
    return list.filter((x) => x.id !== spawnedId).map((x) => (x.id === id ? rest : x));
  }
  return list.map((x) => (x.id === id ? { ...rest, ...(spawnedId ? { spawnedId } : {}) } : x));
}
