import { describe, expect, it } from 'vitest';
import { countDone, milestoneDoneOn, periodProgress } from '../src/lib/cadence';
import { pillarWeekCompletion } from '../src/lib/stats';
import type { Pillar } from '../src/model/types';
import { action, ticks } from './helpers';

describe('periodProgress', () => {
  it('counts the whole week for weekly targets', () => {
    const a = action({ kind: 'weekly', times: 4 });
    // Week of Mon 2026-10-12 … Sun 2026-10-18, plus one tick the week before.
    const logs = ticks('a1', ['2026-10-11', '2026-10-12', '2026-10-14', '2026-10-18']);
    expect(periodProgress(a, logs, '2026-10-13', 1)).toEqual({ count: 3, target: 4, met: false, label: '3/4 wk' });
    // With a Sunday start, the 11th and 12th share a week.
    expect(periodProgress(a, logs, '2026-10-12', 0)?.count).toBe(3);
  });

  it('counts the calendar month for monthly targets', () => {
    const a = action({ kind: 'monthly', times: 1 });
    const logs = ticks('a1', ['2026-09-30', '2026-10-05']);
    const p = periodProgress(a, logs, '2026-10-13', 1)!;
    expect(p.count).toBe(1);
    expect(p.met).toBe(true);
    expect(p.label).toMatch(/^1\/1 /);
  });

  it('marks a milestone met from its completion day onward', () => {
    const a = action({ kind: 'milestone' });
    const logs = ticks('a1', ['2026-10-05', '2026-10-09']);
    expect(milestoneDoneOn(logs, 'a1')).toBe('2026-10-05');
    expect(periodProgress(a, logs, '2026-10-04', 1)?.met).toBe(false);
    expect(periodProgress(a, logs, '2026-10-05', 1)?.met).toBe(true);
    expect(periodProgress(a, logs, '2026-12-01', 1)?.met).toBe(true);
  });

  it('has no period readout for daily and anytime actions', () => {
    expect(periodProgress(action({ kind: 'daily' }), {}, '2026-10-13', 1)).toBeNull();
    expect(periodProgress(action({ kind: 'anytime' }), {}, '2026-10-13', 1)).toBeNull();
  });

  it('counts ticks in a range', () => {
    const logs = ticks('a1', ['2026-10-01', '2026-10-02', '2026-10-10']);
    expect(countDone(logs, 'a1', '2026-10-01', '2026-10-09')).toBe(2);
  });
});

describe('pillarWeekCompletion', () => {
  const pillar: Pillar = {
    id: 'p1',
    title: 'Fitness',
    color: '#F2D543',
    actions: [
      action({ kind: 'daily' }, 'd'),
      action({ kind: 'weekly', times: 2 }, 'w'),
      action({ kind: 'anytime' }, 'any'),
      action({ kind: 'milestone' }, 'm'),
      action({ kind: 'anytime' }, 'e1', ''),
      action({ kind: 'anytime' }, 'e2', ''),
      action({ kind: 'anytime' }, 'e3', ''),
      action({ kind: 'anytime' }, 'e4', ''),
    ],
  };

  it('weighs each cadence and ignores empty cells', () => {
    // Viewing Wed 2026-10-14 (Monday week): 3 days elapsed.
    let logs = ticks('d', ['2026-10-12', '2026-10-14']); // 2 of 3
    logs = ticks('w', ['2026-10-13', '2026-10-15', '2026-10-16'], logs); // capped at 2 of 2 (whole week counts)
    logs = ticks('any', ['2026-10-13'], logs); // 1 of 1
    // milestone not done: 0 of 1
    const c = pillarWeekCompletion(pillar, logs, '2026-10-14', 1);
    expect(c).toEqual({ met: 5, target: 7, ratio: 5 / 7 });
  });
});
