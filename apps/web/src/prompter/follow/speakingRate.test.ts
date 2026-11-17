import { describe, expect, it } from "vitest";
import { NO_STRETCH, speakingWpm, withMatch, withVoice, type Heard, type Stretch } from "./speakingRate";

// A reader at `wpm`, matched every `everyMs` from word `from` on.
const reading = (wpm: number, everyMs: number, count: number, from = 0, startAt = 0): Heard[] =>
  Array.from({ length: count }, (_, i) => ({ position: from + (wpm / 60_000) * everyMs * i, at: startAt + everyMs * i }));

const hear = (matches: readonly Heard[], stretch: Stretch = NO_STRETCH): Stretch => matches.reduce(withMatch, stretch);

// The voice checked every 100 ms from `from` to `to`.
const voice = (stretch: Stretch, speaking: boolean, from: number, to: number): Stretch => {
  let checked = stretch;
  for (let now = from; now <= to; now += 100) checked = withVoice(checked, speaking, now);
  return checked;
};

describe("speakingWpm", () => {
  it("measures the reader's words per minute", () => {
    expect(speakingWpm(hear(reading(150, 900, 6)))).toBe(150);
  });

  it("waits until the matches span a couple of seconds", () => {
    expect(speakingWpm(hear(reading(150, 900, 2)))).toBeNull();
    expect(speakingWpm(hear(reading(150, 900, 3)))).toBeNull();
    expect(speakingWpm(hear(reading(150, 900, 4)))).toBe(150);
  });

  it("follows a change of pace within the last ten seconds", () => {
    const slow = reading(120, 1000, 20);
    const last = slow.at(-1)!;
    const fast = reading(180, 1000, 12, last.position, last.at).slice(1);
    expect(speakingWpm(hear(fast, hear(slow)))).toBe(180);
  });

  it("starts over when the reader goes back to reread", () => {
    const first = hear(reading(150, 1000, 5, 100));
    const reread = hear(reading(150, 1000, 2, 20, 6000), first);
    expect(speakingWpm(reread)).toBeNull();
  });

  it("keeps counting when a late clip matches a word or two behind", () => {
    const steady = hear(reading(150, 1000, 5));
    const late = hear([{ position: steady.heard.at(-1)!.position - 2, at: 5000 }, ...reading(150, 1000, 3, 15, 6000)], steady);
    expect(speakingWpm(late)).toBeGreaterThan(140);
    expect(speakingWpm(late)).toBeLessThan(160);
  });

  it("keeps counting when a clip matches a few words ahead, as fast speech often does", () => {
    const steady = hear(reading(220, 600, 6));
    const last = steady.heard.at(-1)!;
    const early = hear([{ position: last.position + 6, at: last.at + 600 }, ...reading(220, 600, 4, last.position + 4.4, last.at + 1200)], steady);
    expect(speakingWpm(early)).toBeGreaterThan(210);
    expect(speakingWpm(early)).toBeLessThan(230);
  });

  it("does not stall behind a clip that matched a few words ahead", () => {
    const steady = hear(reading(150, 1000, 5));
    const ahead = hear([{ position: steady.heard.at(-1)!.position + 5, at: 5000 }], steady);
    const slower = hear(reading(90, 1000, 5, 12, 6000), ahead);
    expect(speakingWpm(slower)).toBeLessThan(130);
  });

  it("starts over when the reader skips ahead, rather than counting the skip as speech", () => {
    const first = hear(reading(150, 1000, 5));
    const skipped = hear(reading(150, 1000, 4, 200, 5000), first);
    expect(speakingWpm(skipped)).toBe(150);
  });
});

describe("withVoice", () => {
  const steady = hear(reading(150, 1000, 5));

  it("keeps the rate through a breath between phrases", () => {
    expect(speakingWpm(voice(steady, false, 4000, 5000))).toBe(150);
  });

  it("shows no rate once the voice has been quiet for a while", () => {
    expect(speakingWpm(voice(steady, false, 4000, 6000))).toBeNull();
  });

  it("measures afresh when the voice goes on after a long quiet", () => {
    const quiet = voice(steady, false, 4000, 6000);
    const after = hear(reading(200, 1000, 4, 30, 9000), voice(quiet, true, 9000, 9000));
    expect(speakingWpm(after)).toBe(200);
  });

  it("starts timing the quiet again after the voice speaks", () => {
    const breaths = voice(voice(voice(steady, false, 4000, 5000), true, 5100, 5100), false, 5200, 6200);
    expect(speakingWpm(breaths)).toBe(150);
  });
});
