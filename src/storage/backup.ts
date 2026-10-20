import { SCHEMA_VERSION, type AppData } from '../model/types';
import {
  normalizeChart,
  normalizeCountdowns,
  normalizeLogs,
  normalizeQuickLinks,
  normalizeSettings,
  normalizeTasks,
} from './normalize';

const APP_ID = 'ow64-dashboard';

export function makeBackup(data: AppData, exportedAt: Date): string {
  const { schemaVersion, ...rest } = data;
  return JSON.stringify({ app: APP_ID, schemaVersion, exportedAt: exportedAt.toISOString(), ...rest }, null, 2);
}

export type ParsedBackup =
  | { ok: true; data: AppData; summary: string }
  | { ok: false; error: string };

export function parseBackup(text: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' };
  }
  if (typeof raw !== 'object' || raw === null || (raw as { app?: unknown }).app !== APP_ID) {
    return { ok: false, error: "This file doesn't look like an OW64 Dashboard backup." };
  }
  const r = raw as Record<string, unknown>;
  if (typeof r.schemaVersion !== 'number' || r.schemaVersion > SCHEMA_VERSION) {
    return { ok: false, error: 'This backup was made by a newer version of the extension.' };
  }
  const chart = normalizeChart(r.chart);
  if (!chart) {
    return { ok: false, error: 'The chart in this backup is missing or damaged (it needs 8 pillars × 8 actions).' };
  }
  if (r.logs !== undefined && (typeof r.logs !== 'object' || r.logs === null || Array.isArray(r.logs))) {
    return { ok: false, error: 'The progress log in this backup is damaged.' };
  }
  const data: AppData = {
    schemaVersion: SCHEMA_VERSION,
    chart,
    logs: normalizeLogs(r.logs),
    countdowns: normalizeCountdowns(r.countdowns),
    quickLinks: normalizeQuickLinks(r.quickLinks),
    tasks: normalizeTasks(r.tasks), // absent in v1 backups
    settings: normalizeSettings(r.settings),
  };
  const days = Object.keys(data.logs).length;
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const summary =
    `Replaces your chart (“${chart.goal.text || 'untitled goal'}”), ${plural(days, 'day')} of progress, ` +
    `${plural(data.tasks.length, 'task')}, ${plural(data.countdowns.length, 'countdown')} and ` +
    `${plural(data.quickLinks.length, 'quick link')}.`;
  return { ok: true, data, summary };
}
