import { describe, expect, it } from 'vitest';
import { DEFAULT_POMODORO, type PomodoroSettings, type PomodoroState } from '../src/model/types';
import { IDLE, applyCommand, finishIfDue, formatClock, remainingMs, type Ctx, type Effects } from '../src/pomodoro/engine';

const MIN = 60_000;
const T0 = new Date(2026, 9, 21, 9, 0).getTime(); // Wed 9:00 local

function ctxAt(now: number, settings: Partial<PomodoroSettings> = {}): Ctx {
  let n = 0;
  return { now, settings: { ...DEFAULT_POMODORO, ...settings }, dayStartHour: 4, makeId: () => `id${now}-${++n}` };
}

const run = (state: PomodoroState, cmd: Parameters<typeof applyCommand>[1], now: number, settings = {}) =>
  applyCommand(state, cmd, ctxAt(now, settings))!;

/** Start a focus session at `at` and let it finish. */
function finishFocus(state: PomodoroState, at: number, settings = {}): Effects {
  const started = run(state, { cmd: 'start' }, at, settings).state;
  return finishIfDue(started, ctxAt(started.endsAt!, settings))!;
}

describe('start, pause, resume', () => {
  it('starts a 25-minute focus session and schedules its end', () => {
    const e = run(IDLE, { cmd: 'start' }, T0);
    expect(e.state).toMatchObject({ status: 'running', phase: 'focus', endsAt: T0 + 25 * MIN, lengthMs: 25 * MIN });
    expect(e.alarmAt).toBe(T0 + 25 * MIN);
    expect(remainingMs(e.state, DEFAULT_POMODORO, T0 + 60_000)).toBe(24 * MIN);
  });

  it('pause keeps the time left, and resume picks it up', () => {
    const running = run(IDLE, { cmd: 'start' }, T0).state;
    const paused = run(running, { cmd: 'toggle' }, T0 + 10 * MIN);
    expect(paused.state).toMatchObject({ status: 'paused', remainingMs: 15 * MIN });
    expect(paused.state.endsAt).toBeUndefined();
    expect(paused.alarmAt).toBeNull();
    // An hour later, resume: still 15 minutes to go.
    const resumed = run(paused.state, { cmd: 'toggle' }, T0 + 70 * MIN);
    expect(resumed.state.endsAt).toBe(T0 + 85 * MIN);
    expect(resumed.state.lengthMs).toBe(25 * MIN);
  });

  it('reset goes back to a full, idle session of the same mode', () => {
    const running = run(IDLE, { cmd: 'start' }, T0).state;
    const e = run(running, { cmd: 'reset' }, T0 + 5 * MIN);
    expect(e.state.status).toBe('idle');
    expect(remainingMs(e.state, DEFAULT_POMODORO, T0 + 5 * MIN)).toBe(25 * MIN);
    expect(e.alarmAt).toBeNull();
  });

  it('formats the countdown', () => {
    expect(formatClock(25 * MIN)).toBe('25:00');
    expect(formatClock(61_500)).toBe('01:02'); // rounds up, so 00:00 only at the very end
    expect(formatClock(0)).toBe('00:00');
  });
});

describe('finishing sessions', () => {
  it('a finished focus session is logged, counted in the set, and starts a short break', () => {
    const e = finishFocus(run(IDLE, { cmd: 'task', taskId: 't1' }, T0).state, T0);
    expect(e.log).toEqual({ day: '2026-10-21', minutes: 25, taskId: 't1' });
    expect(e.state).toMatchObject({ phase: 'short', status: 'running', cycle: 1, taskId: 't1' });
    expect(e.state.lastFinished).toMatchObject({ phase: 'focus', at: T0 + 25 * MIN });
    expect(e.notify?.title).toBe('Pomodoro done');
  });

  it('is safe to call twice: the second call does nothing', () => {
    const e = finishFocus(IDLE, T0);
    expect(finishIfDue(e.state, ctxAt(T0 + 25 * MIN))).toBeNull();
  });

  it('does nothing before the time is up', () => {
    const running = run(IDLE, { cmd: 'start' }, T0).state;
    expect(finishIfDue(running, ctxAt(T0 + 25 * MIN - 1))).toBeNull();
  });

  it('gives a long break after the 4th, then starts a new set', () => {
    let state = IDLE;
    let at = T0;
    for (let i = 1; i <= 4; i++) {
      const e = finishFocus(state, at);
      expect(e.state.cycle).toBe(i);
      expect(e.state.phase).toBe(i === 4 ? 'long' : 'short');
      // Finish the break (auto-started) to get back to focus.
      const brk = finishIfDue(e.state, ctxAt(e.state.endsAt!))!;
      state = brk.state;
      at = e.state.endsAt!;
    }
    expect(state).toMatchObject({ phase: 'focus', cycle: 0, status: 'idle' }); // after the long break
  });

  it('auto-start can be turned off for breaks, and on for focus', () => {
    const noBreak = finishFocus(IDLE, T0, { autoStartBreaks: false });
    expect(noBreak.state).toMatchObject({ phase: 'short', status: 'idle' });
    expect(noBreak.alarmAt).toBeNull();

    const brk = finishFocus(IDLE, T0).state;
    const back = finishIfDue(brk, ctxAt(brk.endsAt!, { autoStartFocus: true }))!;
    expect(back.state).toMatchObject({ phase: 'focus', status: 'running' });
    expect(back.notify?.title).toBe('Break over');
    expect(back.log).toBeUndefined();
  });

  it('counts a late night pomodoro on the tracking day (before 4 AM is still yesterday)', () => {
    const late = new Date(2026, 9, 22, 3, 30).getTime() - 25 * MIN; // ends 3:30 AM Thursday
    expect(finishFocus(IDLE, late).log?.day).toBe('2026-10-21');
  });

  it('counts the time it actually ended, even if the alarm is late', () => {
    const running = run(IDLE, { cmd: 'start' }, T0).state;
    const e = finishIfDue(running, ctxAt(T0 + 3 * 60 * MIN))!; // computer slept for hours
    expect(e.state.lastFinished?.at).toBe(T0 + 25 * MIN);
    expect(e.state.endsAt).toBe(T0 + 3 * 60 * MIN + 5 * MIN); // the break starts now, not in the past
  });

  it('a session keeps its length if settings change midway', () => {
    const running = run(IDLE, { cmd: 'start' }, T0).state;
    const e = finishIfDue(running, ctxAt(running.endsAt!, { focusMin: 50 }))!;
    expect(e.log?.minutes).toBe(25);
  });
});

describe('skip and mode picking', () => {
  it('skipping focus moves to a break without counting it or announcing it', () => {
    const running = run(IDLE, { cmd: 'start' }, T0).state;
    const e = run(running, { cmd: 'skip' }, T0 + 3 * MIN);
    expect(e.state).toMatchObject({ phase: 'short', cycle: 0 });
    expect(e.log).toBeUndefined();
    expect(e.notify).toBeUndefined();
    expect(e.state.lastFinished).toBeUndefined();
  });

  it('picking a mode by hand makes it idle at full length', () => {
    const running = run(IDLE, { cmd: 'start' }, T0).state;
    const e = run(running, { cmd: 'phase', phase: 'long' }, T0 + MIN);
    expect(e.state).toMatchObject({ phase: 'long', status: 'idle' });
    expect(remainingMs(e.state, DEFAULT_POMODORO, T0 + MIN)).toBe(15 * MIN);
    expect(e.alarmAt).toBeNull();
  });

  it('changing the focused task keeps the timer running', () => {
    const running = run(IDLE, { cmd: 'start' }, T0).state;
    const e = run(running, { cmd: 'task', taskId: 'x' }, T0 + MIN);
    expect(e.state).toMatchObject({ status: 'running', taskId: 'x', endsAt: running.endsAt });
    expect(e.alarmAt).toBe(running.endsAt);
    expect(run(e.state, { cmd: 'task' }, T0 + MIN).state.taskId).toBeUndefined();
  });
});

describe('stored timer data', () => {
  it('falls back to idle when a saved session is incomplete', async () => {
    const { normalizePomodoroState } = await import('../src/storage/normalize');
    expect(normalizePomodoroState({ status: 'running', phase: 'short' })).toMatchObject({ status: 'idle', phase: 'short' });
    expect(normalizePomodoroState({ status: 'paused', remainingMs: 1000, phase: 'nap' })).toMatchObject({ status: 'paused', phase: 'focus', remainingMs: 1000 });
    expect(normalizePomodoroState(undefined)).toEqual(IDLE);
  });

  it('keeps sensible lengths and drops broken ones', async () => {
    const { normalizePomodoroSettings } = await import('../src/storage/normalize');
    expect(normalizePomodoroSettings({ focusMin: 50, longEvery: 3 })).toMatchObject({ focusMin: 50, shortMin: 5, longEvery: 3 });
    expect(normalizePomodoroSettings({ focusMin: -1, shortMin: 'x', longEvery: 40 })).toEqual(DEFAULT_POMODORO);
  });

  it('drops empty or malformed log days', async () => {
    const { normalizePomodoroLog } = await import('../src/storage/normalize');
    expect(normalizePomodoroLog({ '2026-10-21': { count: 2, minutes: 50, byTask: { a: 2, b: 0 } }, '2026-10-22': { count: 0 }, nope: { count: 1 } })).toEqual({
      '2026-10-21': { count: 2, minutes: 50, byTask: { a: 2 } },
    });
  });
});
