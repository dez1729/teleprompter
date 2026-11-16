export interface TimerState {
  /** Reading time banked from earlier runs. */
  accumulatedMs: number;
  /** A performance.now() timestamp while running, null while paused. */
  startedAt: number | null;
}

export const STOPPED_TIMER: TimerState = { accumulatedMs: 0, startedAt: null };

/** Derived from the clock on demand, so a slow frame or a hidden tab cannot make it drift. */
export const elapsedMs = (state: TimerState, now: number): number => {
  return state.accumulatedMs + (state.startedAt === null ? 0 : Math.max(0, now - state.startedAt));
};

export const startTimer = (state: TimerState, now: number): TimerState => {
  return state.startedAt === null ? { ...state, startedAt: now } : state;
};

export const pauseTimer = (state: TimerState, now: number): TimerState => {
  return state.startedAt === null ? state : { accumulatedMs: elapsedMs(state, now), startedAt: null };
};

/** Back to zero. A running timer keeps running from the reset moment. */
export const resetTimer = (state: TimerState, now: number): TimerState => {
  return { accumulatedMs: 0, startedAt: state.startedAt === null ? null : now };
};

/** M:SS, or H:MM:SS from one hour. Partial seconds are dropped. */
export const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = String(total % 60).padStart(2, "0");
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}:${seconds}`;
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}:${seconds}`;
};

/** Time to read the rest at Speed. It ignores the minimum time per line, so it is a floor. */
export const remainingMs = (remainingWords: number, wpm: number): number => {
  return (Math.max(0, remainingWords) / wpm) * 60_000;
};
