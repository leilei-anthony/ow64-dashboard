import type { PomodoroState } from '../model/types';
import type { Command } from './engine';

/** Tab → background worker. */
export const POMODORO_MESSAGE = 'ow64-pomodoro';

export interface PomodoroMessage {
  type: typeof POMODORO_MESSAGE;
  command: Command;
}

export type PomodoroReply = { ok: true; state: PomodoroState } | { ok: false; error: string };
