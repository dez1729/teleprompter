import { describe, expect, it } from "vitest";
import { HOLD_MS, MAX_WINDOW_MS, NO_RATES, clearedRates, lastWpm, rateStats, segmentsIn, shownRate, withRate, type RateHistory } from "./rateHistory";

const history = (...changes: [at: number, wpm: number | null][]): RateHistory =>
  changes.reduce((rates, [at, wpm]) => withRate(rates, wpm, at), NO_RATES);

describe("withRate", () => {
  it("records only changes", () => {
    expect(history([0, 150], [1000, 150], [2000, null], [3000, null])).toEqual([
      { at: 0, wpm: 150 },
      { at: 2000, wpm: null },
    ]);
  });

  it("forgets changes older than the longest window, but keeps the one in force when it starts", () => {
    const rates = history([0, 120], [1000, 130], [MAX_WINDOW_MS + 5000, 140]);
    expect(rates).toEqual([
      { at: 1000, wpm: 130 },
      { at: MAX_WINDOW_MS + 5000, wpm: 140 },
    ]);
  });
});

describe("rateStats", () => {
  it("averages by how long each rate lasted, over the window only", () => {
    // 100 wpm for 10 s falls before the window; then 120 for 30 s, quiet for 10 s, 180 for 10 s.
    const rates = history([0, 100], [10_000, 120], [40_000, null], [50_000, 180]);
    const stats = rateStats(segmentsIn(rates, 60_000, 50_000));
    expect(stats).toEqual({ average: 135, min: 120, max: 180 });
  });

  it("is null when nothing was heard in the window", () => {
    expect(rateStats(segmentsIn(history([0, 150], [1000, null]), 70_000, 60_000))).toBeNull();
  });

  it("counts a rate heard just now", () => {
    expect(rateStats(segmentsIn(history([5000, 160]), 5000, 60_000))).toEqual({ average: 160, min: 160, max: 160 });
  });
});

describe("shownRate", () => {
  const rates = history([0, 150], [10_000, null]);

  it("shows the rate while it is heard", () => {
    expect(shownRate(history([0, 150]), 5000)).toEqual({ wpm: 150, held: false });
  });

  it("holds the last rate for a few seconds after the voice goes quiet", () => {
    expect(shownRate(rates, 10_000 + HOLD_MS - 1)).toEqual({ wpm: 150, held: true });
    expect(shownRate(rates, 10_000 + HOLD_MS)).toEqual({ wpm: null, held: false });
  });

  it("shows nothing before anything is heard", () => {
    expect(shownRate(NO_RATES, 0)).toEqual({ wpm: null, held: false });
    expect(shownRate(history([0, null]), 0)).toEqual({ wpm: null, held: false });
  });

  it("keeps the last rate after the hold", () => {
    expect(lastWpm(rates)).toBe(150);
  });
});

describe("clearedRates", () => {
  it("wipes the history once the voice is quiet", () => {
    const cleared = clearedRates(history([0, 120], [10_000, 150], [20_000, null]), 21_000);
    expect(cleared).toEqual(NO_RATES);
    expect(shownRate(cleared, 21_000)).toEqual({ wpm: null, held: false });
    expect(lastWpm(cleared)).toBeNull();
  });

  it("keeps the rate being heard, but none of what came before", () => {
    const cleared = clearedRates(history([0, 120], [10_000, 150]), 30_000);
    expect(shownRate(cleared, 30_000)).toEqual({ wpm: 150, held: false });
    expect(rateStats(segmentsIn(cleared, 40_000, 60_000))).toEqual({ average: 150, min: 150, max: 150 });
  });
});
