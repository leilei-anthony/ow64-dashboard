import { batch, computed, signal } from '@preact/signals';
import {
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
  type AppData,
  type CalendarCache,
  type CalendarSource,
  type Chart,
  type Countdown,
  type DayEntry,
  type DayKey,
  type Habit,
  type HabitLog,
  type Logs,
  type PomodoroLog,
  type PomodoroState,
  type QuickLink,
  type Settings,
  type Task,
} from '../model/types';
import { seedChart, seedQuickLinks } from '../model/seed';
import { logicalDay, yearOf } from '../lib/dates';
import { finishedOn, isFinished, reconcileAutoTicks } from '../lib/tasks';
import { createAdapter, type Changes } from './adapter';
import {
  isEmptyEntry,
  normalizeCalendarCache,
  normalizeCalendarSources,
  normalizeChart,
  normalizeCountdowns,
  normalizeHabitLog,
  normalizeHabits,
  normalizeLogs,
  normalizePomodoroLog,
  normalizePomodoroState,
  normalizeQuickLinks,
  normalizeSettings,
  normalizeTasks,
} from './normalize';
import {
  HABITS_KEY,
  HABIT_LOG_PREFIX,
  LOG_PREFIX,
  POMODORO_LOG_PREFIX,
  TASKS_DONE_PREFIX,
  TASKS_KEY,
  fromStorageItems,
  logsForYear,
  logsKey,
  toStorageItems,
} from './serialize';

// ---- State ---------------------------------------------------------------

export const ready = signal(false);
export const chart = signal<Chart>(seedChart(logicalDay(new Date(), DEFAULT_SETTINGS.dayStartHour)));
export const logs = signal<Logs>({});
export const countdowns = signal<Countdown[]>([]);
export const quickLinks = signal<QuickLink[]>([]);
/** Open tasks in display order, then finished ones. Changed through `storage/tasks.ts`. */
export const tasks = signal<Task[]>([]);
export const settings = signal<Settings>(DEFAULT_SETTINGS);
/** Google Calendar links and their cached events. Device-only: never in backups, kept through import/reset. */
export const calendarSources = signal<CalendarSource[]>([]);
export const calendarCache = signal<CalendarCache>({ sources: {} });
export const CALENDAR_SOURCES_KEY = 'calendarSources';
export const CALENDAR_CACHE_KEY = 'calendarCache';
/** The running timer (device-only). The background worker writes it; tabs only read it. */
export const POMODORO_KEY = 'pomodoro';
export const pomodoroState = signal<PomodoroState>(normalizePomodoroState(undefined));
/** Small routines outside the chart, and their check-ins. Changed through `storage/habits.ts`. */
export const habits = signal<Habit[]>([]);
export const habitLog = signal<HabitLog>({});
/** Finished pomodoros per day. Also written by the background worker. */
export const pomodoroLog = signal<PomodoroLog>({});
const DEVICE_KEYS = new Set([CALENDAR_SOURCES_KEY, CALENDAR_CACHE_KEY, POMODORO_KEY]);

/** Wall clock, refreshed on each minute boundary. */
export const now = signal(new Date());
export const today = computed(() => logicalDay(now.value, settings.value.dayStartHour));
/** The day being viewed / edited; null follows today. */
export const selectedDay = signal<DayKey | null>(null);
export const viewDay = computed(() => {
  const s = selectedDay.value;
  return s && s < today.value ? s : today.value;
});

export function snapshot(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    chart: chart.value,
    logs: logs.value,
    countdowns: countdowns.value,
    quickLinks: quickLinks.value,
    tasks: tasks.value,
    pomodoroLog: pomodoroLog.value,
    habits: habits.value,
    habitLog: habitLog.value,
    settings: settings.value,
  };
}

// ---- Persistence ---------------------------------------------------------

const adapter = createAdapter();
const pending = new Map<string, unknown>();
let timer: ReturnType<typeof setTimeout> | undefined;

// JSON of values this tab wrote, per key, so the onChanged echo of our own
// writes isn't re-applied (which could clobber typing that is still debounced).
const REMOVED = '∅';
const ownWrites = new Map<string, string[]>();
const fingerprint = (v: unknown) => (v === undefined ? REMOVED : JSON.stringify(v));

function remember(key: string, value: unknown) {
  const list = ownWrites.get(key) ?? [];
  list.push(fingerprint(value));
  ownWrites.set(key, list.slice(-20));
}

/** Debounced write of whole storage keys (shared with `storage/tasks.ts`). */
export function queue(items: Record<string, unknown>) {
  for (const [k, v] of Object.entries(items)) pending.set(k, v);
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
}

export async function flush(): Promise<void> {
  clearTimeout(timer);
  if (!pending.size) return;
  const items = Object.fromEntries(pending);
  pending.clear();
  for (const [k, v] of Object.entries(items)) remember(k, v);
  try {
    await adapter.set(items);
  } catch (err) {
    console.error('OW64: could not save', err);
  }
}

function applyKey(key: string, value: unknown) {
  if (key === 'chart') {
    const c = normalizeChart(value);
    if (c) chart.value = c;
  } else if (key === 'settings') {
    if (value !== undefined) settings.value = normalizeSettings(value);
  } else if (key === 'countdowns') {
    countdowns.value = normalizeCountdowns(value);
  } else if (key === 'quickLinks') {
    if (value !== undefined) quickLinks.value = normalizeQuickLinks(value);
  } else if (key === HABITS_KEY) {
    if (value !== undefined) habits.value = normalizeHabits(value);
  } else if (key.startsWith(HABIT_LOG_PREFIX)) {
    const prefix = `${key.slice(HABIT_LOG_PREFIX.length)}-`;
    const kept = Object.entries(habitLog.value).filter(([day]) => !day.startsWith(prefix));
    habitLog.value = { ...Object.fromEntries(kept), ...normalizeHabitLog(value) };
  } else if (key === POMODORO_KEY) {
    pomodoroState.value = normalizePomodoroState(value);
  } else if (key.startsWith(POMODORO_LOG_PREFIX)) {
    const prefix = `${key.slice(POMODORO_LOG_PREFIX.length)}-`;
    const kept = Object.entries(pomodoroLog.value).filter(([day]) => !day.startsWith(prefix));
    pomodoroLog.value = { ...Object.fromEntries(kept), ...normalizePomodoroLog(value) };
  } else if (key === CALENDAR_SOURCES_KEY) {
    calendarSources.value = normalizeCalendarSources(value);
  } else if (key === CALENDAR_CACHE_KEY) {
    calendarCache.value = normalizeCalendarCache(value);
  } else if (key === TASKS_KEY) {
    tasks.value = [...normalizeTasks(value).filter((t) => !isFinished(t)), ...tasks.value.filter(isFinished)];
  } else if (key.startsWith(TASKS_DONE_PREFIX)) {
    const prefix = `${key.slice(TASKS_DONE_PREFIX.length)}-`;
    const kept = tasks.value.filter((t) => !finishedOn(t)?.startsWith(prefix));
    tasks.value = [...kept, ...normalizeTasks(value).filter(isFinished)];
  } else if (key.startsWith(LOG_PREFIX)) {
    const prefix = `${key.slice(LOG_PREFIX.length)}-`;
    const kept = Object.entries(logs.value).filter(([day]) => !day.startsWith(prefix));
    logs.value = { ...Object.fromEntries(kept), ...normalizeLogs(value) };
  }
}

function handleChanges(changes: Changes) {
  batch(() => {
    for (const [key, value] of Object.entries(changes)) {
      const list = ownWrites.get(key);
      const i = list?.indexOf(fingerprint(value)) ?? -1;
      if (list && i >= 0) {
        list.splice(0, i + 1); // our own echo (and anything older it supersedes)
        continue;
      }
      if (pending.has(key)) continue; // a local edit is about to overwrite it anyway
      applyKey(key, value);
    }
  });
}

function applyAll(data: AppData) {
  batch(() => {
    chart.value = data.chart;
    logs.value = data.logs;
    countdowns.value = data.countdowns;
    quickLinks.value = data.quickLinks;
    tasks.value = data.tasks;
    pomodoroLog.value = data.pomodoroLog;
    habits.value = data.habits;
    habitLog.value = data.habitLog;
    settings.value = data.settings;
  });
}

function startClock() {
  const tick = () => {
    now.value = new Date();
    setTimeout(tick, 60_000 - (Date.now() % 60_000) + 20);
  };
  tick();
  // Background tabs throttle timers; catch up as soon as the tab is shown.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') now.value = new Date();
    else void flush();
  });
  window.addEventListener('pagehide', () => void flush());
}

export async function init(): Promise<void> {
  adapter.onChanged(handleChanges);
  const stored = await adapter.getAll();
  calendarSources.value = normalizeCalendarSources(stored[CALENDAR_SOURCES_KEY]);
  calendarCache.value = normalizeCalendarCache(stored[CALENDAR_CACHE_KEY]);
  pomodoroState.value = normalizePomodoroState(stored[POMODORO_KEY]);
  let data = fromStorageItems(stored);
  if (!data) {
    data = freshData(seedChart(logicalDay(new Date(), DEFAULT_SETTINGS.dayStartHour)));
    const items = toStorageItems(data);
    for (const [k, v] of Object.entries(items)) remember(k, v);
    await adapter.set(items);
  }
  applyAll(data);
  startClock();
  ready.value = true;
}

export function freshData(startChart: Chart, keep?: Pick<AppData, 'quickLinks' | 'settings'>): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    chart: startChart,
    logs: {},
    countdowns: [],
    quickLinks: keep?.quickLinks ?? seedQuickLinks(),
    tasks: [],
    pomodoroLog: {},
    habits: [],
    habitLog: {},
    settings: keep?.settings ?? DEFAULT_SETTINGS,
  };
}

/** Replace everything (import / reset). Removes log years the new data doesn't have; leaves calendar keys alone. */
export async function replaceAll(data: AppData): Promise<void> {
  clearTimeout(timer);
  pending.clear();
  const items = toStorageItems(data);
  const existing = await adapter.getAll();
  const stale = Object.keys(existing).filter((k) => !(k in items) && !DEVICE_KEYS.has(k));
  for (const k of stale) remember(k, undefined);
  for (const [k, v] of Object.entries(items)) remember(k, v);
  applyAll(data);
  selectedDay.value = null;
  if (stale.length) await adapter.remove(stale);
  await adapter.set(items);
}

// ---- Mutations -----------------------------------------------------------

export function setChart(next: Chart) {
  chart.value = next;
  queue({ chart: next });
}

export function updateSettings(patch: Partial<Settings>) {
  settings.value = { ...settings.value, ...patch };
  queue({ settings: settings.value });
}

export function setCountdowns(next: Countdown[]) {
  countdowns.value = next;
  queue({ countdowns: next });
}

export function setCalendarSources(next: CalendarSource[]) {
  calendarSources.value = next;
  queue({ [CALENDAR_SOURCES_KEY]: next });
}

export function setCalendarCache(next: CalendarCache) {
  calendarCache.value = next;
  queue({ [CALENDAR_CACHE_KEY]: next });
}

export function setQuickLinks(next: QuickLink[]) {
  quickLinks.value = next;
  queue({ quickLinks: next });
}

function updateDay(day: DayKey, fn: (entry: DayEntry) => DayEntry) {
  const current = logs.value[day] ?? { done: [] };
  const entry = fn(current);
  const next = { ...logs.value };
  if (isEmptyEntry(entry)) delete next[day];
  else next[day] = entry;
  logs.value = next;
  queue({ [logsKey(yearOf(day))]: logsForYear(next, yearOf(day)) });
}

/** A tick or untick by hand. It also stops tasks from managing this action's tick for the day. */
export function toggleDone(day: DayKey, actionId: string) {
  updateDay(day, (e) => {
    const { auto: _drop, ...rest } = e;
    const auto = (e.auto ?? []).filter((id) => id !== actionId);
    return {
      ...rest,
      done: e.done.includes(actionId) ? e.done.filter((id) => id !== actionId) : [...e.done, actionId],
      ...(auto.length ? { auto } : {}),
    };
  });
}

/** Tick / untick what tasks want on `day`, without touching ticks made by hand. */
export function applyAutoTicks(day: DayKey, desired: Set<string>) {
  const current = logs.value[day] ?? { done: [] };
  const r = reconcileAutoTicks(current.done, current.auto ?? [], desired);
  if (!r.changed) return;
  updateDay(day, (e) => {
    const { auto: _drop, ...rest } = e;
    return { ...rest, done: r.done, ...(r.auto.length ? { auto: r.auto } : {}) };
  });
}

export function setNote(day: DayKey, text: string) {
  updateDay(day, (e) => {
    const { note: _drop, ...rest } = e;
    return text.trim() ? { ...rest, note: text } : rest;
  });
}

export function setCellNote(day: DayKey, actionId: string, text: string) {
  updateDay(day, (e) => {
    const cellNotes = { ...e.cellNotes };
    if (text.trim()) cellNotes[actionId] = text;
    else delete cellNotes[actionId];
    const { cellNotes: _drop, ...rest } = e;
    return Object.keys(cellNotes).length ? { ...rest, cellNotes } : rest;
  });
}
