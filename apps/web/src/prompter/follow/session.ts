import type { Heard } from "@teleprompter/protocol";
import { isNil } from "es-toolkit";
import { transcribe } from "@/lib/scriptApi";
import type { PlaybackEvent } from "../playback";
import { align, heardWords } from "./align";
import { QUIET_MS, type Microphone } from "./microphone";
import { MAX_PACE, NO_STRETCH, speakingWpm, withMatch, withVoice, type Stretch } from "./speakingRate";

/** The least time between clips, so Whisper is not asked about the same half second over and over. */
const INTERVAL_MS = 600;
const QUIET_CHECK_MS = 100;
/** The reader's pace is measured over the matches in this much time. One gap between clips is too noisy. */
const PACE_WINDOW_MS = 3000;

export type FollowStatus = { kind: "off" } | { kind: "starting" } | { kind: "listening" } | { kind: "error"; message: string };

// Where Follow listens: the Spoken-only words, normalized, and the place it expects the reader to be.
export interface FollowPlace {
  script: readonly string[];
  target: number;
}

export interface FollowHost {
  // What Follow hears: the microphone, or Read aloud's voice.
  listen: () => Promise<Microphone>;
  // Read at each clip, so an Edit or a move by hand is seen at once.
  place: () => FollowPlace;
  dispatch: (event: PlaybackEvent) => void;
  onStatus: (status: FollowStatus) => void;
  // The voice's words per minute, or null while it is quiet or not yet measured.
  onWpm: (wpm: number | null) => void;
}

/** Words per ms across the recent matches, or `fallback` when they span too little time, such as after a pause. */
const paceOver = (matches: readonly Heard[], fallback: number): number => {
  const first = matches.at(0);
  const last = matches.at(-1);
  if (isNil(first) || isNil(last) || last.at - first.at < PACE_WINDOW_MS / 3) return fallback;
  const pace = (last.position - first.position) / (last.at - first.at);
  return pace >= 0 && pace <= MAX_PACE ? pace : fallback;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const micError = (error: unknown): string => {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") return "Follow needs the microphone. Allow it in the browser and press F again.";
  if (name === "NotFoundError") return "Follow found no microphone.";
  return `Follow could not open the microphone: ${String(error)}`;
};

// One stretch of Follow, from start() to stop(): listens to the reader and reports where they are with HEARD.
// Stops with an error status, and pauses, when the microphone or the Transcriber fails.
export class FollowSession {
  readonly #host: FollowHost;
  #recent: Heard[] = [];
  // Words per ms, starting from the expected pace until the reader's own is measured.
  #pace: number;
  // The stretch of speech the Speaking rate is measured over.
  #stretch: Stretch = NO_STRETCH;
  // The rate last sent, so it is sent again only when it changes.
  #wpm: number | null = null;
  // When the clip of the last match ended, or when listening started.
  #lastHeardAt = 0;
  #stopped = false;
  #opening: Promise<Microphone> | null = null;
  #quietCheck: ReturnType<typeof setInterval> | undefined;

  constructor(host: FollowHost, expectedPace: number) {
    this.#host = host;
    this.#pace = expectedPace;
  }

  start(): void {
    // A session started while Follow stays on, such as on switching to Read aloud's voice, does not show the last one's rate.
    this.#host.onWpm(null);
    this.#host.onStatus({ kind: "starting" });
    this.#opening = this.#host.listen();

    void this.#opening.then(
      (mic) => this.#listen(mic),
      (error: unknown) => this.#fail(micError(error))
    );
  }

  stop(): void {
    // A failure stops the session, and the pause it causes stops it again.
    if (this.#stopped) return;
    this.#stopped = true;
    clearInterval(this.#quietCheck);

    void this.#opening?.then(
      (mic) => mic.stop(),
      () => {}
    );
  }

  #fail(message: string): void {
    if (this.#stopped) return;
    this.stop();
    this.#host.onStatus({ kind: "error", message });
    this.#host.dispatch({ type: "PAUSE" });
  }

  async #listen(mic: Microphone): Promise<void> {
    if (this.#stopped) return;
    this.#host.onStatus({ kind: "listening" });
    this.#lastHeardAt = performance.now();

    // Checked often, apart from the slower transcription loop, so the cursor stops soon after the reader does.
    this.#quietCheck = setInterval(() => {
      this.#host.dispatch({ type: "VOICE", speaking: mic.voiced() });
      const speaking = mic.speaking();
      if (!speaking) this.#host.dispatch({ type: "QUIET", forMs: QUIET_MS });
      this.#updateStretch(withVoice(this.#stretch, speaking, performance.now()));
    }, QUIET_CHECK_MS);

    while (!this.#stopped) {
      const started = performance.now();
      const clip = mic.clip();

      if (!isNil(clip)) {
        try {
          this.#heard(await transcribe(clip), started);
        }
        catch (error) {
          this.#fail(error instanceof Error ? error.message : String(error));
        }
      }

      await sleep(Math.max(0, INTERVAL_MS - (performance.now() - started)));
    }
  }

  #updateStretch(stretch: Stretch): void {
    // Most quiet checks leave the matches as they were, and the rate with them.
    const refit = stretch.heard !== this.#stretch.heard;
    this.#stretch = stretch;
    if (!refit) return;
    const wpm = speakingWpm(stretch);
    if (wpm === this.#wpm) return;
    this.#wpm = wpm;
    this.#host.onWpm(wpm);
  }

  // `started` is when the clip ended: the reader has kept reading since.
  #heard(text: string, started: number): void {
    const { script, target } = this.#host.place();
    const matched = align(script, heardWords(text), target);
    if (this.#stopped || isNil(matched)) return;

    // Going back starts the pace over; the matches before it say nothing about it.
    const wentBack = matched < (this.#recent.at(-1)?.position ?? 0);
    this.#recent = wentBack ? [] : this.#recent.filter((match) => match.at > started - PACE_WINDOW_MS);
    this.#recent.push({ position: matched, at: started });
    this.#pace = paceOver(this.#recent, this.#pace);
    this.#updateStretch(withMatch(this.#stretch, { position: matched, at: started }));
    // The clip ended when it was sent; the reader has kept reading since.
    const position = matched + this.#pace * (performance.now() - started);
    const readMs = started - this.#lastHeardAt;
    this.#lastHeardAt = started;
    this.#host.dispatch({ type: "HEARD", matched, position, pace: this.#pace, readMs });
  }
}
