import { isNil } from "es-toolkit";
import { HOLD_MS } from "./rateHistory";

// Often enough for the graph to scroll smoothly and the held rate to clear on time.
const TICK_MS = 500;

export interface RateReading {
  // Reads the held rate, so it clears on time even after Follow stops.
  live: number;
  // Reads the graph and stats. It stops at the last change once Follow stops, so they stay as they were.
  frozen: number;
}

export const readRateClock = (tick: number, lastChange: number | undefined, listening: boolean): RateReading => {
  const live = Math.max(tick, lastChange ?? tick);
  return { live, frozen: listening ? live : (lastChange ?? tick) };
};

// The clock lives outside React so its timing can be tested. Listening, it ticks. Stopped, it wakes once more when
// the held rate runs out.
export const createRateClock = () => {
  let tick = performance.now();
  let wake: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();

  const redraw = (at: number) => {
    tick = at;
    listeners.forEach((listener) => listener());
  };

  const stop = () => {
    clearTimeout(wake);
    clearInterval(wake);
    wake = undefined;
  };

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => void listeners.delete(listener);
    },
    getSnapshot: () => tick,
    follow: (lastChange: number | undefined, listening: boolean) => {
      stop();

      if (listening) {
        wake = setInterval(() => redraw(performance.now()), TICK_MS);
        return;
      }

      if (isNil(lastChange)) return;
      const holdEnds = lastChange + HOLD_MS;
      if (tick >= holdEnds) return;
      // A coarse or jittered clock can read just short of the deadline, which would leave the rate held for good.
      wake = setTimeout(() => redraw(Math.max(performance.now(), holdEnds)), Math.max(0, holdEnds - performance.now()));
    },
    stop,
  };
};
