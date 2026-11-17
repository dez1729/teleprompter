import type { SpeakRequest, Voices } from "@teleprompter/protocol";
import { isNil, isPlainObject, isString } from "es-toolkit";

export const DEFAULT_KOKORO_URL = "http://127.0.0.1:8880";
export const DEFAULT_KOKORO_VOICE = "af_heart";
// Kokoro's output: 16-bit mono PCM at this rate.
const PCM_RATE = 24000;
// Kokoro speaks the longest passage Read aloud sends in a few seconds; past this, it has hung.
const SPEAK_TIMEOUT_MS = 20_000;
const VOICES_TIMEOUT_MS = 5_000;

// The text-to-speech service Read aloud speaks through. Rejects with a NarratorError the reader can act on.
export interface Narrator {
  // Speaks the text as a WAV file. `signal` aborts it when the reader no longer needs it, such as after a move by hand.
  speak: (request: SpeakRequest, signal?: AbortSignal) => Promise<Uint8Array<ArrayBuffer>>;
  voices: () => Promise<Voices>;
}

export class NarratorError extends Error {}

export interface KokoroOptions {
  url?: string;
  voice?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

// 16-bit mono PCM in a WAV container. Kokoro's own WAV is streamed with no length in its header.
const wavOf = (pcm: Uint8Array, rate: number): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(44 + pcm.length);
  const view = new DataView(out.buffer);
  const text = (offset: number, value: string) => out.set(new TextEncoder().encode(value), offset);

  text(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
};

// Kokoro-FastAPI lists voices as names, or as objects with an `id`, depending on its version.
const voiceName = (entry: unknown): string | null => {
  if (isString(entry)) return entry;
  return isPlainObject(entry) && isString(entry.id) ? entry.id : null;
};

// A Kokoro server with the OpenAI speech API, such as Kokoro-FastAPI.
export const kokoroNarrator = ({
  url = DEFAULT_KOKORO_URL,
  voice: defaultVoice = DEFAULT_KOKORO_VOICE,
  timeoutMs,
  fetch: send = fetch,
}: KokoroOptions = {}): Narrator => {
  const request = async (path: string, init: RequestInit): Promise<Response> => {
    let response: Response;

    try {
      response = await send(new URL(path, url).href, init);
    }
    catch (error) {
      throw new NarratorError(`Cannot reach the Kokoro server at ${url}. Start it, or set TELEPROMPTER_KOKORO_URL.`, { cause: error });
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      throw new NarratorError(`The Kokoro server at ${url} answered ${response.status}. ${detail}`.trim());
    }

    return response;
  };

  // Runs one exchange with Kokoro, reading the answer included, within `limitMs`. Rejects with the caller's reason when
  // `signal` aborts, so nothing reports a cancelled passage as Kokoro failing.
  const within = async <T>(limitMs: number, signal: AbortSignal | undefined, exchange: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    const timeout = AbortSignal.timeout(limitMs);

    try {
      return await exchange(isNil(signal) ? timeout : AbortSignal.any([signal, timeout]));
    }
    catch (error) {
      if (signal?.aborted) throw signal.reason;
      if (timeout.aborted) throw new NarratorError(`The Kokoro server at ${url} did not answer within ${limitMs / 1000} s.`);
      throw error instanceof NarratorError ? error : new NarratorError(`The Kokoro server at ${url} stopped answering.`, { cause: error });
    }
  };

  return {
    async speak({ text, speed, voice = defaultVoice }, signal) {
      const pcm = await within(timeoutMs ?? SPEAK_TIMEOUT_MS, signal, async (limited) => {
        const response = await request("/v1/audio/speech", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: "kokoro", input: text, voice, response_format: "pcm", speed }),
          signal: limited,
        });

        return new Uint8Array(await response.arrayBuffer());
      });

      if (pcm.length < 2) throw new NarratorError(`The Kokoro server at ${url} sent no audio.`);
      // A sample split across the end is dropped; WAV samples are whole.
      return wavOf(pcm.subarray(0, pcm.length - (pcm.length % 2)), PCM_RATE);
    },

    async voices() {
      const body = await within(timeoutMs ?? VOICES_TIMEOUT_MS, undefined, async (limited) => {
        const response = await request("/v1/audio/voices", { signal: limited });
        return (await response.json().catch(() => null)) as { voices?: unknown } | null;
      });

      if (!Array.isArray(body?.voices)) throw new NarratorError(`The Kokoro server at ${url} sent no list of voices.`);
      const voices = body.voices.map(voiceName).filter((name): name is string => !isNil(name));
      return { voices, default: defaultVoice };
    },
  };
};
