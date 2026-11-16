import { isNil } from "es-toolkit";
import { useEffect, useState, useSyncExternalStore } from "react";
import { elapsedMs, pauseTimer, resetTimer, startTimer, STOPPED_TIMER, type TimerState } from "./timer";

interface Snapshot {
  timer: TimerState;
  // The clock at the last change or redraw. Reading it keeps render free of performance.now().
  now: number;
}

type Change = (state: TimerState, now: number) => TimerState;

// The clock lives outside React, so playback changes can start and stop it without setting state from an effect.
// While it runs it redraws on each whole second of elapsed time, watched or not, so a view that mounts later
// reads the current second from its first frame.
const createTimerStore = () => {
  let snapshot: Snapshot = { timer: STOPPED_TIMER, now: performance.now() };
  let followsPlayback = false;
  let redraw: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  const schedule = () => {
    clearTimeout(redraw);
    redraw = undefined;
    if (isNil(snapshot.timer.startedAt)) return;

    const untilNextSecond = 1000 - (elapsedMs(snapshot.timer, performance.now()) % 1000);
    redraw = setTimeout(() => set({ ...snapshot, now: performance.now() }), untilNextSecond);
  };

  const set = (next: Snapshot) => {
    snapshot = next;
    schedule();
    listeners.forEach((listener) => listener());
  };

  const apply = (change: Change) => {
    const now = performance.now();
    const timer = change(snapshot.timer, now);
    if (timer !== snapshot.timer) set({ timer, now });
  };

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => void listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    // A timer that follows playback runs exactly while playback scrolls. One that does not is left to its own controls.
    follow: (scrolling: boolean, follows: boolean) => {
      followsPlayback = follows;
      if (follows) apply(scrolling ? startTimer : pauseTimer);
    },
    start: () => apply(startTimer),
    pause: () => apply(pauseTimer),
    reset: () => apply(resetTimer),
    // Playback went back to the top and stopped. A timer that follows it zeroes and stops too; one run by hand is left alone.
    rewind: () => {
      if (followsPlayback) apply((current, at) => pauseTimer(resetTimer(current, at), at));
    },
  };
};

export type Timer = ReturnType<typeof createTimerStore>;

// What a view of the timer may use: read it, and start, pause or reset it. Coupling it to playback stays with usePrompter.
export type TimerReader = Pick<Timer, "subscribe" | "getSnapshot">;
export type TimerControls = TimerReader & Pick<Timer, "start" | "pause" | "reset">;

// With `followsPlayback` it runs while `scrolling` is true, so a countdown or a pause is not counted.
export const useTimer = (scrolling: boolean, followsPlayback: boolean): Timer => {
  const [timer] = useState(createTimerStore);
  useEffect(() => timer.follow(scrolling, followsPlayback), [timer, scrolling, followsPlayback]);

  return timer;
};

// Only the parts that show the time subscribe, so a redraw re-renders them and not the whole Prompter.
export const useTimerReading = (timer: TimerReader) => {
  const { timer: state, now } = useSyncExternalStore(timer.subscribe, timer.getSnapshot);

  return { elapsedMs: elapsedMs(state, now), running: !isNil(state.startedAt) };
};
