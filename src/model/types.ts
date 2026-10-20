/** A logical calendar day, `YYYY-MM-DD`. Before `dayStartHour` it still counts as the previous day. */
export type DayKey = string;

export type Cadence =
  | { kind: 'daily' }
  | { kind: 'weekly'; times: number }
  | { kind: 'monthly'; times: number }
  | { kind: 'milestone' }
  | { kind: 'anytime' };

export type CadenceKind = Cadence['kind'];

export interface Action {
  id: string;
  text: string;
  cadence: Cadence;
  createdAt: DayKey;
}

/** An action that was replaced; kept so old log entries can still be named. */
export interface RetiredAction extends Action {
  pillarId: string;
  retiredAt: DayKey;
}

export interface Pillar {
  id: string;
  title: string;
  color: string;
  /** Exactly 8. Array order is the grid position, skipping the block's center. */
  actions: Action[];
}

export interface Goal {
  text: string;
  targetDate?: DayKey;
}

export interface Chart {
  goal: Goal;
  /** Exactly 8. Array order is the block position, skipping the center block. */
  pillars: Pillar[];
  archive: RetiredAction[];
}

export interface DayEntry {
  /** Action ids done that day. */
  done: string[];
  /** The subset of `done` that tasks ticked (linked actions, Top 3), so they can untick it again. */
  auto?: string[];
  note?: string;
  cellNotes?: Record<string, string>;
}

export type Logs = Record<DayKey, DayEntry>;

export interface Countdown {
  id: string;
  label: string;
  date: DayKey;
}

export type Recurrence = { kind: 'weekly'; days: number[] } | { kind: 'monthly'; day: number };

export interface Subtask {
  id: string;
  text: string;
  done: boolean;
}

export interface Task {
  id: string;
  text: string;
  createdAt: DayKey;
  /** Hidden until this day; carry-over age counts from here. */
  scheduledFor?: DayKey;
  /** Show `scheduledFor` in Countdowns until the task is finished. */
  countdown?: boolean;
  /** Linked chart action, ticked when the task is completed. */
  actionId?: string;
  /** Starred as one of the Top 3 for this day only. */
  top3?: DayKey;
  subtasks: Subtask[];
  recurrence?: Recurrence;
  completedAt?: DayKey;
  droppedAt?: DayKey;
  /** Recurring: the next instance this one created, so undo can remove it. */
  spawnedId?: string;
}

export interface QuickLink {
  id: string;
  title: string;
  url: string;
}

export interface Settings {
  dayStartHour: number;
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: 0 | 1;
  matrixHidden: boolean;
  hideLinksWhenHidden: boolean;
  showClock: boolean;
  clock24h: boolean;
  showSearch: boolean;
  /** Carried tasks are flagged after this many days; 0 = never. */
  staleTaskDays: number;
  /** Action ticked when all Top 3 tasks are done: 'auto' (find "Daily top 3"), 'none', or an action id. */
  top3ActionId: string;
  lastBackupAt?: DayKey;
}

export interface AppData {
  schemaVersion: number;
  chart: Chart;
  logs: Logs;
  countdowns: Countdown[];
  quickLinks: QuickLink[];
  tasks: Task[];
  settings: Settings;
}

/** 2: adds tasks. Older builds refuse v2 backups instead of silently dropping tasks. */
export const SCHEMA_VERSION = 2;

export const DEFAULT_SETTINGS: Settings = {
  dayStartHour: 4,
  weekStartsOn: 1,
  matrixHidden: false,
  hideLinksWhenHidden: false,
  showClock: true,
  clock24h: false,
  showSearch: true,
  staleTaskDays: 7,
  top3ActionId: 'auto',
};
