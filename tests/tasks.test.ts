import { describe, expect, it } from 'vitest';
import type { Task } from '../src/model/types';
import { seedChart } from '../src/model/seed';
import { replaceAction } from '../src/model/chartOps';
import { logicalDay } from '../src/lib/dates';
import {
  carriedDays,
  desiredAutoTicks,
  finishIn,
  isCurrent,
  isStale,
  isUpcoming,
  nextOccurrence,
  reconcileAutoTicks,
  recurrenceLabel,
  reopenIn,
  resolveTop3Action,
  sortForDay,
} from '../src/lib/tasks';

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1',
  text: 'Email advisor',
  createdAt: '2026-10-14',
  subtasks: [],
  ...over,
});

let n = 0;
const makeId = () => `new${++n}`;

describe('carry-over', () => {
  it('shows an open task on every day from its start, with its age', () => {
    const t = task();
    expect(isCurrent(t, '2026-10-13')).toBe(false);
    expect(isCurrent(t, '2026-10-14')).toBe(true);
    expect(isCurrent(t, '2026-10-20')).toBe(true);
    expect(carriedDays(t, '2026-10-14')).toBe(0);
    expect(carriedDays(t, '2026-10-17')).toBe(3);
  });

  it('rolls over at the 4 AM day start, not midnight', () => {
    const t = task();
    const at = (h: number, m: number) => logicalDay(new Date(2026, 9, 15, h, m), 4);
    expect(carriedDays(t, at(3, 59))).toBe(0);
    expect(carriedDays(t, at(4, 0))).toBe(1);
  });

  it('counts age from the scheduled date and hides the task until then', () => {
    const t = task({ scheduledFor: '2026-10-20' });
    expect(isUpcoming(t, '2026-10-19')).toBe(true);
    expect(isCurrent(t, '2026-10-19')).toBe(false);
    expect(carriedDays(t, '2026-10-22')).toBe(2);
  });

  it('flags stale tasks at the threshold, or never when it is 0', () => {
    const t = task();
    expect(isStale(t, '2026-10-20', 7)).toBe(false);
    expect(isStale(t, '2026-10-21', 7)).toBe(true);
    expect(isStale(t, '2027-10-21', 0)).toBe(false);
  });

  it('finished tasks are no longer current', () => {
    expect(isCurrent(task({ completedAt: '2026-10-15' }), '2026-10-16')).toBe(false);
    expect(isCurrent(task({ droppedAt: '2026-10-15' }), '2026-10-16')).toBe(false);
  });
});

describe('nextOccurrence', () => {
  it('finds the next matching weekday, strictly after the given day', () => {
    const rule = { kind: 'weekly' as const, days: [1, 4] }; // Mon, Thu
    expect(nextOccurrence(rule, '2026-10-12')).toBe('2026-10-15'); // Mon → Thu
    expect(nextOccurrence(rule, '2026-10-15')).toBe('2026-10-19'); // Thu → Mon
    expect(nextOccurrence(rule, '2026-10-17')).toBe('2026-10-19'); // Sat → Mon
  });

  it('uses the last day of shorter months for day 31', () => {
    const rule = { kind: 'monthly' as const, day: 31 };
    expect(nextOccurrence(rule, '2027-01-31')).toBe('2027-02-28');
    expect(nextOccurrence(rule, '2028-02-01')).toBe('2028-02-29');
    expect(nextOccurrence(rule, '2026-12-31')).toBe('2027-01-31');
  });

  it('stays in the month when the day is still ahead', () => {
    expect(nextOccurrence({ kind: 'monthly', day: 15 }, '2026-10-14')).toBe('2026-10-15');
    expect(nextOccurrence({ kind: 'monthly', day: 1 }, '2026-10-14')).toBe('2026-11-01');
  });

  it('labels rules in week order', () => {
    expect(recurrenceLabel({ kind: 'weekly', days: [4, 1] }, 1)).toBe('Mon, Thu');
    expect(recurrenceLabel({ kind: 'weekly', days: [0, 1] }, 1)).toBe('Mon, Sun');
    expect(recurrenceLabel({ kind: 'monthly', day: 1 }, 1)).toBe('Monthly on the 1st');
    expect(recurrenceLabel({ kind: 'monthly', day: 22 }, 1)).toBe('Monthly on the 22nd');
  });
});

describe('finishing and reopening', () => {
  const weekly = task({
    recurrence: { kind: 'weekly', days: [1] },
    scheduledFor: '2026-10-12',
    subtasks: [{ id: 's1', text: 'Milk', done: true }],
    actionId: 'a1',
  });

  it('completes a plain task without spawning anything', () => {
    const next = finishIn([task()], 't1', '2026-10-15', 'completed', makeId);
    expect(next).toEqual([task({ completedAt: '2026-10-15' })]);
  });

  it('spawns one next instance for a recurring task, without stacking after a late finish', () => {
    // Monday task finished 8 days late (Tue 20th): the next one is Mon 26th, not the missed 19th.
    const next = finishIn([weekly], 't1', '2026-10-20', 'completed', makeId);
    expect(next).toHaveLength(2);
    const [done, spawned] = next;
    expect(done.completedAt).toBe('2026-10-20');
    expect(done.spawnedId).toBe(spawned.id);
    expect(spawned).toMatchObject({ scheduledFor: '2026-10-26', createdAt: '2026-10-20', actionId: 'a1' });
    expect(spawned.subtasks.map((s) => s.done)).toEqual([false]);
    // Finishing again is a no-op.
    expect(finishIn(next, 't1', '2026-10-21', 'completed', makeId)).toBe(next);
  });

  it('drop also moves a recurring task on', () => {
    const next = finishIn([weekly], 't1', '2026-10-12', 'dropped', makeId);
    expect(next[0].droppedAt).toBe('2026-10-12');
    expect(next[1].scheduledFor).toBe('2026-10-19');
  });

  it('undo removes an untouched spawned instance', () => {
    const done = finishIn([weekly], 't1', '2026-10-12', 'completed', makeId);
    expect(reopenIn(done, 't1')).toEqual([weekly]);
  });

  it('undo keeps a spawned instance that was already edited, and remembers it', () => {
    const done = finishIn([weekly], 't1', '2026-10-12', 'completed', makeId);
    const edited = done.map((t) => (t.id === done[0].spawnedId ? { ...t, text: 'Groceries + bread' } : t));
    const reopened = reopenIn(edited, 't1');
    expect(reopened).toHaveLength(2);
    expect(reopened[0].completedAt).toBeUndefined();
    expect(reopened[0].spawnedId).toBe(done[0].spawnedId);
    // Completing it again doesn't spawn a second copy.
    expect(finishIn(reopened, 't1', '2026-10-13', 'completed', makeId)).toHaveLength(2);
  });
});

describe('Top 3 and auto-ticks', () => {
  const chart = seedChart('2026-10-01');
  const writing = chart.pillars[4].actions[1]; // Weekly writing quota
  const top3 = chart.pillars[6].actions[2]; // Daily top 3
  const D = '2026-10-15';

  it('finds "Daily top 3" automatically, or honours the setting', () => {
    expect(resolveTop3Action(chart, 'auto')).toBe(top3.id);
    expect(resolveTop3Action(chart, 'none')).toBeUndefined();
    expect(resolveTop3Action(chart, writing.id)).toBe(writing.id);
    expect(resolveTop3Action(chart, 'missing')).toBeUndefined();
  });

  it('wants the linked action of every task completed that day', () => {
    const tasks = [
      task({ id: 'a', actionId: writing.id, completedAt: D }),
      task({ id: 'b', actionId: writing.id, completedAt: '2026-10-14' }),
    ];
    expect([...desiredAutoTicks(D, tasks, chart, 'auto')]).toEqual([writing.id]);
    expect([...desiredAutoTicks('2026-10-16', tasks, chart, 'auto')]).toEqual([]);
  });

  it('never ticks a replaced action', () => {
    const replaced = replaceAction(chart, 4, 1, 'Write 500 words', { kind: 'daily' }, D);
    const tasks = [task({ actionId: writing.id, completedAt: D })];
    expect(desiredAutoTicks(D, tasks, replaced, 'auto').size).toBe(0);
  });

  it('wants Top 3 only when exactly 3 starred tasks are all done that day', () => {
    const starred = (id: string, done: boolean) => task({ id, top3: D, ...(done ? { completedAt: D } : {}) });
    expect(desiredAutoTicks(D, [starred('a', true), starred('b', true), starred('c', false)], chart, 'auto').has(top3.id)).toBe(false);
    expect(desiredAutoTicks(D, [starred('a', true), starred('b', true), starred('c', true)], chart, 'auto').has(top3.id)).toBe(true);
    expect(desiredAutoTicks(D, [starred('a', true), starred('b', true)], chart, 'auto').has(top3.id)).toBe(false);
    expect(desiredAutoTicks(D, [starred('a', true), starred('b', true), starred('c', true)], chart, 'none').size).toBe(0);
  });

  it('reconciles: adds and removes its own ticks, never manual ones', () => {
    let r = reconcileAutoTicks(['manual'], [], new Set(['x']));
    expect(r).toEqual({ done: ['manual', 'x'], auto: ['x'], changed: true });
    r = reconcileAutoTicks(r.done, r.auto, new Set());
    expect(r).toEqual({ done: ['manual'], auto: [], changed: true });
    // Already ticked by hand: left alone and not claimed, so undo never removes it.
    r = reconcileAutoTicks(['x'], [], new Set(['x']));
    expect(r.changed).toBe(false);
    r = reconcileAutoTicks(['x'], [], new Set());
    expect(r.changed).toBe(false);
  });

  it('sorts today’s Top 3 first, keeping list order otherwise', () => {
    const list = [task({ id: 'a' }), task({ id: 'b', top3: D }), task({ id: 'c' }), task({ id: 'd', top3: D })];
    expect(sortForDay(list, D).map((t) => t.id)).toEqual(['b', 'd', 'a', 'c']);
    // Yesterday's star doesn't count today.
    expect(sortForDay(list, '2026-10-16').map((t) => t.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
