import { signal } from '@preact/signals';
import type { DayKey, QuickLink } from './model/types';
import type { HeatFilter } from './lib/stats';
import { addDays } from './lib/dates';
import { selectedDay, today, viewDay } from './storage/store';

// Page-level UI state (not persisted).

export const editMode = signal(false);
export const heatFilter = signal<HeatFilter>({ kind: 'all' });
/** Year shown in the heatmap; null follows the viewed day. */
export const heatYear = signal<number | null>(null);
export const settingsOpen = signal(false);
/** This tab shows the full-screen pomodoro view instead of the dashboard. */
export const focusView = signal(false);

export type EditTarget =
  | { kind: 'goal' }
  | { kind: 'pillar'; pi: number }
  | { kind: 'action'; pi: number; ai: number };
export const editTarget = signal<EditTarget | null>(null);

export const cellNoteTarget = signal<{ actionId: string; day: DayKey } | null>(null);

/** Open task editor; `focus: 'date'` jumps to the date field (from "Move ▾ → Pick a date"). */
export const taskDialog = signal<{ id: string; focus?: 'date' } | null>(null);

/** Open the habit editor; `id: null` adds a new habit. */
export const habitDialog = signal<{ id: string | null } | null>(null);

/** Open link editor; `link: null` adds a new one. */
export const linkDialog = signal<{ link: QuickLink | null } | null>(null);

export interface MenuItem {
  label: string;
  onSelect?: () => void;
  /** Non-interactive line, e.g. a streak readout. */
  info?: boolean;
}
export const menu = signal<{ x: number; y: number; items: MenuItem[] } | null>(null);

export function openMenu(e: MouseEvent, items: MenuItem[]) {
  e.preventDefault();
  menu.value = { x: e.clientX, y: e.clientY, items };
}

export function goToDay(day: DayKey) {
  selectedDay.value = day >= today.value ? null : day;
}

export function shiftDay(n: number) {
  goToDay(addDays(viewDay.value, n));
}
