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
  /** Marked [/]: started but not finished. Cleared when it's done or set back to [ ]. */
  inProgress?: true;
  recurrence?: Recurrence;
  completedAt?: DayKey;
  droppedAt?: DayKey;
  /** Recurring: the next instance this one created, so undo can remove it. */
  spawnedId?: string;
}

/** A Google Calendar "secret address in iCal format". Never included in backups. */
export interface CalendarSource {
  id: string;
  name: string;
  url: string;
  color: string;
  enabled: boolean;
}

export interface CalEvent {
  /** uid + start, unique per occurrence. */
  id: string;
  sourceId: string;
  title: string;
  /** Timed: ISO instant. All-day: `YYYY-MM-DD` (calendar date). */
  start: string;
  /** Timed: ISO instant. All-day: `YYYY-MM-DD`, exclusive. */
  end: string;
  allDay: boolean;
  location?: string;
  joinUrl?: string;
}

export interface CalendarSourceCache {
  /** Last successful fetch. */
  fetchedAt?: string;
  /** Last failure message, cleared on success. */
  error?: string;
  events: CalEvent[];
}

export interface CalendarCache {
  /** Last refresh attempt (success or not); drives the 15-minute staleness check. */
  checkedAt?: string;
  sources: Record<string, CalendarSourceCache>;
}

export interface QuickLink {
  id: string;
  title: string;
  url: string;
}

export type HabitKind = 'check' | 'count' | 'avoid';
export type HabitSchedule = { kind: 'daily' } | { kind: 'days'; days: number[] } | { kind: 'weekly'; times: number };
export type HabitTime = 'morning' | 'anytime' | 'evening';

/** A small routine outside the chart: make bed, water ×8, no phone in bed. */
export interface Habit {
  id: string;
  name: string;
  /** check: done or not · count: an amount toward `target` · avoid: you mark slip-ups. */
  kind: HabitKind;
  target?: number;
  unit?: string;
  schedule: HabitSchedule;
  time: HabitTime;
  createdAt: DayKey;
  /** Stopped tracking from this day on; history is kept. */
  archivedAt?: DayKey;
}

/** Per day, per habit: check → 1 when done · count → the amount · avoid → 1 when you slipped. */
export type HabitLog = Record<DayKey, Record<string, number>>;

export type PomodoroPhase = 'focus' | 'short' | 'long';

/** The one shared timer. Written only by the background worker (or the page in `npm run dev`). */
export interface PomodoroState {
  phase: PomodoroPhase;
  status: 'idle' | 'running' | 'paused';
  /** Running: when the session ends (epoch ms). */
  endsAt?: number;
  /** Paused: time left. */
  remainingMs?: number;
  /** Length of the current session, fixed when it starts. */
  lengthMs?: number;
  /** Focus sessions finished in this set; the long break comes when it reaches `longEvery`. */
  cycle: number;
  /** The task being focused on. */
  taskId?: string;
  /** Changes on every start and finish, so tabs can tell a new finish from an old one. */
  sessionId: string;
  lastFinished?: { sessionId: string; phase: PomodoroPhase; at: number };
}

export interface PomodoroDay {
  count: number;
  minutes: number;
  /** Finished pomodoros per focused task. */
  byTask?: Record<string, number>;
}

export type PomodoroLog = Record<DayKey, PomodoroDay>;

export interface PomodoroSettings {
  focusMin: number;
  shortMin: number;
  longMin: number;
  /** Long break after this many focus sessions. */
  longEvery: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
  chime: boolean;
  /** While a session runs, new tabs open in the focus view. */
  openFocusOnNewTab: boolean;
  /** Whether we've already asked for notification permission (asked once, on the first Start). */
  askedNotify: boolean;
}

/** Dashboard parts you can show or hide (Settings → Dashboard sections), in page order. */
export const SECTION_IDS = ['chart', 'habits', 'tasks', 'schedule', 'countdowns', 'week', 'heatmap', 'notes'] as const;
export type SectionId = (typeof SECTION_IDS)[number];

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
  sections: Record<SectionId, boolean>;
  /** Page order. In two columns the chart keeps its own column: first = left, last = right. */
  sectionOrder: SectionId[];
  pomodoro: PomodoroSettings;
  lastBackupAt?: DayKey;
}

export interface AppData {
  schemaVersion: number;
  chart: Chart;
  logs: Logs;
  countdowns: Countdown[];
  quickLinks: QuickLink[];
  tasks: Task[];
  pomodoroLog: PomodoroLog;
  habits: Habit[];
  habitLog: HabitLog;
  settings: Settings;
}

/** 2: tasks · 3: pomodoro history · 4: habits. Older builds refuse newer backups instead of silently dropping data. */
export const SCHEMA_VERSION = 4;

export const DEFAULT_POMODORO: PomodoroSettings = {
  focusMin: 25,
  shortMin: 5,
  longMin: 15,
  longEvery: 4,
  autoStartBreaks: true,
  autoStartFocus: false,
  chime: true,
  openFocusOnNewTab: true,
  askedNotify: false,
};

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
  sections: Object.fromEntries(SECTION_IDS.map((id) => [id, true])) as Record<SectionId, boolean>,
  sectionOrder: [...SECTION_IDS],
  pomodoro: DEFAULT_POMODORO,
};
