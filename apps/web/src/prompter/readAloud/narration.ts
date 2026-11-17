import { isNil } from "es-toolkit";
import { speak } from "@/lib/scriptApi";
import type { PlaybackEvent } from "../playback";
import { INITIAL_PACE, measured, speedFor, type VoicePace } from "./pace";
import type { Passage } from "./passages";
import type { VoiceOutput } from "./voiceOutput";

export type NarrationStatus = { kind: "off" } | { kind: "starting" } | { kind: "speaking" } | { kind: "error"; message: string };

export interface NarrationHost {
  // Read at each passage, so an Edit is spoken once the voice gets there.
  passageAt: (from: number, minWords?: number) => Passage | null;
  wpm: () => number;
  dispatch: (event: PlaybackEvent) => void;
  onStatus: (status: NarrationStatus) => void;
}

const waitUntil = (context: AudioContext, time: number) => {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, (time - context.currentTime) * 1000)));
};

// One stretch of Read aloud, from start() to stop(): speaks the Script passage by passage from a word on. The next
// passage is fetched while one plays, and starts the moment it ends. Stops with an error status, and pauses, when the
// Narrator fails.
export class Narration {
  readonly #host: NarrationHost;
  readonly #voice: VoiceOutput;
  readonly #from: number;
  readonly #abort = new AbortController();
  readonly #playing = new Set<AudioBufferSourceNode>();
  // Carried from one Narration to the next, so the voice keeps its measured pace.
  #pace: VoicePace;

  constructor(host: NarrationHost, voice: VoiceOutput, from: number, pace: VoicePace = INITIAL_PACE) {
    this.#host = host;
    this.#voice = voice;
    this.#from = from;
    this.#pace = pace;
  }

  get pace(): VoicePace {
    return this.#pace;
  }

  start(): void {
    this.#host.onStatus({ kind: "starting" });
    void this.#speak().catch((error: unknown) => this.#fail(error));
  }

  stop(): void {
    this.#abort.abort();
    for (const source of this.#playing) source.stop();
    this.#playing.clear();
  }

  get #stopped(): boolean {
    return this.#abort.signal.aborted;
  }

  #fail(error: unknown): void {
    if (this.#stopped) return;
    this.stop();
    const reason = error instanceof Error ? error.message : String(error);
    this.#host.onStatus({ kind: "error", message: `Read aloud stopped. ${reason}` });
    this.#host.dispatch({ type: "PAUSE" });
  }

  async #speak(): Promise<void> {
    const { context, output } = this.#voice.open();
    await context.resume();
    let ends = context.currentTime;

    // The first passage is one sentence, however short, so the voice starts soon.
    for (let passage = this.#host.passageAt(this.#from, 1); !isNil(passage); passage = this.#host.passageAt(passage.end)) {
      const speed = speedFor(this.#pace, this.#host.wpm());
      const audio = await context.decodeAudioData(await speak({ text: passage.text, speed }, this.#abort.signal));
      if (this.#stopped) return;

      const source = context.createBufferSource();
      source.buffer = audio;
      source.connect(output);
      source.onended = () => this.#playing.delete(source);
      this.#playing.add(source);
      const startsAt = Math.max(ends, context.currentTime);
      source.start(startsAt);
      ends = startsAt + audio.duration;
      this.#pace = measured(this.#pace, passage.end - passage.start, audio.duration, speed);
      this.#host.onStatus({ kind: "speaking" });

      // Fetching the next passage once this one starts keeps one passage ahead, and a change of pace is heard soon.
      await waitUntil(context, startsAt);
      if (this.#stopped) return;
    }

    await waitUntil(context, ends);
    if (!this.#stopped) this.#host.onStatus({ kind: "off" });
  }
}
