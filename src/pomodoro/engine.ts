import type { DayKey, PomodoroPhase, PomodoroSettings, PomodoroState } from '../model/types';
import { logicalDay } from '../lib/dates';

// The pomodoro timer as pure functions. Each command returns the next state plus
// what the caller must do: schedule or clear the end-of-session alarm, log a
// finished focus session, and show a notification. The background worker is the
// only caller in the extension; the page uses it directly only in `npm run dev`.

export interface Ctx {
  now: number;
  settings: PomodoroSettings;
  dayStartHour: number;
  makeId: () => string;
}

export interface Effects {
  state: PomodoroState;
  /** epoch ms to (re)schedule the end-of-session alarm, or null to clear it. */
  alarmAt: number | null;
  log?: { day: DayKey; minutes: number; taskId?: string };
  notify?: { title: string; message: string };
}

export type Command =
  | { cmd: 'start' }
  | { cmd: 'pause' }
  | { cmd: 'toggle' }
  | { cmd: 'reset' }
  | { cmd: 'skip' }
  | { cmd: 'phase'; phase: PomodoroPhase }
  | { cmd: 'task'; taskId?: string }
  | { cmd: 'tick' };

export const IDLE: PomodoroState = { phase: 'focus', status: 'idle', cycle: 0, sessionId: 'initial' };

export const PHASE_LABEL: Record<PomodoroPhase, string> = {
  focus: 'Focus',
  short: 'Short break',
  long: 'Long break',
};

export function durationMs(phase: PomodoroPhase, s: PomodoroSettings): number {
  const min = phase === 'focus' ? s.focusMin : phase === 'short' ? s.shortMin : s.longMin;
  return Math.round(min * 60_000);
}

/** Time left in the current session (full length when idle). */
export function remainingMs(state: PomodoroState, s: PomodoroSettings, now: number): number {
  if (state.status === 'running') return Math.max(0, (state.endsAt ?? now) - now);
  if (state.status === 'paused') return state.remainingMs ?? 0;
  return durationMs(state.phase, s);
}

/** Drop the per-session fields when going idle. */
function idle(state: PomodoroState, patch: Partial<PomodoroState>): PomodoroState {
  const { endsAt: _e, remainingMs: _r, lengthMs: _l, ...rest } = state;
  return { ...rest, ...patch, status: 'idle' };
}

function run(state: PomodoroState, ctx: Ctx, lengthMs: number, remaining = lengthMs): Effects {
  const { remainingMs: _r, ...rest } = state;
  const endsAt = ctx.now + remaining;
  return { state: { ...rest, status: 'running', endsAt, lengthMs, sessionId: ctx.makeId() }, alarmAt: endsAt };
}

const keep = (state: PomodoroState): Effects => ({
  state,
  alarmAt: state.status === 'running' ? state.endsAt! : null,
});

export function start(state: PomodoroState, ctx: Ctx): Effects {
  if (state.status === 'running') return keep(state);
  if (state.status === 'paused') {
    const lengthMs = state.lengthMs ?? durationMs(state.phase, ctx.settings);
    return run(state, ctx, lengthMs, state.remainingMs ?? lengthMs);
  }
  return run(state, ctx, durationMs(state.phase, ctx.settings));
}

export function pause(state: PomodoroState, ctx: Ctx): Effects {
  if (state.status !== 'running') return keep(state);
  const { endsAt: _e, ...rest } = state;
  return { state: { ...rest, status: 'paused', remainingMs: Math.max(0, (state.endsAt ?? ctx.now) - ctx.now) }, alarmAt: null };
}

export function reset(state: PomodoroState, ctx: Ctx): Effects {
  return { state: idle(state, { sessionId: ctx.makeId() }), alarmAt: null };
}

/** Pick a mode by hand. The set count stays as it is. */
export function selectPhase(state: PomodoroState, phase: PomodoroPhase, ctx: Ctx): Effects {
  return { state: idle(state, { phase, sessionId: ctx.makeId() }), alarmAt: null };
}

export function setTask(state: PomodoroState, taskId: string | undefined): Effects {
  const { taskId: _t, ...rest } = state;
  return keep(taskId ? { ...rest, taskId } : rest);
}

/**
 * Move to the next mode. `finished` is true when the session ran out on its own:
 * only then does a focus session join the set and the log, and a notification go
 * out. Skipping moves on quietly. Auto-start follows the settings either way.
 */
function advance(state: PomodoroState, ctx: Ctx, finished: boolean, at: number): Effects {
  const s = ctx.settings;
  const wasFocus = state.phase === 'focus';
  const counted = wasFocus && finished;
  const cycle = wasFocus ? state.cycle + (counted ? 1 : 0) : state.phase === 'long' ? 0 : state.cycle;
  const next: PomodoroPhase = wasFocus ? (counted && cycle >= s.longEvery ? 'long' : 'short') : 'focus';
  const autoStart = wasFocus ? s.autoStartBreaks : s.autoStartFocus;

  const base = idle(state, {
    phase: next,
    cycle,
    sessionId: ctx.makeId(),
    ...(finished ? { lastFinished: { sessionId: state.sessionId, phase: state.phase, at } } : {}),
  });
  const effects: Effects = autoStart ? run(base, ctx, durationMs(next, s)) : { state: base, alarmAt: null };
  if (!finished) return effects;

  if (counted) {
    effects.log = {
      day: logicalDay(new Date(at), ctx.dayStartHour),
      minutes: Math.round((state.lengthMs ?? durationMs('focus', s)) / 60_000),
      ...(state.taskId ? { taskId: state.taskId } : {}),
    };
    effects.notify =
      next === 'long'
        ? { title: 'Pomodoro done: long break', message: `That's ${s.longEvery} in a row. Take ${s.longMin} minutes.` }
        : { title: 'Pomodoro done', message: `Take a ${s.shortMin}-minute break.` };
  } else {
    effects.notify = { title: 'Break over', message: `Ready for the next ${s.focusMin}-minute focus?` };
  }
  return effects;
}

/** Skip to the next mode. A skipped focus session isn't counted, and nothing is announced. */
export function skip(state: PomodoroState, ctx: Ctx): Effects {
  return advance(state, ctx, false, ctx.now);
}

/**
 * Finish the running session if its time is up; otherwise nothing changes.
 * Safe to call any number of times (alarm, page fallback, browser restart).
 * The finish counts at the moment the session ended, even if the alarm was late.
 */
export function finishIfDue(state: PomodoroState, ctx: Ctx): Effects | null {
  if (state.status !== 'running' || state.endsAt === undefined || state.endsAt > ctx.now) return null;
  return advance(state, ctx, true, state.endsAt);
}

export function applyCommand(state: PomodoroState, command: Command, ctx: Ctx): Effects | null {
  switch (command.cmd) {
    case 'start':
      return start(state, ctx);
    case 'pause':
      return pause(state, ctx);
    case 'toggle':
      return state.status === 'running' ? pause(state, ctx) : start(state, ctx);
    case 'reset':
      return reset(state, ctx);
    case 'skip':
      return skip(state, ctx);
    case 'phase':
      return selectPhase(state, command.phase, ctx);
    case 'task':
      return setTask(state, command.taskId);
    case 'tick':
      return finishIfDue(state, ctx);
  }
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
