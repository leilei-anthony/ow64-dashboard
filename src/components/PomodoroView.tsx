import { useState } from 'preact/hooks';
import type { PomodoroPhase } from '../model/types';
import { pomodoroState, settings, tasks, today, updateSettings } from '../storage/store';
import { addTask, cycleTask } from '../storage/tasks';
import { pomodorosByTask, sendCommand, timeLeft } from '../storage/pomodoro';
import { formatClock } from '../pomodoro/engine';
import { isCurrent, isFinished, sortForDay, taskStatus } from '../lib/tasks';
import { primeAudio } from '../lib/chime';
import { chromeApi } from '../lib/ext';
import { focusView } from '../ui';
import { IconPlus, IconX } from './icons';
import { TaskStatusBox } from './TaskStatusBox';

const PHASES: PomodoroPhase[] = ['focus', 'short', 'long'];
const MODE_LABEL: Record<PomodoroPhase, string> = { focus: 'Pomodoro', short: 'Short break', long: 'Long break' };

/** Start / pause (button or Space). The first Start also asks once for notification permission. */
export function startOrPause() {
  if (pomodoroState.value.status !== 'running') {
    primeAudio(); // this click lets the tab play the chime later
    const ps = settings.value.pomodoro;
    if (!ps.askedNotify) {
      // Must be called during the click itself, before any await, or the browser won't ask.
      chromeApi?.permissions?.request({ permissions: ['notifications'] }).catch(() => false);
      updateSettings({ pomodoro: { ...ps, askedNotify: true } });
    }
  }
  void sendCommand({ cmd: 'toggle' });
}

function FocusTasks() {
  const day = today.value;
  const st = pomodoroState.value;
  const all = tasks.value;
  const open = sortForDay(all.filter((t) => isCurrent(t, day)), day);
  const doneToday = all.filter((t) => t.completedAt === day);
  const counts = pomodorosByTask();
  const [text, setText] = useState('');

  const count = (id: string) =>
    counts.get(id) ? (
      <span class="pomo-count" title="Pomodoros spent on this task">
        🍅 {counts.get(id)}
      </span>
    ) : null;

  return (
    <section class="pomo-tasks" aria-label="Today's tasks">
      <h2>Today’s tasks</h2>
      {open.length + doneToday.length > 0 ? (
        <ul>
          {open.map((t) => {
            const on = t.id === st.taskId;
            return (
              <li key={t.id} class={`pomo-task${on ? ' is-focus' : ''}`}>
                <TaskStatusBox
                  task={t}
                  onCycle={() => {
                    const finishing = taskStatus(t) === 'partial'; // [/] → [x]
                    cycleTask(t.id, day);
                    if (on && finishing) void sendCommand({ cmd: 'task' });
                  }}
                />
                <button
                  type="button"
                  class="pomo-task-text"
                  aria-pressed={on}
                  title={on ? 'Stop focusing on this' : 'Focus on this'}
                  onClick={() => void sendCommand({ cmd: 'task', taskId: on ? undefined : t.id })}
                >
                  {t.top3 === day && <span class="pomo-star">★ </span>}
                  {t.text}
                </button>
                {count(t.id)}
              </li>
            );
          })}
          {doneToday.map((t) => (
            <li key={t.id} class="pomo-task is-done">
              <TaskStatusBox task={t} onCycle={() => cycleTask(t.id, day)} />
              <span class="pomo-task-text">{t.text}</span>
              {count(t.id)}
            </li>
          ))}
        </ul>
      ) : (
        <p class="pomo-empty">Nothing on today’s list.</p>
      )}
      <form
        class="task-add pomo-add"
        onSubmit={(e) => {
          e.preventDefault();
          addTask(text);
          setText('');
        }}
      >
        <IconPlus width={15} height={15} />
        <input
          value={text}
          placeholder="Add a task…"
          aria-label="Add a task"
          autoComplete="off"
          onInput={(e) => setText(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
        />
      </form>
    </section>
  );
}

export function PomodoroView() {
  const st = pomodoroState.value;
  const ps = settings.value.pomodoro;
  const left = timeLeft(st);
  const label = st.status === 'running' ? 'Pause' : st.status === 'paused' ? 'Resume' : 'Start';
  const focused = st.taskId ? tasks.value.find((t) => t.id === st.taskId) : undefined;
  const working = focused && !isFinished(focused) ? focused : undefined;

  return (
    <div class={`pomo phase-${st.phase}`}>
      <button
        type="button"
        class="icon-btn pomo-close"
        aria-label="Back to the dashboard (Esc)"
        title="Back to the dashboard (Esc)"
        onClick={() => (focusView.value = false)}
      >
        <IconX />
      </button>

      <main class="pomo-main">
        <div class="pomo-modes" role="tablist" aria-label="Mode">
          {PHASES.map((p) => (
            <button
              key={p}
              type="button"
              role="tab"
              aria-selected={st.phase === p}
              class={`pomo-mode${st.phase === p ? ' is-on' : ''}`}
              onClick={() => void sendCommand({ cmd: 'phase', phase: p })}
            >
              {MODE_LABEL[p]}
            </button>
          ))}
        </div>

        <div class="pomo-time" role="timer" aria-label={`${formatClock(left)} left`}>
          {formatClock(left)}
        </div>

        <div class="pomo-controls">
          <button type="button" class="pomo-start" onClick={startOrPause}>
            {label}
          </button>
          <button type="button" class="btn" disabled={st.status === 'idle'} onClick={() => void sendCommand({ cmd: 'reset' })}>
            Reset
          </button>
          <button type="button" class="btn" title="Skip to the next mode (S)" onClick={() => void sendCommand({ cmd: 'skip' })}>
            Skip →
          </button>
        </div>

        <div class="pomo-set" role="img" aria-label={`${Math.min(st.cycle, ps.longEvery)} of ${ps.longEvery} pomodoros in this set`}>
          {Array.from({ length: ps.longEvery }, (_, i) => (
            <span key={i} class={i < st.cycle ? 'is-done' : ''}>
              {i < st.cycle ? '✓' : '○'}
            </span>
          ))}
        </div>

        <p class="pomo-working">
          {working ? (
            <>
              Working on <strong>{working.text}</strong>{' '}
              <button type="button" class="link-btn" onClick={() => void sendCommand({ cmd: 'task' })}>
                clear
              </button>
            </>
          ) : (
            'Pick a task below to focus on it.'
          )}
        </p>

        <FocusTasks />
        <p class="pomo-hints">Space start / pause · S skip · Esc dashboard</p>
      </main>
    </div>
  );
}
