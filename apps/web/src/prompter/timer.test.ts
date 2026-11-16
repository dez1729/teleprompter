import { describe, expect, it } from "vitest";
import { elapsedMs, formatDuration, pauseTimer, remainingMs, resetTimer, startTimer, STOPPED_TIMER } from "./timer";

describe("timer", () => {
  it("counts only the time it was running", () => {
    let timer = startTimer(STOPPED_TIMER, 1000);
    expect(elapsedMs(timer, 3500)).toBe(2500);
    timer = pauseTimer(timer, 3500);
    expect(elapsedMs(timer, 90_000)).toBe(2500);
    timer = startTimer(timer, 100_000);
    expect(elapsedMs(timer, 101_000)).toBe(3500);
  });

  it("ignores a second start or pause", () => {
    const running = startTimer(STOPPED_TIMER, 1000);
    expect(elapsedMs(startTimer(running, 5000), 6000)).toBe(5000);
    expect(pauseTimer(STOPPED_TIMER, 5000)).toEqual(STOPPED_TIMER);
  });

  it("resets to zero and keeps running only if it was running", () => {
    const running = startTimer(STOPPED_TIMER, 0);
    const reset = resetTimer(running, 10_000);
    expect(elapsedMs(reset, 10_000)).toBe(0);
    expect(elapsedMs(reset, 12_000)).toBe(2000);

    const paused = pauseTimer(running, 4000);
    expect(elapsedMs(resetTimer(paused, 10_000), 20_000)).toBe(0);
  });
});

describe("formatDuration", () => {
  it("reads M:SS and drops partial seconds", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(999)).toBe("0:00");
    expect(formatDuration(134_900)).toBe("2:14");
    expect(formatDuration(600_000)).toBe("10:00");
  });

  it("switches to H:MM:SS from one hour", () => {
    expect(formatDuration(3_599_000)).toBe("59:59");
    expect(formatDuration(3_600_000)).toBe("1:00:00");
    expect(formatDuration(3_725_000)).toBe("1:02:05");
  });
});

describe("remainingMs", () => {
  it("is the words left over Speed", () => {
    expect(remainingMs(140, 140)).toBe(60_000);
    expect(remainingMs(-3, 140)).toBe(0);
  });
});
