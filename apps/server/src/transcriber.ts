import { isString } from "es-toolkit";

export const DEFAULT_WHISPER_URL = "http://127.0.0.1:2022";
export const DEFAULT_WHISPER_MODEL = "Systran/faster-whisper-small";

/** Turns a short clip of speech into text. Rejects with a TranscriberError the reader can act on. */
export type Transcriber = (audio: Blob) => Promise<string>;

export class TranscriberError extends Error {}

export interface WhisperOptions {
  url?: string;
  model?: string;
  fetch?: typeof fetch;
}

/** A Whisper server with the OpenAI transcription API, such as Speaches or whisper.cpp's server. */
export const whisperTranscriber = ({
  url = DEFAULT_WHISPER_URL,
  model = DEFAULT_WHISPER_MODEL,
  fetch: send = fetch,
}: WhisperOptions = {}): Transcriber => {
  const endpoint = new URL("/v1/audio/transcriptions", url).href;

  return async (audio) => {
    const form = new FormData();
    form.append("file", audio, "speech.wav");
    form.append("model", model);
    form.append("response_format", "json");
    // Without it, Whisper hears words such as "You" in silence.
    form.append("vad_filter", "true");
    let response: Response;

    try {
      response = await send(endpoint, { method: "POST", body: form });
    }
    catch {
      throw new TranscriberError(`Cannot reach the Whisper server at ${url}. Start it, or set TELEPROMPTER_WHISPER_URL.`);
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      throw new TranscriberError(`The Whisper server at ${url} answered ${response.status}. ${detail}`.trim());
    }

    const body = (await response.json().catch(() => null)) as { text?: unknown } | null;
    if (!isString(body?.text)) throw new TranscriberError(`The Whisper server at ${url} sent no text.`);
    return body.text;
  };
};
