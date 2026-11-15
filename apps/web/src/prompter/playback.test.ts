import { describe, expect, it } from "vitest";
import { FOLLOW_COAST_MS, initialPlayback, keepPlace, needsTick, playbackReducer, type PlaybackEvent, type PlaybackState } from "./playback";

const run = (state: PlaybackState, ...events: PlaybackEvent[]) => events.reduce(playbackReducer, state);
const rows = (...starts: number[]) => starts.map((start) => ({ start, stretch: 1 }));

const loaded = run(
  initialPlayback,
  { type: "SET_SCRIPT", wordCount: 100, paragraphStarts: [0, 40, 70], sentenceEnds: [], place: "reset" },
  { type: "SET_LAYOUT", lines: rows(0, 10, 20, 30, 40, 50, 60, 70, 80, 90) }
);

describe("minimum time per line", () => {
  const short = run(
    initialPlayback,
    { type: "SET_SCRIPT", wordCount: 22, paragraphStarts: [0], sentenceEnds: [], place: "reset" },
    { type: "SET_LAYOUT", lines: rows(0, 10, 12) },
    { type: "PLAY", countdownSec: 0, countdownAtStartOnly: false }
  );
  const tickFor = (state: PlaybackState, ms: number) => {
    for (let t = 0; t < ms; t += 10) state = run(state, { type: "TICK", dtMs: 10, wpm: 300, minLineMs: 1500 });
    return state;
  };

  it("reads a full line at Speed", () => {
    expect(tickFor(short, 2000).cursor).toBeCloseTo(10, 0);
  });

  it("holds a two-word line up for the minimum time", () => {
    const atShort = tickFor(short, 2000);
    expect(tickFor(atShort, 1400).cursor).toBeLessThan(12);
    expect(tickFor(atShort, 1600).cursor).toBeGreaterThan(12);
  });

  it("reads at Speed when the minimum is 0", () => {
    const state = run(short, { type: "TICK", dtMs: 1000, wpm: 300, minLineMs: 0 });
    expect(state.cursor).toBeCloseTo(5);
  });
});

describe("the gap below a line", () => {
  const timeOnFirstLine = (stretch: number, words: number) => {
    let state = run(
      initialPlayback,
      { type: "SET_SCRIPT", wordCount: words + 10, paragraphStarts: [0, words], sentenceEnds: [], place: "reset" },
      {
        type: "SET_LAYOUT",
        lines: [
          { start: 0, stretch },
          { start: words, stretch: 1 },
        ],
      },
      { type: "PLAY", countdownSec: 0, countdownAtStartOnly: false }
    );
    let ms = 0;
    while (state.cursor < words) {
      state = run(state, { type: "TICK", dtMs: 10, wpm: 300, minLineMs: 1500 });
      ms += 10;
    }

    return ms;
  };

  it("takes time in proportion to its height, so the line scrolls at an even pace", () => {
    expect(timeOnFirstLine(1, 10)).toBeCloseTo(2000, -2);
    expect(timeOnFirstLine(1.5, 10)).toBeCloseTo(3000, -2);
  });

  it("adds to the minimum time of a short line", () => {
    expect(timeOnFirstLine(1, 2)).toBeCloseTo(1500, -2);
    expect(timeOnFirstLine(2, 2)).toBeCloseTo(3000, -2);
  });
});

describe("playback", () => {
  it("starts paused at the top", () => {
    expect(loaded.mode.kind).toBe("paused");
    expect(loaded.cursor).toBe(0);
    expect(needsTick(loaded)).toBe(false);
  });

  it("counts down before playing, then advances by wpm", () => {
    let state = run(loaded, { type: "PLAY", countdownSec: 3, countdownAtStartOnly: false });
    expect(state.mode).toEqual({ kind: "countdown", remainingMs: 3000 });
    state = run(state, { type: "TICK", dtMs: 2000, wpm: 120 });
    expect(state.mode).toEqual({ kind: "countdown", remainingMs: 1000 });
    expect(state.cursor).toBe(0);
    state = run(state, { type: "TICK", dtMs: 1000, wpm: 120 });
    expect(state.mode.kind).toBe("playing");
    state = run(state, { type: "TICK", dtMs: 30000, wpm: 120 });
    expect(state.cursor).toBeCloseTo(60);
  });

  it("plays immediately when the countdown is 0", () => {
    expect(run(loaded, { type: "PLAY", countdownSec: 0, countdownAtStartOnly: false }).mode.kind).toBe("playing");
  });

  it("toggles between playing and paused, keeping the cursor", () => {
    let state = run(loaded, { type: "TOGGLE", countdownSec: 0, countdownAtStartOnly: false }, { type: "TICK", dtMs: 6000, wpm: 100 });
    expect(state.cursor).toBeCloseTo(10);
    state = run(state, { type: "TOGGLE", countdownSec: 0, countdownAtStartOnly: false });
    expect(state.mode.kind).toBe("paused");
    expect(state.cursor).toBeCloseTo(10);
  });

  it("pausing during the countdown cancels it", () => {
    const state = run(loaded, { type: "PLAY", countdownSec: 3, countdownAtStartOnly: false }, { type: "PAUSE" });
    expect(state.mode.kind).toBe("paused");
  });

  it("does nothing without a script", () => {
    expect(run(initialPlayback, { type: "PLAY", countdownSec: 0, countdownAtStartOnly: false }).mode.kind).toBe("paused");
  });

  it("stops at the end and rewinds on the next play", () => {
    let state = run(loaded, { type: "PLAY", countdownSec: 0, countdownAtStartOnly: false }, { type: "TICK", dtMs: 10 * 60000, wpm: 100 });
    expect(state.mode.kind).toBe("paused");
    expect(state.cursor).toBe(100);
    state = run(state, { type: "PLAY", countdownSec: 0, countdownAtStartOnly: false });
    expect(state.cursor).toBe(0);
    expect(state.mode.kind).toBe("playing");
  });

  it("eases toward a stepped line instead of jumping", () => {
    let state = run(loaded, { type: "STEP_LINE", delta: 1, keepPlaying: false });
    expect(state.animTarget).toBe(10);
    expect(state.cursor).toBe(0);
    expect(needsTick(state)).toBe(true);
    state = run(state, { type: "TICK", dtMs: 16, wpm: 140 });
    expect(state.cursor).toBeGreaterThan(0);
    expect(state.cursor).toBeLessThan(10);
    for (let i = 0; i < 30; i++) state = run(state, { type: "TICK", dtMs: 16, wpm: 140 });
    expect(state.cursor).toBe(10);
    expect(state.animTarget).toBeNull();
    expect(state.mode.kind).toBe("paused");
  });

  it("chains steps from the pending target", () => {
    const state = run(loaded, { type: "STEP_LINE", delta: 1, keepPlaying: false }, { type: "STEP_LINE", delta: 1, keepPlaying: false });
    expect(state.animTarget).toBe(20);
  });

  it("steps back to the start of the current line first, then the previous", () => {
    let state = run(loaded, { type: "SCRUB", cursor: 25, keepPlaying: false }, { type: "STEP_LINE", delta: -1, keepPlaying: false });
    expect(state.animTarget).toBe(20);
    state = run(state, { type: "STEP_LINE", delta: -1, keepPlaying: false });
    expect(state.animTarget).toBe(10);
  });

  it("steps by paragraph", () => {
    let state = run(loaded, { type: "STEP_PARAGRAPH", delta: 1, keepPlaying: false });
    expect(state.animTarget).toBe(40);
    state = run(state, { type: "STEP_PARAGRAPH", delta: 1, keepPlaying: false });
    expect(state.animTarget).toBe(70);
    state = run(state, { type: "STEP_PARAGRAPH", delta: 1, keepPlaying: false });
    expect(state.animTarget).toBe(70);
  });

  it("stepping while playing continues playing afterwards, when set to keep playing", () => {
    let state = run(loaded, { type: "PLAY", countdownSec: 0, countdownAtStartOnly: false }, { type: "STEP_LINE", delta: 1, keepPlaying: true });
    for (let i = 0; i < 40; i++) state = run(state, { type: "TICK", dtMs: 16, wpm: 140 });
    expect(state.mode.kind).toBe("playing");
    expect(state.cursor).toBeGreaterThan(10);
  });

  it("scrubbing moves the cursor and pauses, when not set to keep playing", () => {
    const state = run(loaded, { type: "PLAY", countdownSec: 0, countdownAtStartOnly: false }, { type: "SCRUB", cursor: 33.5, keepPlaying: false });
    expect(state.cursor).toBe(33.5);
    expect(state.mode.kind).toBe("paused");
    expect(run(state, { type: "SCRUB", cursor: -5, keepPlaying: false }).cursor).toBe(0);
    expect(run(state, { type: "SCRUB", cursor: 999, keepPlaying: false }).cursor).toBe(100);
  });

  it("restart returns to the top, paused", () => {
    const state = run(
      loaded,
      { type: "PLAY", countdownSec: 0, countdownAtStartOnly: false },
      { type: "TICK", dtMs: 5000, wpm: 100 },
      { type: "RESTART" }
    );
    expect(state.cursor).toBe(0);
    expect(state.mode.kind).toBe("paused");
  });

  it("replace resets position, append keeps it", () => {
    const mid = run(loaded, { type: "SCRUB", cursor: 50, keepPlaying: false });
    const appended = run(mid, { type: "SET_SCRIPT", wordCount: 150, paragraphStarts: [0, 40, 70, 100], sentenceEnds: [], place: keepPlace });
    expect(appended.cursor).toBe(50);
    expect(appended.wordCount).toBe(150);
    const replaced = run(mid, { type: "SET_SCRIPT", wordCount: 20, paragraphStarts: [0], sentenceEnds: [], place: "reset" });
    expect(replaced.cursor).toBe(0);
    expect(replaced.mode.kind).toBe("paused");
  });

  it("an Edit moves the position without pausing or re-arming the countdown", () => {
    const playing = run(loaded, { type: "SCRUB", cursor: 50, keepPlaying: false }, { type: "PLAY", countdownSec: 0, countdownAtStartOnly: true });
    const edited = run(playing, { type: "SET_SCRIPT", wordCount: 103, paragraphStarts: [0], sentenceEnds: [], place: (cursor) => cursor + 3 });
    expect(edited.cursor).toBe(53);
    expect(edited.mode.kind).toBe("playing");
    expect(edited.countdownArmed).toBe(false);
  });

  it("clamps a placed position to the new Script", () => {
    const mid = run(loaded, { type: "SCRUB", cursor: 50, keepPlaying: false });
    expect(run(mid, { type: "SET_SCRIPT", wordCount: 10, paragraphStarts: [0], sentenceEnds: [], place: keepPlace }).cursor).toBe(10);
  });

  describe("countdown only at start", () => {
    const play = (state: PlaybackState) => run(state, { type: "PLAY", countdownSec: 3, countdownAtStartOnly: true });
    const countdownThenPlay = (state: PlaybackState) => run(play(state), { type: "TICK", dtMs: 3000, wpm: 100 });

    it("counts down on the first play", () => {
      expect(play(loaded).mode.kind).toBe("countdown");
    });

    it("resumes immediately after a pause", () => {
      const paused = run(countdownThenPlay(loaded), { type: "PAUSE" });
      expect(play(paused).mode.kind).toBe("playing");
    });

    it("resumes immediately after a step or scrub", () => {
      const started = run(countdownThenPlay(loaded), { type: "PAUSE" });
      expect(play(run(started, { type: "STEP_LINE", delta: 1, keepPlaying: false })).mode.kind).toBe("playing");
      expect(play(run(started, { type: "SCRUB", cursor: 30, keepPlaying: false })).mode.kind).toBe("playing");
    });

    it("counts down again after restart", () => {
      const started = run(countdownThenPlay(loaded), { type: "PAUSE" }, { type: "RESTART" });
      expect(play(started).mode.kind).toBe("countdown");
    });

    it("counts down again after a replace but not an append", () => {
      const started = run(countdownThenPlay(loaded), { type: "PAUSE" });
      const appended = run(started, { type: "SET_SCRIPT", wordCount: 150, paragraphStarts: [0], sentenceEnds: [], place: keepPlace });
      expect(play(appended).mode.kind).toBe("playing");
      const replaced = run(started, { type: "SET_SCRIPT", wordCount: 20, paragraphStarts: [0], sentenceEnds: [], place: "reset" });
      expect(play(replaced).mode.kind).toBe("countdown");
    });

    it("counts down when replaying from the end", () => {
      const finished = run(countdownThenPlay(loaded), { type: "TICK", dtMs: 10 * 60000, wpm: 100 });
      expect(play(finished).mode.kind).toBe("countdown");
    });

    it("resumes immediately after cancelling the countdown", () => {
      const cancelled = run(play(loaded), { type: "PAUSE" });
      expect(play(cancelled).mode.kind).toBe("playing");
    });

    it("counts down on every play from paused when the setting is off", () => {
      const paused = run(countdownThenPlay(loaded), { type: "PAUSE" });
      expect(run(paused, { type: "PLAY", countdownSec: 3, countdownAtStartOnly: false }).mode.kind).toBe("countdown");
    });
  });
});

describe("Follow", () => {
  const following = run(loaded, { type: "SCRUB", cursor: 10, keepPlaying: false }, { type: "FOLLOW" });
  const heardAt = (position: number, pace = 0): PlaybackEvent => ({ type: "HEARD", matched: position, position, pace });
  const settle = (state: PlaybackState) => run(state, ...Array.from({ length: 60 }, () => ({ type: "TICK", dtMs: 100, wpm: 100 }) as const));

  it("starts from where the reader is and waits for their voice", () => {
    expect(following.mode).toMatchObject({ kind: "following", target: 10 });
    expect(settle(following).cursor).toBe(10);
  });

  it("glides to where the voice was heard instead of jumping", () => {
    const heard = run(following, heardAt(14), { type: "TICK", dtMs: 50, wpm: 100 });
    expect(heard.cursor).toBeGreaterThan(10);
    expect(heard.cursor).toBeLessThan(14);
    expect(settle(heard).cursor).toBe(14);
  });

  it("keeps moving at the reader's pace between matches, then waits for their voice", () => {
    const reading = run(following, heardAt(14, 3 / 1000));
    const afterOneSecond = run(reading, ...Array.from({ length: 10 }, () => ({ type: "TICK", dtMs: 100, wpm: 100 }) as const));
    expect(afterOneSecond.mode.kind === "following" && afterOneSecond.mode.target).toBeCloseTo(17);
    expect(settle(afterOneSecond).cursor).toBeCloseTo(14 + 3 * (FOLLOW_COAST_MS / 1000));
  });

  it("stops coasting when the reader goes quiet", () => {
    const coasted = run(following, heardAt(14, 3 / 1000), ...Array.from({ length: 10 }, () => ({ type: "TICK", dtMs: 100, wpm: 100 }) as const));
    const quiet = settle(run(coasted, { type: "QUIET", forMs: 700 }));
    expect(quiet.cursor).toBeCloseTo(Math.max(coasted.cursor, 17 - 3 * 0.7));
    expect(settle(run(quiet, { type: "QUIET", forMs: 700 })).cursor).toBe(quiet.cursor);
  });

  it("waits for a reader it ran ahead of, and goes back only with a reader who rereads", () => {
    const coastedAhead = settle(run(following, heardAt(14, 3 / 1000)));
    expect(coastedAhead.cursor).toBeGreaterThan(20);
    expect(settle(run(coastedAhead, heardAt(16))).cursor).toBe(coastedAhead.cursor);
    expect(settle(run(coastedAhead, heardAt(12))).cursor).toBe(coastedAhead.cursor);
    expect(settle(run(coastedAhead, heardAt(5))).cursor).toBe(5);
  });

  it("ignores the same speech heard again", () => {
    const heard = run(following, heardAt(14, 3 / 1000));
    expect(run(heard, heardAt(14, 3 / 1000))).toBe(heard);
  });

  it("glides to a reader far ahead instead of scrolling through the words between", () => {
    const jumped = run(following, heardAt(40, 3 / 1000), ...Array.from({ length: 6 }, () => ({ type: "TICK", dtMs: 50, wpm: 100 }) as const));
    expect(jumped.cursor).toBeGreaterThan(39);
  });

  it("aims a little behind a reader it is keeping up with, but right at one it has to catch up with", () => {
    const heardNear = { type: "HEARD", matched: 12, position: 14, pace: 0 } as const;
    expect(settle(run(following, heardNear)).cursor).toBeCloseTo(13.25);
    const heardFar = { type: "HEARD", matched: 30, position: 32, pace: 0 } as const;
    expect(settle(run(following, heardFar)).cursor).toBe(32);
  });

  it("counts a reader just past the jump distance as far ahead, before trailing", () => {
    const heardJustFar = { type: "HEARD", matched: 18, position: 18.5, pace: 0 } as const;
    expect(settle(run(following, heardJustFar)).cursor).toBe(18.5);
  });

  it("trails the reader again from the first match after a jump", () => {
    // The jump lands on where the reader is by now; a second later they have read three words further.
    const heardFar = { type: "HEARD", matched: 30, position: 32, pace: 3 / 1000 } as const;
    const jumped = run(following, heardFar, ...Array.from({ length: 10 }, () => ({ type: "TICK", dtMs: 100, wpm: 100 }) as const));
    const next = run(jumped, { type: "HEARD", matched: 33, position: 35, pace: 3 / 1000 });
    expect(next.mode.kind === "following" && next.mode.target).toBeCloseTo(34.25);
  });

  it("keeps following through a step or a scroll, listening from where the reader moved", () => {
    const stepped = settle(run(following, { type: "STEP_PARAGRAPH", delta: 1, keepPlaying: true }));
    expect(stepped.mode).toMatchObject({ kind: "following", target: stepped.cursor, heard: stepped.cursor });
    expect(stepped.cursor).toBe(40);
    const scrolled = run(following, { type: "SCRUB", cursor: 30, keepPlaying: true });
    expect(scrolled.mode).toMatchObject({ kind: "following", target: 30, heard: 30 });
    expect(settle(run(scrolled, heardAt(33))).cursor).toBe(33);
  });

  it("goes back to the voice when the reader moved ahead but reads on where they were", () => {
    const scrolled = run(following, heardAt(14), { type: "SCRUB", cursor: 30, keepPlaying: true });
    expect(settle(run(scrolled, heardAt(16))).cursor).toBe(16);
  });

  it("stops on a move by hand when it should not keep playing", () => {
    expect(run(following, { type: "SCRUB", cursor: 30, keepPlaying: false }).mode.kind).toBe("paused");
    expect(run(following, { type: "STEP_LINE", delta: 1, keepPlaying: false }).mode.kind).toBe("paused");
  });

  it("stops on pause or Space, and ignores voices while stopped", () => {
    expect(run(following, { type: "PAUSE" }).mode.kind).toBe("paused");
    expect(run(following, { type: "TOGGLE", countdownSec: 3, countdownAtStartOnly: false }).mode.kind).toBe("paused");
    expect(run(loaded, heardAt(30))).toBe(loaded);
  });

  it("starts over from the top after the end, without a countdown", () => {
    const ended = run(loaded, { type: "SCRUB", cursor: loaded.wordCount, keepPlaying: false }, { type: "FOLLOW" });
    expect(ended.mode).toMatchObject({ kind: "following", target: 0 });
    expect(ended.cursor).toBe(0);
  });

  it("does nothing without a Script", () => {
    expect(run(initialPlayback, { type: "FOLLOW" })).toBe(initialPlayback);
  });
});

describe("moving by hand in Auto", () => {
  const playing = run(loaded, { type: "SCRUB", cursor: 10, keepPlaying: false }, { type: "PLAY", countdownSec: 0, countdownAtStartOnly: false });

  it("keeps playing from the new place when set to", () => {
    expect(run(playing, { type: "SCRUB", cursor: 30, keepPlaying: true })).toMatchObject({ cursor: 30, mode: { kind: "playing" } });
    expect(run(playing, { type: "STEP_LINE", delta: 1, keepPlaying: true }).mode.kind).toBe("playing");
  });

  it("pauses otherwise", () => {
    expect(run(playing, { type: "SCRUB", cursor: 30, keepPlaying: false })).toMatchObject({ cursor: 30, mode: { kind: "paused" } });
    expect(run(playing, { type: "STEP_LINE", delta: 1, keepPlaying: false }).mode.kind).toBe("paused");
  });
});

describe("Follow at the end of a sentence", () => {
  const script = run(
    initialPlayback,
    { type: "SET_SCRIPT", wordCount: 40, paragraphStarts: [0, 30], sentenceEnds: [12, 20], place: "reset" },
    { type: "FOLLOW" }
  );
  const heardAt = (matched: number, position = matched, pace = 3 / 1000): PlaybackEvent => ({ type: "HEARD", matched, position, pace });
  const settle = (state: PlaybackState) => run(state, ...Array.from({ length: 60 }, () => ({ type: "TICK", dtMs: 100, wpm: 100 }) as const));

  it("coasts no further than the end of the sentence the reader was heard in", () => {
    expect(settle(run(script, heardAt(10))).cursor).toBe(12);
  });

  it("allows for the time the match took only up to the end of the sentence", () => {
    expect(settle(run(script, heardAt(11, 14, 0))).cursor).toBe(12);
  });

  it("carries on into the next sentence once the reader is heard in it", () => {
    expect(settle(run(script, heardAt(10), heardAt(13))).cursor).toBe(20);
  });

  it("goes on past the end of a sentence once the reader pauses there and starts again", () => {
    const atEnd = settle(run(script, heardAt(10)));
    expect(atEnd.cursor).toBe(12);
    const readOn = settle(run(atEnd, { type: "VOICE", speaking: true }));
    expect(readOn.cursor).toBe(20);
  });

  it("waits for Whisper when the reader is still finishing the sentence as the cursor gets there", () => {
    const finishing = run(script, { type: "VOICE", speaking: true }, heardAt(10));
    expect(settle(finishing).cursor).toBe(12);
  });

  it("keeps waiting at the end of a sentence through a pause, and through a breath too short to be reading on", () => {
    const atEnd = settle(run(script, heardAt(10)));
    const breath = run(atEnd, { type: "VOICE", speaking: true }, { type: "TICK", dtMs: 100, wpm: 100 }, { type: "VOICE", speaking: false });
    expect(settle(breath).cursor).toBe(12);
  });

  it("stops at the end of a paragraph too", () => {
    expect(settle(run(script, heardAt(25))).cursor).toBe(30);
  });
});
