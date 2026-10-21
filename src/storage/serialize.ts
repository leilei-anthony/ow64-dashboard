import { SCHEMA_VERSION, type AppData, type HabitLog, type Logs, type PomodoroLog, type Task } from '../model/types';
import { finishedOn, isFinished } from '../lib/tasks';
import {
  normalizeChart,
  normalizeCountdowns,
  normalizeHabitLog,
  normalizeHabits,
  normalizeLogs,
  normalizePomodoroLog,
  normalizeQuickLinks,
  normalizeSettings,
  normalizeTasks,
} from './normalize';

// chrome.storage.local layout:
//   meta        { schemaVersion }
//   chart, settings, countdowns, quickLinks
//   logs:2026   { "2026-10-13": DayEntry, … }   one key per year keeps writes small
//   tasks       open and upcoming tasks, in display order
//   tasksDone:2026   tasks completed or dropped that year
//   pomodoroLog:2026 finished pomodoros per day (written by the background worker)
//   habits      the habit list, in display order
//   habitLog:2026    habit check-ins per day
//   pomodoro, calendarSources, calendarCache   device-only, never in backups

export const LOG_PREFIX = 'logs:';
export const TASKS_KEY = 'tasks';
export const TASKS_DONE_PREFIX = 'tasksDone:';

export const tasksDoneKey = (year: number | string) => `${TASKS_DONE_PREFIX}${year}`;

export const HABITS_KEY = 'habits';
export const HABIT_LOG_PREFIX = 'habitLog:';
export const habitLogKey = (year: number | string) => `${HABIT_LOG_PREFIX}${year}`;

export function habitLogForYear(log: HabitLog, year: number | string): HabitLog {
  const prefix = `${year}-`;
  return Object.fromEntries(Object.entries(log).filter(([day]) => day.startsWith(prefix)));
}

export const POMODORO_LOG_PREFIX = 'pomodoroLog:';
export const pomodoroLogKey = (year: number | string) => `${POMODORO_LOG_PREFIX}${year}`;

export function pomodoroLogForYear(log: PomodoroLog, year: number | string): PomodoroLog {
  const prefix = `${year}-`;
  return Object.fromEntries(Object.entries(log).filter(([day]) => day.startsWith(prefix)));
}

export const openTasks = (tasks: Task[]) => tasks.filter((t) => !isFinished(t));

export function doneTasksForYear(tasks: Task[], year: number | string): Task[] {
  return tasks.filter((t) => finishedOn(t)?.startsWith(`${year}-`));
}

export const logsKey = (year: number | string) => `${LOG_PREFIX}${year}`;

export function logsForYear(logs: Logs, year: number | string): Logs {
  const prefix = `${year}-`;
  return Object.fromEntries(Object.entries(logs).filter(([day]) => day.startsWith(prefix)));
}

export function toStorageItems(data: AppData): Record<string, unknown> {
  const items: Record<string, unknown> = {
    meta: { schemaVersion: SCHEMA_VERSION },
    chart: data.chart,
    settings: data.settings,
    countdowns: data.countdowns,
    quickLinks: data.quickLinks,
    [TASKS_KEY]: openTasks(data.tasks),
    [HABITS_KEY]: data.habits,
  };
  const years = new Set(Object.keys(data.logs).map((day) => day.slice(0, 4)));
  for (const year of years) items[logsKey(year)] = logsForYear(data.logs, year);
  const doneYears = new Set(data.tasks.flatMap((t) => finishedOn(t)?.slice(0, 4) ?? []));
  for (const year of doneYears) items[tasksDoneKey(year)] = doneTasksForYear(data.tasks, year);
  const pomoYears = new Set(Object.keys(data.pomodoroLog).map((day) => day.slice(0, 4)));
  for (const year of pomoYears) items[pomodoroLogKey(year)] = pomodoroLogForYear(data.pomodoroLog, year);
  const habitYears = new Set(Object.keys(data.habitLog).map((day) => day.slice(0, 4)));
  for (const year of habitYears) items[habitLogKey(year)] = habitLogForYear(data.habitLog, year);
  return items;
}

/**
 * Rebuilds app data from storage. Returns null when there is no usable chart
 * (first run). Future schema migrations go here, keyed on `meta.schemaVersion`.
 */
export function fromStorageItems(items: Record<string, unknown>): AppData | null {
  const chart = normalizeChart(items.chart);
  if (!chart) return null;
  const logs: Logs = {};
  const pomodoroLog: PomodoroLog = {};
  const habitLog: HabitLog = {};
  const done = new Map<string, Task>();
  for (const [key, value] of Object.entries(items)) {
    if (key.startsWith(LOG_PREFIX)) Object.assign(logs, normalizeLogs(value));
    if (key.startsWith(POMODORO_LOG_PREFIX)) Object.assign(pomodoroLog, normalizePomodoroLog(value));
    if (key.startsWith(HABIT_LOG_PREFIX)) Object.assign(habitLog, normalizeHabitLog(value));
    if (key.startsWith(TASKS_DONE_PREFIX)) for (const t of normalizeTasks(value)) if (isFinished(t)) done.set(t.id, t);
  }
  // A finished copy wins over a stale open one, so a task can never show twice.
  const open = openTasks(normalizeTasks(items[TASKS_KEY])).filter((t) => !done.has(t.id));
  return {
    schemaVersion: SCHEMA_VERSION,
    chart,
    logs,
    countdowns: normalizeCountdowns(items.countdowns),
    quickLinks: normalizeQuickLinks(items.quickLinks),
    tasks: [...open, ...done.values()],
    pomodoroLog,
    habits: normalizeHabits(items[HABITS_KEY]),
    habitLog,
    settings: normalizeSettings(items.settings),
  };
}
