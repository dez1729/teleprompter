import { isNil } from "es-toolkit";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { elapsedMs, pauseTimer, resetTimer, startTimer, STOPPED_TIMER, type TimerState } from "./timer";

const REDRAW_MS = 250;

interface Snapshot {
  timer: TimerState;
  // The clock at the last change or redraw. Reading it keeps render free of performance.now().
  now: number;
}

type Change = (state: TimerState, now: number) => TimerState;

// The clock lives outside React, so playback changes can start and stop it without setting state from an effect.
const createTimerStore = () => {
  let snapshot: Snapshot = { timer: STOPPED_TIMER, now: performance.now() };
  const listeners = new Set<() => void>();
  const set = (next: Snapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const store = {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    apply: (change: Change) => {
      const now = performance.now();
      set({ timer: change(snapshot.timer, now), now });
    },
    // A timer that follows playback runs exactly while playback scrolls. One that does not is left to its own controls.
    follow: (scrolling: boolean, followsPlayback: boolean) => {
      if (followsPlayback) store.apply(scrolling ? startTimer : pauseTimer);
    },
    redraw: () => set({ ...snapshot, now: performance.now() }),
  };
  return store;
};

// With `followsPlayback` it runs while `scrolling` is true, so a countdown or a pause is not counted.
// It redraws only while running; the elapsed time comes from the clock, not from counting redraws.
export const useTimer = (scrolling: boolean, followsPlayback: boolean) => {
  const [store] = useState(createTimerStore);
  const { timer, now } = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const running = !isNil(timer.startedAt);

  useEffect(() => store.follow(scrolling, followsPlayback), [store, scrolling, followsPlayback]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(store.redraw, REDRAW_MS);
    return () => clearInterval(id);
  }, [store, running]);

  const start = useCallback(() => store.apply(startTimer), [store]);
  const pause = useCallback(() => store.apply(pauseTimer), [store]);
  const reset = useCallback(() => store.apply(resetTimer), [store]);
  // Playback went back to the top and stopped, so a timer that follows it zeroes and stops too.
  const rewind = useCallback(() => store.apply((current, at) => pauseTimer(resetTimer(current, at), at)), [store]);

  return { elapsedMs: elapsedMs(timer, now), running, start, pause, reset, rewind };
};
