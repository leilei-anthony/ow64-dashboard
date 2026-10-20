import type { Action, Cadence, Chart, DayKey, Goal, Pillar } from './types';
import { uid } from './ids';

// Pure chart edits. Each returns a new Chart and leaves the input untouched.

export function setGoal(chart: Chart, goal: Goal): Chart {
  return { ...chart, goal };
}

export function updatePillar(chart: Chart, index: number, patch: Partial<Pick<Pillar, 'title' | 'color'>>): Chart {
  return { ...chart, pillars: chart.pillars.map((p, i) => (i === index ? { ...p, ...patch } : p)) };
}

function withAction(chart: Chart, pi: number, ai: number, action: Action): Chart {
  return {
    ...chart,
    pillars: chart.pillars.map((p, i) =>
      i === pi ? { ...p, actions: p.actions.map((a, j) => (j === ai ? action : a)) } : p,
    ),
  };
}

/** Rename / retarget in place: same id, so all history stays attached. */
export function editAction(chart: Chart, pi: number, ai: number, text: string, cadence: Cadence): Chart {
  return withAction(chart, pi, ai, { ...chart.pillars[pi].actions[ai], text, cadence });
}

/** Swap in a brand-new action (new id). The old one moves to the archive so its history keeps its name. */
export function replaceAction(
  chart: Chart,
  pi: number,
  ai: number,
  text: string,
  cadence: Cadence,
  today: DayKey,
): Chart {
  const pillar = chart.pillars[pi];
  const old = pillar.actions[ai];
  const next = withAction(chart, pi, ai, { id: uid(), text, cadence, createdAt: today });
  if (!old.text.trim()) return next;
  return { ...next, archive: [...chart.archive, { ...old, pillarId: pillar.id, retiredAt: today }] };
}
