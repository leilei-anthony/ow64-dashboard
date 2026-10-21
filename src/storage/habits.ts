import type { DayKey, Habit, HabitLog } from '../model/types';
import { uid } from '../model/ids';
import { habitValue } from '../lib/habits';
import { habitLog, habits, queue, today } from './store';
import { HABITS_KEY, habitLogForYear, habitLogKey } from './serialize';

// Habit list and check-in changes. Each one updates the signal and saves only
// the storage keys it touched (the list, or one year of the log).

function saveHabits(next: Habit[]) {
  habits.value = next;
  queue({ [HABITS_KEY]: next });
}

function setValue(day: DayKey, id: string, value: number) {
  const dayValues = { ...habitLog.value[day] };
  if (value > 0) dayValues[id] = value;
  else delete dayValues[id];
  const next: HabitLog = { ...habitLog.value };
  if (Object.keys(dayValues).length) next[day] = dayValues;
  else delete next[day];
  habitLog.value = next;
  const year = day.slice(0, 4);
  queue({ [habitLogKey(year)]: habitLogForYear(next, year) });
}

export type HabitDraft = Omit<Habit, 'id' | 'createdAt' | 'archivedAt'>;

export function addHabit(draft: HabitDraft): Habit {
  const habit: Habit = { ...draft, id: uid(), createdAt: today.value };
  saveHabits([...habits.value, habit]);
  return habit;
}

export function editHabit(id: string, draft: HabitDraft) {
  saveHabits(
    habits.value.map((h) => {
      if (h.id !== id) return h;
      const { target: _t, unit: _u, ...base } = h;
      return { ...base, ...draft };
    }),
  );
}

/** Stop tracking from today on, keeping the history (and the heatmap). */
export function archiveHabit(id: string) {
  saveHabits(habits.value.map((h) => (h.id === id ? { ...h, archivedAt: today.value } : h)));
}

export function restoreHabit(id: string) {
  saveHabits(
    habits.value.map((h) => {
      if (h.id !== id) return h;
      const { archivedAt: _a, ...rest } = h;
      return rest;
    }),
  );
}

/** Remove the habit and every check-in it had. */
export function deleteHabit(id: string) {
  saveHabits(habits.value.filter((h) => h.id !== id));
  const touched = new Set<string>();
  const next: HabitLog = {};
  for (const [day, values] of Object.entries(habitLog.value)) {
    if (!(id in values)) {
      next[day] = values;
      continue;
    }
    touched.add(day.slice(0, 4));
    const { [id]: _drop, ...rest } = values;
    if (Object.keys(rest).length) next[day] = rest;
  }
  habitLog.value = next;
  for (const year of touched) queue({ [habitLogKey(year)]: habitLogForYear(next, year) });
}

/** Yes/no: tick or untick. Avoid: mark or clear a slip-up. */
export function toggleHabit(day: DayKey, id: string) {
  setValue(day, id, habitValue(habitLog.value, day, id) > 0 ? 0 : 1);
}

/** Count: one more (or one less). */
export function stepHabit(day: DayKey, id: string, by: 1 | -1) {
  setValue(day, id, Math.max(0, habitValue(habitLog.value, day, id) + by));
}

/** Drag-and-drop: move `fromId` to where `toId` is (and into its time-of-day group). */
export function reorderHabit(fromId: string, toId: string) {
  const list = habits.value;
  const from = list.findIndex((h) => h.id === fromId);
  const to = list.findIndex((h) => h.id === toId);
  if (from < 0 || to < 0 || from === to) return;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, { ...item, time: list[to].time });
  saveHabits(next);
}

/** One-click starters for an empty list. */
export const STARTER_HABITS: HabitDraft[] = [
  { name: 'Drink water', kind: 'count', target: 8, unit: 'glasses', schedule: { kind: 'daily' }, time: 'anytime' },
  { name: 'Make bed', kind: 'check', schedule: { kind: 'daily' }, time: 'morning' },
  { name: 'Take vitamins', kind: 'check', schedule: { kind: 'daily' }, time: 'morning' },
];
