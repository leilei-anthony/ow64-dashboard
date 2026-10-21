// Background service worker: the single owner of the pomodoro timer.
// Tabs send commands; this applies them with the pure engine, keeps the
// end-of-session alarm, records finished pomodoros and shows notifications.
// Running one writer means a tab and the worker can never race each other.

import type { PomodoroState } from './model/types';
import { uid } from './model/ids';
import { chromeApi } from './lib/ext';
import { applyCommand, finishIfDue, type Command, type Ctx, type Effects } from './pomodoro/engine';
import { normalizePomodoroLog, normalizePomodoroState, normalizeSettings } from './storage/normalize';
import { pomodoroLogKey } from './storage/serialize';
import { POMODORO_MESSAGE, type PomodoroMessage } from './pomodoro/messages';

const chrome = chromeApi!;
const STATE_KEY = 'pomodoro';
const ALARM = 'pomodoro-end';
const NOTIFICATION = 'pomodoro';

interface WorkerGlobal {
  clients: { matchAll(o: { type: 'window'; includeUncontrolled: boolean }): Promise<{ visibilityState?: string }[]> };
}

// Storage reads and writes are async, so run one operation at a time.
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => {});
  return next;
}

async function load(): Promise<{ state: PomodoroState; ctx: Ctx }> {
  const items = await chrome.storage!.local.get([STATE_KEY, 'settings']);
  const settings = normalizeSettings(items.settings);
  return {
    state: normalizePomodoroState(items[STATE_KEY]),
    ctx: { now: Date.now(), settings: settings.pomodoro, dayStartHour: settings.dayStartHour, makeId: uid },
  };
}

async function commit(e: Effects): Promise<void> {
  const writes: Record<string, unknown> = { [STATE_KEY]: e.state };
  if (e.log) {
    const key = pomodoroLogKey(e.log.day.slice(0, 4));
    const year = normalizePomodoroLog((await chrome.storage!.local.get(key))[key]);
    const day = year[e.log.day] ?? { count: 0, minutes: 0 };
    const byTask = { ...day.byTask };
    if (e.log.taskId) byTask[e.log.taskId] = (byTask[e.log.taskId] ?? 0) + 1;
    year[e.log.day] = {
      count: day.count + 1,
      minutes: day.minutes + e.log.minutes,
      ...(Object.keys(byTask).length ? { byTask } : {}),
    };
    writes[key] = year;
  }
  await chrome.storage!.local.set(writes);
  if (e.alarmAt === null) await chrome.alarms!.clear(ALARM);
  else await chrome.alarms!.create(ALARM, { when: e.alarmAt });
  if (e.notify) await notify(e.notify.title, e.notify.message);
}

/** A desktop notification, if allowed. Silent when a dashboard tab is visible (that tab chimes instead). */
async function notify(title: string, message: string): Promise<void> {
  const allowed = await chrome.permissions?.contains({ permissions: ['notifications'] }).catch(() => false);
  if (!allowed || !chrome.notifications) return;
  const tabs = await (globalThis as unknown as WorkerGlobal).clients.matchAll({ type: 'window', includeUncontrolled: true });
  const visible = tabs.some((c) => c.visibilityState === 'visible');
  await chrome.notifications.clear(NOTIFICATION).catch(() => false);
  await chrome.notifications
    .create(NOTIFICATION, {
      type: 'basic',
      iconUrl: chrome.runtime!.getURL('icons/icon128.png'),
      title,
      message,
      silent: visible,
      priority: 2,
    })
    .catch(() => '');
}

/** Finish the session if it's due (alarm fired, browser restarted, or a tab noticed it's late). */
const tick = () =>
  serial(async () => {
    const { state, ctx } = await load();
    const e = finishIfDue(state, ctx);
    if (e) await commit(e);
  });

chrome.runtime!.onMessage!.addListener((message, _sender, sendResponse) => {
  const m = message as PomodoroMessage;
  if (m?.type !== POMODORO_MESSAGE) return;
  serial(async () => {
    const { state, ctx } = await load();
    const e = applyCommand(state, m.command as Command, ctx);
    if (e) await commit(e);
    return e?.state ?? state;
  }).then(
    (state) => sendResponse({ ok: true, state }),
    (err) => sendResponse({ ok: false, error: String(err) }),
  );
  return true; // respond asynchronously
});

chrome.alarms!.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) void tick();
});
chrome.runtime!.onStartup?.addListener(() => void tick());
chrome.runtime!.onInstalled?.addListener(() => void tick());
// Clicking the notification opens a new tab, which is the dashboard (in focus view while a session runs).
chrome.notifications?.onClicked.addListener(() => void chrome.tabs?.create({}));
