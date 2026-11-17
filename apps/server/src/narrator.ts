import { isNil } from "es-toolkit";

export const DEFAULT_KOKORO_URL = "http://127.0.0.1:8880";
export const DEFAULT_KOKORO_VOICE = "af_heart";
/** Kokoro's output: 16-bit mono PCM at this rate. */
const PCM_RATE = 24000;

/** Speaks text at `speed` times the voice's natural pace, as a WAV file. Rejects with a NarratorError the reader can act on. */
export type Narrator = (text: string, speed: number) => Promise<Uint8Array>;

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

/** A Kokoro server with the OpenAI speech API, such as Kokoro-FastAPI. */
export const kokoroNarrator = ({ url = DEFAULT_KOKORO_URL, voice = DEFAULT_KOKORO_VOICE, fetch: send = fetch }: KokoroOptions = {}): Narrator => {
  const endpoint = new URL("/v1/audio/speech", url).href;

  return async (text, speed) => {
    let response: Response;

    try {
      response = await send(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "kokoro", input: text, voice, response_format: "pcm", speed }),
      });
    }
    catch {
      throw new NarratorError(`Cannot reach the Kokoro server at ${url}. Start it, or set TELEPROMPTER_KOKORO_URL.`);
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      throw new NarratorError(`The Kokoro server at ${url} answered ${response.status}. ${detail}`.trim());
    }

    const pcm = await response.arrayBuffer().then(
      (body) => new Uint8Array(body),
      () => null
    );
    if (isNil(pcm) || pcm.length < 2) throw new NarratorError(`The Kokoro server at ${url} sent no audio.`);
    // A sample split across the end is dropped; WAV samples are whole.
    return wavOf(pcm.subarray(0, pcm.length - (pcm.length % 2)), PCM_RATE);
  };
};
