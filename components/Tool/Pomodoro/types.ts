export const FOCUS = "Focus";
export const SHORT_BREAK = "Short Break";
export const LONG_BREAK = "Long Break";
export const POMODORO_CYCLES = 4;

export const DEFAULT_SESSION_LENGTHS = {
  [FOCUS]: 25 * 60,
  [SHORT_BREAK]: 5 * 60,
  [LONG_BREAK]: 20 * 60,
};

export interface PomodoroSettings {
  sessionLengths: typeof DEFAULT_SESSION_LENGTHS;
  autoStartBreaks: boolean;
  autoStartPomodoros: boolean;
  soundEnabled: boolean;
  showNotifications: boolean;
  musicWhileFocusing: boolean;
  alarmVolume: number;
  currentTimerId: string | null;
  currentSession: string;
  currentCycle: number;
}

export interface SessionInfo {
  session: string;
  cycle: number;
}

export interface NextSessionInfo {
  name: string;
  duration: string;
}

export type SessionType = typeof FOCUS | typeof SHORT_BREAK | typeof LONG_BREAK;