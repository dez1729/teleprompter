import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRateClock, readRateClock } from "./rateClock";
import { HOLD_MS, NO_RATES, shownRate, withRate, type RateHistory } from "./rateHistory";

// How far performance.now() reads behind the timers, as a coarsened or jittered clock can.
let lagMs = 0;

beforeEach(() => {
  lagMs = 0;
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  vi.setSystemTime(0);
  vi.spyOn(performance, "now").mockImplementation(() => Date.now() - lagMs);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Heard at 150 wpm from 1 s, until Follow stopped at 10 s.
const stoppedAt10s: RateHistory = withRate(withRate(NO_RATES, 150, 1000), null, 10_000);

const shownAfterStop = (clock: ReturnType<typeof createRateClock>) =>
  shownRate(stoppedAt10s, readRateClock(clock.getSnapshot(), stoppedAt10s.at(-1)!.at, false).live);

describe("the rate clock after Follow stops", () => {
  it("holds the last rate, then clears it once the hold runs out", () => {
    vi.setSystemTime(9800);
    const clock = createRateClock();
    vi.setSystemTime(10_000);
    clock.follow(10_000, false);
    expect(shownAfterStop(clock)).toEqual({ wpm: 150, held: true });

    vi.advanceTimersByTime(HOLD_MS);
    expect(shownAfterStop(clock)).toEqual({ wpm: null, held: false });
  });

  it("clears the rate even when the clock reads short of the deadline as the hold runs out", () => {
    vi.setSystemTime(9800);
    const clock = createRateClock();
    vi.setSystemTime(10_000);
    clock.follow(10_000, false);

    lagMs = 30;
    vi.advanceTimersByTime(HOLD_MS * 3);
    expect(shownAfterStop(clock)).toEqual({ wpm: null, held: false });
  });

  it("keeps the graph and stats where Follow stopped", () => {
    expect(readRateClock(25_000, 10_000, false)).toEqual({ live: 25_000, frozen: 10_000 });
  });
});

describe("the rate clock while listening", () => {
  it("ticks every half second while new rates keep arriving", () => {
    const clock = createRateClock();
    const redraws = vi.fn();
    clock.subscribe(redraws);

    // A new rate every 300 ms, as the view passes each one on.
    for (let at = 0; at < 3000; at += 300) {
      clock.follow(at, true);
      vi.advanceTimersByTime(300);
    }

    expect(redraws).toHaveBeenCalledTimes(6);
  });

  it("ticks, and tells its subscribers", () => {
    const clock = createRateClock();
    const redraws = vi.fn();
    clock.subscribe(redraws);
    clock.follow(0, true);

    vi.advanceTimersByTime(2000);
    expect(redraws).toHaveBeenCalledTimes(4);
    expect(clock.getSnapshot()).toBe(2000);

    clock.stop();
    vi.advanceTimersByTime(2000);
    expect(redraws).toHaveBeenCalledTimes(4);
  });
});
