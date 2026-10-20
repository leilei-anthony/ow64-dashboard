import { useState } from 'preact/hooks';
import { chart, countdowns, setCountdowns, tasks, today } from '../storage/store';
import { editTask } from '../storage/tasks';
import { uid } from '../model/ids';
import { daysBetween, formatDay, isDayKey } from '../lib/dates';
import { isFinished } from '../lib/tasks';
import { editTarget, taskDialog } from '../ui';
import { IconCheckSquare, IconPlus, IconX } from './icons';

interface Item {
  id: string;
  label: string;
  date: string;
  /** Set when the countdown comes from a task with "Show it in Countdowns". */
  taskId?: string;
}

function describe(days: number): string {
  if (days === 0) return 'Today';
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} ago`;
  return days >= 14 ? `${Math.floor(days / 7)} weeks` : days === 1 ? 'Tomorrow' : `${days} days`;
}

const fullDate = (key: string) => formatDay(key, { month: 'short', day: 'numeric', year: 'numeric' });

export function Countdowns() {
  const goal = chart.value.goal;
  const fromTasks: Item[] = tasks.value
    .filter((t) => t.countdown && t.scheduledFor && !isFinished(t))
    .map((t) => ({ id: `task-${t.id}`, label: t.text, date: t.scheduledFor!, taskId: t.id }));
  const list: Item[] = [...countdowns.value, ...fromTasks].sort((a, b) => a.date.localeCompare(b.date));
  const remove = (c: Item) =>
    c.taskId
      ? editTask(c.taskId, { countdown: undefined })
      : setCountdowns(countdowns.value.filter((x) => x.id !== c.id));
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState('');
  const [date, setDate] = useState('');

  const goalDays = goal.targetDate ? daysBetween(today.value, goal.targetDate) : null;

  const add = (e: Event) => {
    e.preventDefault();
    if (!label.trim() || !isDayKey(date)) return;
    setCountdowns([...countdowns.value, { id: uid(), label: label.trim(), date }]);
    setLabel('');
    setDate('');
    setAdding(false);
  };

  return (
    <section class="panel">
      <h2>Countdowns</h2>
      {goalDays !== null ? (
        <div class="cd-hero">
          <div class="cd-hero-num">{goalDays.toLocaleString()}</div>
          <div class="cd-hero-text">
            <div>days{goalDays >= 14 ? ` · ${Math.floor(goalDays / 7)} weeks` : ''} to go</div>
            <div class="muted">
              {goal.text} · {fullDate(goal.targetDate!)}
            </div>
          </div>
        </div>
      ) : (
        <button type="button" class="btn btn-small" onClick={() => (editTarget.value = { kind: 'goal' })}>
          Set a target date for your goal
        </button>
      )}

      {list.length > 0 && (
        <ul class="cd-list">
          {list.map((c) => {
            const days = daysBetween(today.value, c.date);
            return (
              <li key={c.id} class={days < 0 ? 'is-past' : ''}>
                {c.taskId ? (
                  <button
                    type="button"
                    class="cd-label cd-task"
                    title="Task: click to edit"
                    onClick={() => (taskDialog.value = { id: c.taskId! })}
                  >
                    <IconCheckSquare width={12} height={12} /> {c.label}
                  </button>
                ) : (
                  <span class="cd-label">{c.label}</span>
                )}
                <span class="cd-date muted">{fullDate(c.date)}</span>
                <span class="cd-days">{describe(days)}</span>
                <button
                  type="button"
                  class="icon-btn icon-btn-small"
                  aria-label={c.taskId ? `Stop counting down to ${c.label}` : `Remove ${c.label}`}
                  onClick={() => remove(c)}
                >
                  <IconX width={14} height={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <form class="cd-form" onSubmit={add}>
          <input
            value={label}
            placeholder="e.g. JLPT N2"
            aria-label="Countdown name"
            autoFocus
            onInput={(e) => setLabel(e.currentTarget.value)}
          />
          <input type="date" value={date} aria-label="Date" onInput={(e) => setDate(e.currentTarget.value)} />
          <button type="submit" class="btn btn-small btn-primary" disabled={!label.trim() || !isDayKey(date)}>
            Add
          </button>
          <button type="button" class="btn btn-small" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button type="button" class="link-btn" onClick={() => setAdding(true)}>
          <IconPlus width={14} height={14} /> Add countdown
        </button>
      )}
    </section>
  );
}
