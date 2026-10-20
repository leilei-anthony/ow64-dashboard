import {
  DEFAULT_SETTINGS,
  type Action,
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
