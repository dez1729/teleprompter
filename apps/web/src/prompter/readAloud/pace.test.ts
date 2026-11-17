import { describe, expect, it } from "vitest";
import { INITIAL_PACE, measured, speedFor } from "./pace";

describe("voice pace", () => {
  it("asks for the speed that gives the wanted words per minute", () => {
    expect(speedFor({ wpmAtSpeedOne: 200 }, 150)).toBe(0.75);
  });

  it("keeps the speed where the voice still sounds natural", () => {
    expect(speedFor({ wpmAtSpeedOne: 200 }, 40)).toBe(0.5);
    expect(speedFor({ wpmAtSpeedOne: 100 }, 400)).toBe(2);
  });

  it("learns the voice's own pace from what it said", () => {
    // 30 words in 10 s at speed 1.5 is 120 wpm at speed 1.
    const pace = measured({ wpmAtSpeedOne: 200 }, 30, 10, 1.5);
    expect(pace.wpmAtSpeedOne).toBe(160);
    expect(measured(pace, 30, 10, 1.5).wpmAtSpeedOne).toBe(140);
  });

  it("ignores a passage with no words or no sound", () => {
    expect(measured(INITIAL_PACE, 0, 3, 1)).toBe(INITIAL_PACE);
    expect(measured(INITIAL_PACE, 5, 0, 1)).toBe(INITIAL_PACE);
  });
});
