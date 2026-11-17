import { describe, expect, it } from "vitest";
import { speakingWpm, withMatch, type Heard } from "./speakingRate";

// A reader at `wpm`, matched every `everyMs` from word `from` on.
const reading = (wpm: number, everyMs: number, count: number, from = 0, startAt = 0): Heard[] =>
  Array.from({ length: count }, (_, i) => ({ position: from + (wpm / 60_000) * everyMs * i, at: startAt + everyMs * i }));

const hear = (matches: readonly Heard[], recent: readonly Heard[] = []): Heard[] => matches.reduce<Heard[]>(withMatch, [...recent]);

describe("speakingWpm", () => {
  it("measures the reader's words per minute", () => {
    expect(speakingWpm(hear(reading(150, 900, 6)))).toBe(150);
  });

  it("waits until the matches span a couple of seconds", () => {
    expect(speakingWpm(hear(reading(150, 900, 2)))).toBeNull();
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
    const late = hear([{ position: steady.at(-1)!.position - 2, at: 5000 }, ...reading(150, 1000, 3, 15, 6000)], steady);
    expect(speakingWpm(late)).toBe(150);
  });

  it("keeps counting when a clip matches a few words ahead, as fast speech often does", () => {
    const steady = hear(reading(220, 600, 6));
    const last = steady.at(-1)!;
    const early = hear([{ position: last.position + 6, at: last.at + 600 }, ...reading(220, 600, 4, last.position + 4.4, last.at + 1200)], steady);
    expect(speakingWpm(early)).toBe(220);
  });

  it("starts over when the reader skips ahead, rather than counting the skip as speech", () => {
    const first = hear(reading(150, 1000, 5));
    const skipped = hear(reading(150, 1000, 4, 200, 5000), first);
    expect(speakingWpm(skipped)).toBe(150);
  });
});
