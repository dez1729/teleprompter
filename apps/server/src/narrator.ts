import type { Voices } from "@teleprompter/protocol";
import { isNil, isPlainObject, isString } from "es-toolkit";

export const DEFAULT_KOKORO_URL = "http://127.0.0.1:8880";
export const DEFAULT_KOKORO_VOICE = "af_heart";
/** Kokoro's output: 16-bit mono PCM at this rate. */
const PCM_RATE = 24000;

// The text-to-speech service Read aloud speaks through. Rejects with a NarratorError the reader can act on.
export interface Narrator {
  /** Speaks text at `speed` times the voice's natural pace, as a WAV file. Without `voice`, the default speaks. */
  speak: (text: string, speed: number, voice?: string) => Promise<Uint8Array>;
  voices: () => Promise<Voices>;
}

export class NarratorError extends Error {}

export interface KokoroOptions {
  url?: string;
  voice?: string;
  fetch?: typeof fetch;
}

/** 16-bit mono PCM in a WAV container. Kokoro's own WAV is streamed with no length in its header. */
const wavOf = (pcm: Uint8Array, rate: number): Uint8Array => {
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

/** Kokoro-FastAPI lists voices as names, or as objects with an `id`, depending on its version. */
const voiceName = (entry: unknown): string | null => {
  if (isString(entry)) return entry;
  return isPlainObject(entry) && isString(entry.id) ? entry.id : null;
};

/** A Kokoro server with the OpenAI speech API, such as Kokoro-FastAPI. */
export const kokoroNarrator = ({
  url = DEFAULT_KOKORO_URL,
  voice: defaultVoice = DEFAULT_KOKORO_VOICE,
  fetch: send = fetch,
}: KokoroOptions = {}): Narrator => {
  const request = async (path: string, init?: RequestInit): Promise<Response> => {
    let response: Response;

    try {
      response = await send(new URL(path, url).href, init);
    }
    catch {
      throw new NarratorError(`Cannot reach the Kokoro server at ${url}. Start it, or set TELEPROMPTER_KOKORO_URL.`);
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      throw new NarratorError(`The Kokoro server at ${url} answered ${response.status}. ${detail}`.trim());
    }

    return response;
  };

  return {
    async speak(text, speed, voice = defaultVoice) {
      const response = await request("/v1/audio/speech", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "kokoro", input: text, voice, response_format: "pcm", speed }),
      });

      const pcm = await response.arrayBuffer().then(
        (body) => new Uint8Array(body),
        () => null
      );

      if (isNil(pcm) || pcm.length < 2) throw new NarratorError(`The Kokoro server at ${url} sent no audio.`);
      // A sample split across the end is dropped; WAV samples are whole.
      return wavOf(pcm.subarray(0, pcm.length - (pcm.length % 2)), PCM_RATE);
    },

    async voices() {
      const body = (await (await request("/v1/audio/voices")).json().catch(() => null)) as { voices?: unknown } | null;
      if (!Array.isArray(body?.voices)) throw new NarratorError(`The Kokoro server at ${url} sent no list of voices.`);
      const voices = body.voices.map(voiceName).filter((name): name is string => !isNil(name));
      return { voices, default: defaultVoice };
    },
  };
};
