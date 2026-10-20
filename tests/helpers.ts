import type { Action, Cadence, Logs } from '../src/model/types';

export function action(cadence: Cadence, id = 'a1', text = 'Test action'): Action {
  return { id, text, cadence, createdAt: '2026-01-01' };
}

/** Logs with `id` ticked on each of the given days. */
export function ticks(id: string, days: string[], base: Logs = {}): Logs {
  const logs: Logs = structuredClone(base);
  for (const day of days) {
    logs[day] = { done: [...(logs[day]?.done ?? []), id] };
  }
  return logs;
}
