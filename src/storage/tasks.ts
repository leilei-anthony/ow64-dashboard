import { batch } from '@preact/signals';
import type { DayKey, Task } from '../model/types';
import { uid } from '../model/ids';
import { desiredAutoTicks, finishIn, finishedOn, isFinished, reopenIn, starredFor } from '../lib/tasks';
import { applyAutoTicks, chart, queue, settings, tasks, today } from './store';
import { TASKS_KEY, doneTasksForYear, openTasks, tasksDoneKey } from './serialize';

/**
 * Swap in a new task list, save only the keys it touched, and bring the chart
 * ticks for every affected day back in line (linked actions, Top 3).
 */
function commit(next: Task[]) {
  const prev = tasks.value;
  if (next === prev) return;
  const before = new Map(prev.map((t) => [t.id, t]));
  const after = new Map(next.map((t) => [t.id, t]));
  const years = new Set<string>();
  const days = new Set<DayKey>();
  const touch = (t?: Task) => {
    if (!t) return;
    const finished = finishedOn(t);
    if (finished) years.add(finished.slice(0, 4));
    if (t.completedAt) days.add(t.completedAt);
    if (t.top3) days.add(t.top3);
  };
  for (const id of new Set([...before.keys(), ...after.keys()])) {
    if (before.get(id) !== after.get(id)) {
      touch(before.get(id));
      touch(after.get(id));
    }
  }

  tasks.value = next;
  const items: Record<string, unknown> = { [TASKS_KEY]: openTasks(next) };
  for (const year of years) items[tasksDoneKey(year)] = doneTasksForYear(next, year);
  queue(items);
  batch(() => {
    for (const day of days) applyAutoTicks(day, desiredAutoTicks(day, next, chart.value, settings.value.top3ActionId));
  });
}

const find = (id: string) => tasks.value.find((t) => t.id === id);
const update = (id: string, fn: (t: Task) => Task) => commit(tasks.value.map((t) => (t.id === id ? fn(t) : t)));

/** Drop keys explicitly set to undefined, so cleared fields don't linger as `undefined`. */
function clean(t: Task): Task {
  return Object.fromEntries(Object.entries(t).filter(([, v]) => v !== undefined)) as unknown as Task;
}

export function addTask(text: string) {
  const value = text.trim();
  if (!value) return;
  commit([...tasks.value, { id: uid(), text: value, createdAt: today.value, subtasks: [] }]);
}

export type TaskEdit = Partial<Pick<Task, 'text' | 'scheduledFor' | 'countdown' | 'actionId' | 'recurrence' | 'subtasks'>>;

export function editTask(id: string, patch: TaskEdit) {
  update(id, (t) => clean({ ...t, ...patch }));
}

/** Complete on `day` (the viewed day), or undo if it's already done. */
export function toggleTask(id: string, day: DayKey) {
  const t = find(id);
  if (!t) return;
  commit(t.completedAt ? reopenIn(tasks.value, id) : finishIn(tasks.value, id, day, 'completed', uid));
}

export const dropTask = (id: string) => commit(finishIn(tasks.value, id, today.value, 'dropped', uid));

/** Bring back a completed or dropped task. */
export const restoreTask = (id: string) => commit(reopenIn(tasks.value, id));

export const deleteTask = (id: string) => commit(tasks.value.filter((t) => t.id !== id));

/** Reschedule. The carry-over age restarts from the new date, and today's star is cleared. */
export function moveTask(id: string, date: DayKey) {
  update(id, ({ top3: _drop, ...t }) => ({ ...t, scheduledFor: date }));
}

/** Star / unstar as one of today's Top 3. Returns false when three are already starred. */
export function toggleStar(id: string): boolean {
  const t = find(id);
  const day = today.value;
  if (!t) return false;
  if (t.top3 === day) {
    update(id, ({ top3: _drop, ...rest }) => rest);
    return true;
  }
  if (starredFor(tasks.value, day).length >= 3) return false;
  update(id, (x) => ({ ...x, top3: day }));
  return true;
}

/** Ticking the last subtask completes the task; unticking one reopens it. */
export function toggleSubtask(id: string, subId: string, day: DayKey) {
  const t = find(id);
  if (!t) return;
  const subtasks = t.subtasks.map((s) => (s.id === subId ? { ...s, done: !s.done } : s));
  let next = tasks.value.map((x) => (x.id === id ? { ...x, subtasks } : x));
  const allDone = subtasks.length > 0 && subtasks.every((s) => s.done);
  if (allDone && !isFinished(t)) next = finishIn(next, id, day, 'completed', uid);
  else if (!allDone && t.completedAt) next = reopenIn(next, id);
  commit(next);
}

/** Drag-and-drop: move `fromId` to where `toId` is. */
export function reorderTask(fromId: string, toId: string) {
  const list = tasks.value;
  const from = list.findIndex((t) => t.id === fromId);
  const to = list.findIndex((t) => t.id === toId);
  if (from < 0 || to < 0 || from === to) return;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  commit(next);
}
