import {
  DEFAULT_POMODORO,
  DEFAULT_SETTINGS,
  SECTION_IDS,
  type PomodoroLog,
  type PomodoroSettings,
  type PomodoroState,
  type SectionId,
  type Action,
  type CalEvent,
  type CalendarCache,
  type CalendarSource,
  type Habit,
  type HabitLog,
  type HabitSchedule,
  type Cadence,
  type Chart,
  type Countdown,
  type DayEntry,
  type Logs,
  type Pillar,
  type QuickLink,
  type Recurrence,
  type RetiredAction,
  type Settings,
  type Task,
} from '../model/types';
import { isDayKey } from '../lib/dates';

// Lenient readers for stored or imported data: they fill in defaults and drop
// anything malformed. Only a chart without the 8×8 shape is rejected outright.

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const HEX_RE = /^#[0-9a-f]{6}$/i;

function clampTimes(v: unknown): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(31, Math.max(1, n)) : 1;
}

export function normalizeCadence(raw: unknown): Cadence {
  if (!isObj(raw)) return { kind: 'anytime' };
  switch (raw.kind) {
    case 'daily':
    case 'milestone':
    case 'anytime':
      return { kind: raw.kind };
    case 'weekly':
    case 'monthly':
      return { kind: raw.kind, times: clampTimes(raw.times) };
    default:
      return { kind: 'anytime' };
  }
}

function normalizeAction(raw: unknown): Action | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id) return null;
  return {
    id: raw.id,
    text: str(raw.text),
    cadence: normalizeCadence(raw.cadence),
    createdAt: isDayKey(raw.createdAt) ? raw.createdAt : '',
  };
}

function normalizePillar(raw: unknown): Pillar | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !Array.isArray(raw.actions)) return null;
  if (raw.actions.length !== 8) return null;
  const actions = raw.actions.map(normalizeAction);
  if (actions.some((a) => !a)) return null;
  return {
    id: raw.id,
    title: str(raw.title),
    color: HEX_RE.test(str(raw.color)) ? str(raw.color) : '#9aa0a6',
    actions: actions as Action[],
  };
}

export function normalizeChart(raw: unknown): Chart | null {
  if (!isObj(raw) || !Array.isArray(raw.pillars) || raw.pillars.length !== 8) return null;
  const pillars = raw.pillars.map(normalizePillar);
  if (pillars.some((p) => !p)) return null;
  const goal = isObj(raw.goal) ? raw.goal : {};
  const archive: RetiredAction[] = [];
  for (const item of Array.isArray(raw.archive) ? raw.archive : []) {
    const a = normalizeAction(item);
    if (a && isObj(item)) {
      archive.push({ ...a, pillarId: str(item.pillarId), retiredAt: isDayKey(item.retiredAt) ? item.retiredAt : '' });
    }
  }
  return {
    goal: { text: str(goal.text), ...(isDayKey(goal.targetDate) ? { targetDate: goal.targetDate } : {}) },
    pillars: pillars as Pillar[],
    archive,
  };
}

export function isEmptyEntry(e: DayEntry): boolean {
  return e.done.length === 0 && !e.note && !(e.cellNotes && Object.keys(e.cellNotes).length);
}

function normalizeEntry(raw: unknown): DayEntry | null {
  if (!isObj(raw)) return null;
  const done = Array.isArray(raw.done) ? [...new Set(raw.done.filter((id) => typeof id === 'string'))] : [];
  const entry: DayEntry = { done };
  if (Array.isArray(raw.auto)) {
    const auto = [...new Set(raw.auto.filter((id): id is string => typeof id === 'string' && done.includes(id)))];
    if (auto.length) entry.auto = auto;
  }
  if (typeof raw.note === 'string' && raw.note) entry.note = raw.note;
  if (isObj(raw.cellNotes)) {
    const notes = Object.entries(raw.cellNotes).filter(([, v]) => typeof v === 'string' && v);
    if (notes.length) entry.cellNotes = Object.fromEntries(notes) as Record<string, string>;
  }
  return isEmptyEntry(entry) ? null : entry;
}

export function normalizeLogs(raw: unknown): Logs {
  if (!isObj(raw)) return {};
  const logs: Logs = {};
  for (const [day, value] of Object.entries(raw)) {
    const entry = isDayKey(day) ? normalizeEntry(value) : null;
    if (entry) logs[day] = entry;
  }
  return logs;
}

export const STALE_CHOICES = [0, 3, 5, 7, 14];

/** Sections added in later versions, and the section they go in front of in an order saved before they existed. */
const INSERT_BEFORE: Partial<Record<SectionId, SectionId>> = { habits: 'tasks' };

/** Known ids in the saved order; new sections at their intended spot, anything else missing at the end. */
export function normalizeSectionOrder(raw: unknown): Settings['sectionOrder'] {
  const known = new Set<string>(SECTION_IDS);
  const saved = Array.isArray(raw) ? raw.filter((id): id is SectionId => typeof id === 'string' && known.has(id)) : [];
  const order = [...new Set(saved)];
  for (const id of SECTION_IDS) {
    if (order.includes(id)) continue;
    const anchor = INSERT_BEFORE[id];
    const at = anchor ? order.indexOf(anchor) : -1;
    if (at >= 0) order.splice(at, 0, id);
    else order.push(id);
  }
  return order;
}

export function normalizeSettings(raw: unknown): Settings {
  const s = isObj(raw) ? raw : {};
  const hour = Math.round(Number(s.dayStartHour));
  const bool = (key: keyof Settings) => (typeof s[key] === 'boolean' ? (s[key] as boolean) : (DEFAULT_SETTINGS[key] as boolean));
  return {
    dayStartHour: Number.isFinite(hour) && hour >= 0 && hour <= 12 ? hour : DEFAULT_SETTINGS.dayStartHour,
    weekStartsOn: s.weekStartsOn === 0 ? 0 : 1,
    matrixHidden: bool('matrixHidden'),
    hideLinksWhenHidden: bool('hideLinksWhenHidden'),
    showClock: bool('showClock'),
    clock24h: bool('clock24h'),
    showSearch: bool('showSearch'),
    staleTaskDays: STALE_CHOICES.includes(Number(s.staleTaskDays)) ? Number(s.staleTaskDays) : DEFAULT_SETTINGS.staleTaskDays,
    top3ActionId: typeof s.top3ActionId === 'string' && s.top3ActionId ? s.top3ActionId : DEFAULT_SETTINGS.top3ActionId,
    sections: Object.fromEntries(
      SECTION_IDS.map((id) => {
        const v = isObj(s.sections) ? s.sections[id] : undefined;
        return [id, typeof v === 'boolean' ? v : true];
      }),
    ) as Settings['sections'],
    sectionOrder: normalizeSectionOrder(s.sectionOrder),
    pomodoro: normalizePomodoroSettings(s.pomodoro),
    ...(isDayKey(s.lastBackupAt) ? { lastBackupAt: s.lastBackupAt } : {}),
  };
}

export function normalizeCountdowns(raw: unknown): Countdown[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c) =>
    isObj(c) && typeof c.id === 'string' && isDayKey(c.date) ? [{ id: c.id, label: str(c.label), date: c.date }] : [],
  );
}

/** Only http(s) links are allowed, so a tile can never run `javascript:`. */
export function safeUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function normalizeQuickLinks(raw: unknown): QuickLink[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((l) => {
    if (!isObj(l) || typeof l.id !== 'string') return [];
    const url = safeUrl(str(l.url));
    return url ? [{ id: l.id, title: str(l.title), url }] : [];
  });
}

function normalizeRecurrence(raw: unknown): Recurrence | undefined {
  if (!isObj(raw)) return undefined;
  if (raw.kind === 'weekly' && Array.isArray(raw.days)) {
    const days = [...new Set(raw.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
    return days.length ? { kind: 'weekly', days } : undefined;
  }
  if (raw.kind === 'monthly') {
    const day = Math.round(Number(raw.day));
    return Number.isFinite(day) && day >= 1 && day <= 31 ? { kind: 'monthly', day } : undefined;
  }
  return undefined;
}

function normalizeTask(raw: unknown): Task | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || !raw.id || !isDayKey(raw.createdAt)) return null;
  const subtasks = (Array.isArray(raw.subtasks) ? raw.subtasks : []).flatMap((st) =>
    isObj(st) && typeof st.id === 'string' ? [{ id: st.id, text: str(st.text), done: st.done === true }] : [],
  );
  const recurrence = normalizeRecurrence(raw.recurrence);
  const day = (key: string) => (isDayKey(raw[key]) ? { [key]: raw[key] as string } : {});
  const text = (key: string) => (typeof raw[key] === 'string' && raw[key] ? { [key]: raw[key] as string } : {});
  return {
    id: raw.id,
    text: str(raw.text),
    createdAt: raw.createdAt,
    ...day('scheduledFor'),
    ...(raw.countdown === true ? { countdown: true } : {}),
    ...text('actionId'),
    ...day('top3'),
    subtasks,
    ...(raw.inProgress === true ? { inProgress: true as const } : {}),
    ...(recurrence ? { recurrence } : {}),
    ...day('completedAt'),
    ...day('droppedAt'),
    ...text('spawnedId'),
  };
}

export function normalizeTasks(raw: unknown): Task[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((t) => {
    const task = normalizeTask(t);
    return task ? [task] : [];
  });
}

export function normalizeCalendarSources(raw: unknown): CalendarSource[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c) =>
    isObj(c) && typeof c.id === 'string' && typeof c.url === 'string' && c.url.startsWith('https://')
      ? [{ id: c.id, name: str(c.name, 'Calendar'), url: c.url, color: HEX_RE.test(str(c.color)) ? str(c.color) : '#8DB4E8', enabled: c.enabled !== false }]
      : [],
  );
}

function normalizeCalEvent(raw: unknown): CalEvent | null {
  if (!isObj(raw) || typeof raw.id !== 'string' || typeof raw.start !== 'string' || typeof raw.end !== 'string') return null;
  return {
    id: raw.id,
    sourceId: str(raw.sourceId),
    title: str(raw.title, '(No title)'),
    start: raw.start,
    end: raw.end,
    allDay: raw.allDay === true,
    ...(typeof raw.location === 'string' && raw.location ? { location: raw.location } : {}),
    ...(typeof raw.joinUrl === 'string' && raw.joinUrl.startsWith('https://') ? { joinUrl: raw.joinUrl } : {}),
  };
}

export function normalizeCalendarCache(raw: unknown): CalendarCache {
  const c = isObj(raw) ? raw : {};
  const sources: CalendarCache['sources'] = {};
  for (const [id, value] of Object.entries(isObj(c.sources) ? c.sources : {})) {
    if (!isObj(value)) continue;
    sources[id] = {
      ...(typeof value.fetchedAt === 'string' ? { fetchedAt: value.fetchedAt } : {}),
      ...(typeof value.error === 'string' ? { error: value.error } : {}),
      events: (Array.isArray(value.events) ? value.events : []).flatMap((e) => {
        const event = normalizeCalEvent(e);
        return event ? [event] : [];
      }),
    };
  }
  return { ...(typeof c.checkedAt === 'string' ? { checkedAt: c.checkedAt } : {}), sources };
}

// ---- Pomodoro ------------------------------------------------------------------

/** Minutes may be fractional in storage (the end-to-end tests use seconds-long sessions). */
function minutes(v: unknown, fallback: number, max: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0.05 && n <= max ? n : fallback;
}

export function normalizePomodoroSettings(raw: unknown): PomodoroSettings {
  const p = isObj(raw) ? raw : {};
  const bool = (k: keyof PomodoroSettings) => (typeof p[k] === 'boolean' ? (p[k] as boolean) : (DEFAULT_POMODORO[k] as boolean));
  const every = Math.round(Number(p.longEvery));
  return {
    focusMin: minutes(p.focusMin, DEFAULT_POMODORO.focusMin, 180),
    shortMin: minutes(p.shortMin, DEFAULT_POMODORO.shortMin, 60),
    longMin: minutes(p.longMin, DEFAULT_POMODORO.longMin, 120),
    longEvery: Number.isFinite(every) && every >= 1 && every <= 12 ? every : DEFAULT_POMODORO.longEvery,
    autoStartBreaks: bool('autoStartBreaks'),
    autoStartFocus: bool('autoStartFocus'),
    chime: bool('chime'),
    openFocusOnNewTab: bool('openFocusOnNewTab'),
    askedNotify: bool('askedNotify'),
  };
}

const PHASES = ['focus', 'short', 'long'] as const;
const isPhase = (v: unknown): v is PomodoroState['phase'] => PHASES.includes(v as never);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function normalizePomodoroState(raw: unknown): PomodoroState {
  const r = isObj(raw) ? raw : {};
  const status = r.status === 'running' || r.status === 'paused' ? r.status : 'idle';
  const endsAt = num(r.endsAt);
  const remainingMs = num(r.remainingMs);
  const lengthMs = num(r.lengthMs);
  const last = isObj(r.lastFinished) && typeof r.lastFinished.sessionId === 'string' && isPhase(r.lastFinished.phase) && num(r.lastFinished.at)
    ? { sessionId: r.lastFinished.sessionId, phase: r.lastFinished.phase, at: r.lastFinished.at as number }
    : undefined;
  // A running timer needs an end; a paused one needs its time left. Otherwise fall back to idle.
  const ok = status === 'idle' || (status === 'running' && endsAt !== undefined) || (status === 'paused' && remainingMs !== undefined);
  return {
    phase: isPhase(r.phase) ? r.phase : 'focus',
    status: ok ? status : 'idle',
    ...(ok && status === 'running' ? { endsAt } : {}),
    ...(ok && status === 'paused' ? { remainingMs } : {}),
    ...(ok && status !== 'idle' && lengthMs !== undefined ? { lengthMs } : {}),
    cycle: Math.max(0, Math.round(num(r.cycle) ?? 0)),
    ...(typeof r.taskId === 'string' && r.taskId ? { taskId: r.taskId } : {}),
    sessionId: str(r.sessionId, 'initial'),
    ...(last ? { lastFinished: last } : {}),
  };
}

export function normalizePomodoroLog(raw: unknown): PomodoroLog {
  if (!isObj(raw)) return {};
  const log: PomodoroLog = {};
  for (const [day, v] of Object.entries(raw)) {
    if (!isDayKey(day) || !isObj(v)) continue;
    const count = Math.round(Number(v.count));
    if (!Number.isFinite(count) || count <= 0) continue;
    const mins = Number(v.minutes);
    const byTask = isObj(v.byTask)
      ? Object.fromEntries(Object.entries(v.byTask).filter(([, n]) => typeof n === 'number' && n > 0))
      : {};
    log[day] = {
      count,
      minutes: Number.isFinite(mins) && mins >= 0 ? Math.round(mins) : 0,
      ...(Object.keys(byTask).length ? { byTask: byTask as Record<string, number> } : {}),
    };
  }
  return log;
}

// ---- Habits ------------------------------------------------------------------------

function normalizeHabitSchedule(raw: unknown): HabitSchedule {
  if (isObj(raw) && raw.kind === 'days' && Array.isArray(raw.days)) {
    const days = [...new Set(raw.days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    if (days.length) return { kind: 'days', days };
  }
  if (isObj(raw) && raw.kind === 'weekly') {
    const times = Math.round(Number(raw.times));
    if (Number.isFinite(times) && times >= 1 && times <= 7) return { kind: 'weekly', times };
  }
  return { kind: 'daily' };
}

export function normalizeHabits(raw: unknown): Habit[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((h): Habit[] => {
    if (!isObj(h) || typeof h.id !== 'string' || !h.id || !isDayKey(h.createdAt)) return [];
    const kind = h.kind === 'count' || h.kind === 'avoid' ? h.kind : 'check';
    const target = Math.round(Number(h.target));
    const time = h.time === 'morning' || h.time === 'evening' ? h.time : 'anytime';
    return [
      {
        id: h.id,
        name: str(h.name, 'Habit'),
        kind,
        ...(kind === 'count' ? { target: Number.isFinite(target) && target >= 1 ? Math.min(target, 999) : 1 } : {}),
        ...(kind === 'count' && typeof h.unit === 'string' && h.unit.trim() ? { unit: h.unit.trim().slice(0, 20) } : {}),
        schedule: normalizeHabitSchedule(h.schedule),
        time,
        createdAt: h.createdAt,
        ...(isDayKey(h.archivedAt) ? { archivedAt: h.archivedAt } : {}),
      },
    ];
  });
}

export function normalizeHabitLog(raw: unknown): HabitLog {
  if (!isObj(raw)) return {};
  const log: HabitLog = {};
  for (const [day, values] of Object.entries(raw)) {
    if (!isDayKey(day) || !isObj(values)) continue;
    const kept = Object.entries(values).filter(([, v]) => typeof v === 'number' && Number.isFinite(v) && v > 0);
    if (kept.length) log[day] = Object.fromEntries(kept.map(([id, v]) => [id, Math.min(Math.round(v as number), 9999)]));
  }
  return log;
}
