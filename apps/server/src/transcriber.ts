import type { TranscriberId } from "@teleprompter/protocol";
import { isNil, isString } from "es-toolkit";

export const DEFAULT_WHISPER_URL = "http://127.0.0.1:2022";
export const DEFAULT_WHISPER_MODEL = "Systran/faster-whisper-small";

/** Turns a short clip of speech into text. Rejects with a TranscriberError the reader can act on. */
export type Transcriber = (audio: Blob) => Promise<string>;

export class TranscriberError extends Error {}

/** A setting the server cannot start with. Its message says which one to fix. */
export class ConfigError extends Error {}

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

export const DEFAULT_AZURE_SPEECH_LANGUAGE = "en-US";

const AZURE_RECOGNITION_PATH = "speech/recognition/conversation/cognitiveservices/v1";

export interface AzureSpeechOptions {
  key: string;
  /** The full recognition URL, without its query. */
  endpoint: string;
  language?: string;
  fetch?: typeof fetch;
}

interface AzureSpeechAnswer {
  RecognitionStatus?: unknown;
  DisplayText?: unknown;
}

/** A region such as `westeurope`, or the resource's custom domain endpoint, such as `https://name.cognitiveservices.azure.com/`. */
export type AzureSpeechLocation = { region: string } | { endpoint: string };

export const azureSpeechEndpoint = (location: AzureSpeechLocation): string => {
  if ("region" in location) return `https://${location.region}.stt.speech.microsoft.com/${AZURE_RECOGNITION_PATH}`;
  return new URL(`stt/${AZURE_RECOGNITION_PATH}`, location.endpoint.endsWith("/") ? location.endpoint : `${location.endpoint}/`).href;
};

/** Azure Speech's REST API for short audio, which takes the 16 kHz mono WAV clips Follow sends. */
export const azureSpeechTranscriber = ({
  key,
  endpoint,
  language = DEFAULT_AZURE_SPEECH_LANGUAGE,
  fetch: send = fetch,
}: AzureSpeechOptions): Transcriber => {
  const url = new URL(endpoint);
  url.searchParams.set("language", language);
  url.searchParams.set("format", "simple");
  const { host } = url;

  return async (audio) => {
    let response: Response;

    try {
      response = await send(url, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
          Accept: "application/json",
        },
        body: audio,
      });
    }
    catch {
      throw new TranscriberError(
        `Cannot reach Azure Speech at ${host}. Check your connection, and TELEPROMPTER_AZURE_SPEECH_REGION or TELEPROMPTER_AZURE_SPEECH_ENDPOINT.`
      );
    }

    if (response.status === 401 || response.status === 403) {
      throw new TranscriberError(
        `Azure Speech at ${host} refused the key (${response.status}). Check TELEPROMPTER_AZURE_SPEECH_KEY and that it belongs to this region.`
      );
    }

    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 200);
      throw new TranscriberError(`Azure Speech at ${host} answered ${response.status}. ${detail}`.trim());
    }

    const body = (await response.json().catch(() => null)) as AzureSpeechAnswer | null;

    switch (body?.RecognitionStatus) {
      case "Success":
        if (!isString(body.DisplayText)) break;
        return body.DisplayText;
      // Silence, noise, or speech it could not make out: nothing heard, as Whisper answers for silence.
      case "NoMatch":
      case "InitialSilenceTimeout":
      case "BabbleTimeout":
        return "";
    }

    const status = isString(body?.RecognitionStatus) ? body.RecognitionStatus : "no answer";
    throw new TranscriberError(`Azure Speech at ${host} could not transcribe the clip (${status}).`);
  };
};

export type Transcribers = Partial<Record<TranscriberId, Transcriber>>;

export interface ConfiguredTranscribers {
  transcribers: Transcribers;
  /** Which services Follow can use and where, for the server to say at startup. */
  label: string;
}

/** The Whisper server always, and Azure Speech as well when TELEPROMPTER_AZURE_SPEECH_KEY is set. Throws when the Azure settings are incomplete. */
export const transcribersFromEnv = (env: NodeJS.ProcessEnv): ConfiguredTranscribers => {
  const whisperUrl = env.TELEPROMPTER_WHISPER_URL || DEFAULT_WHISPER_URL;
  const model = env.TELEPROMPTER_WHISPER_MODEL || DEFAULT_WHISPER_MODEL;
  const whisper = whisperTranscriber({ url: whisperUrl, model });
  const whisperLabel = `Whisper at ${whisperUrl} (${model})`;
  const key = env.TELEPROMPTER_AZURE_SPEECH_KEY;
  if (isNil(key) || key === "") return { transcribers: { whisper }, label: whisperLabel };

  const region = env.TELEPROMPTER_AZURE_SPEECH_REGION;
  const customDomain = env.TELEPROMPTER_AZURE_SPEECH_ENDPOINT;
  const location: AzureSpeechLocation | undefined = customDomain ? { endpoint: customDomain } : region ? { region } : undefined;
  if (isNil(location))
    throw new ConfigError("TELEPROMPTER_AZURE_SPEECH_KEY is set, so also set TELEPROMPTER_AZURE_SPEECH_REGION, such as westeurope.");

  const endpoint = azureSpeechEndpoint(location);
  const language = env.TELEPROMPTER_AZURE_SPEECH_LANGUAGE || DEFAULT_AZURE_SPEECH_LANGUAGE;

  return {
    transcribers: { whisper, azure: azureSpeechTranscriber({ key, endpoint, language }) },
    label: `${whisperLabel} or Azure Speech at ${new URL(endpoint).host} (${language})`,
  };
};
