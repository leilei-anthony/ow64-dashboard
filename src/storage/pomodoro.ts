import { effect, signal } from '@preact/signals';
import type { PomodoroState } from '../model/types';
import { uid } from '../model/ids';
import { chromeApi, isExtension } from '../lib/ext';
import { playChime } from '../lib/chime';
import { PHASE_LABEL, applyCommand, formatClock, remainingMs, type Command, type Effects } from '../pomodoro/engine';
import { POMODORO_MESSAGE, type PomodoroReply } from '../pomodoro/messages';
import { normalizePomodoroState } from './normalize';
import { pomodoroLogForYear, pomodoroLogKey } from './serialize';
import { POMODORO_KEY, pomodoroLog, pomodoroState, queue, settings } from './store';
import { focusView } from '../ui';

// The tab side of the timer: send commands to the background worker, keep a
// fast clock for the countdown, chime on finishes, and set the tab title.

/** Wall clock in ms, refreshed several times a second while a session runs. */
export const nowMs = signal(Date.now());

export async function sendCommand(command: Command): Promise<void> {
  if (isExtension && chromeApi?.runtime?.sendMessage) {
    const reply = (await chromeApi.runtime.sendMessage({ type: POMODORO_MESSAGE, command })) as PomodoroReply | undefined;
    // Show the result right away; the storage change that follows says the same thing.
    if (reply?.ok) pomodoroState.value = normalizePomodoroState(reply.state);
    else if (reply) console.error('OW64: pomodoro command failed', reply.error);
    return;
  }
  devApply(command);
}

// ---- `npm run dev`: no background worker, so the page runs the engine itself --

let devTimer: ReturnType<typeof setTimeout> | undefined;

function devApply(command: Command) {
  const s = settings.value;
  const e = applyCommand(pomodoroState.value, command, {
    now: Date.now(),
    settings: s.pomodoro,
    dayStartHour: s.dayStartHour,
    makeId: uid,
  });
  if (e) devCommit(e);
}

function devCommit(e: Effects) {
  pomodoroState.value = e.state;
  queue({ [POMODORO_KEY]: e.state });
  if (e.log) {
    const { day: key, minutes, taskId } = e.log;
    const day = pomodoroLog.value[key] ?? { count: 0, minutes: 0 };
    const byTask = { ...day.byTask };
    if (taskId) byTask[taskId] = (byTask[taskId] ?? 0) + 1;
    pomodoroLog.value = {
      ...pomodoroLog.value,
      [key]: { count: day.count + 1, minutes: day.minutes + minutes, ...(Object.keys(byTask).length ? { byTask } : {}) },
    };
    queue({ [pomodoroLogKey(key.slice(0, 4))]: pomodoroLogForYear(pomodoroLog.value, key.slice(0, 4)) });
  }
  clearTimeout(devTimer);
  if (e.alarmAt !== null) devTimer = setTimeout(() => devApply({ cmd: 'tick' }), Math.max(0, e.alarmAt - Date.now()) + 20);
}

// ---- Derived values ----------------------------------------------------------

export const timeLeft = (state: PomodoroState = pomodoroState.value) =>
  remainingMs(state, settings.value.pomodoro, nowMs.value);

/** Total finished pomodoros per task id, across all days. */
export function pomodorosByTask(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const day of Object.values(pomodoroLog.value)) {
    for (const [id, n] of Object.entries(day.byTask ?? {})) counts.set(id, (counts.get(id) ?? 0) + n);
  }
  return counts;
}

// ---- Start-up ----------------------------------------------------------------

/** Call once storage has loaded. */
export function startPomodoroClient() {
  const s = settings.value.pomodoro;
  // While a session runs, new tabs open straight into the focus view.
  if (s.openFocusOnNewTab && pomodoroState.value.status !== 'idle') focusView.value = true;

  let lastFinish = pomodoroState.value.lastFinished?.sessionId;
  let pinged: string | undefined;

  setInterval(() => {
    const st = pomodoroState.value;
    if (st.status !== 'running') return;
    nowMs.value = Date.now();
    // The alarm should have fired by now; nudge the worker in case it's late.
    if (st.endsAt !== undefined && Date.now() > st.endsAt + 1500 && pinged !== st.sessionId) {
      pinged = st.sessionId;
      void sendCommand({ cmd: 'tick' });
    }
  }, 250);

  effect(() => {
    const st = pomodoroState.value;
    nowMs.value = Date.now();
    // Chime once per finish, only in a visible tab, and only for a fresh one.
    const f = st.lastFinished;
    if (f && f.sessionId !== lastFinish) {
      lastFinish = f.sessionId;
      const fresh = Date.now() - f.at < 60_000;
      if (fresh && settings.value.pomodoro.chime && document.visibilityState === 'visible') {
        playChime(f.phase === 'focus' ? 'focus-done' : 'break-done');
      }
    }
  });

  // Tab title: "18:42 · Focus" while a session is on.
  effect(() => {
    const st = pomodoroState.value;
    if (st.status === 'idle') {
      document.title = 'New Tab';
      return;
    }
    const left = remainingMs(st, settings.value.pomodoro, nowMs.value);
    document.title = `${st.status === 'paused' ? '⏸ ' : ''}${formatClock(left)} · ${PHASE_LABEL[st.phase]}`;
  });
}
