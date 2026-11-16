import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { ScriptStore } from "./store.ts";
import {
  azureSpeechEndpoint,
  azureSpeechTranscriber,
  ConfigError,
  TranscriberError,
  transcribersFromEnv,
  whisperTranscriber,
  type Transcriber,
  type Transcribers,
} from "./transcriber.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tp-transcribe-"));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const speech = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/wav" });

const transcribe = (transcribers: Transcribers, query = "", body: Blob = speech) => {
  const app = createApp({ store: new ScriptStore(dir), port: () => 4747, transcribers });
  return app.request(`/api/transcribe${query}`, { method: "POST", headers: { host: "localhost:4747", "content-type": "audio/wav" }, body });
};

const hearing =
  (name: string): Transcriber =>
  async (audio) =>
    `${name} heard ${audio.size} bytes`;

describe("GET /api/transcribers", () => {
  const available = async (transcribers: Transcribers) => {
    const app = createApp({ store: new ScriptStore(dir), port: () => 4747, transcribers });
    return (await app.request("/api/transcribers", { headers: { host: "localhost:4747" } })).json();
  };

  it("lists the Transcribers set up on the server", async () => {
    expect(await available({ whisper: hearing("whisper") })).toEqual({ available: ["whisper"] });
    expect(await available({ whisper: hearing("whisper"), azure: hearing("azure") })).toEqual({ available: ["whisper", "azure"] });
  });
});

describe("POST /api/transcribe", () => {
  it("answers with what the chosen Transcriber heard", async () => {
    const res = await transcribe({ whisper: hearing("whisper"), azure: hearing("azure") }, "?transcriber=azure");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "azure heard 3 bytes" });
  });

  it("uses Whisper when no Transcriber is named", async () => {
    const res = await transcribe({ whisper: hearing("whisper"), azure: hearing("azure") });
    expect(await res.json()).toEqual({ text: "whisper heard 3 bytes" });
  });

  it("passes on why the Transcriber failed", async () => {
    const res = await transcribe({ whisper: () => Promise.reject(new TranscriberError("Cannot reach the Whisper server.")) });
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Cannot reach the Whisper server." });
  });

  it("refuses empty audio", async () => {
    expect((await transcribe({ whisper: hearing("whisper") }, "", new Blob([]))).status).toBe(400);
  });

  it("refuses a Transcriber it does not know", async () => {
    expect((await transcribe({ whisper: hearing("whisper") }, "?transcriber=siri")).status).toBe(400);
  });

  it("says how to set up Azure Speech when it is chosen but not set up", async () => {
    const res = await transcribe({ whisper: hearing("whisper") }, "?transcriber=azure");
    expect(res.status).toBe(503);
    expect((await res.json()) as unknown).toEqual({ error: expect.stringMatching(/^Azure Speech is not set up.*TELEPROMPTER_AZURE_SPEECH_KEY/) });
  });
});

describe("whisperTranscriber", () => {
  it("sends the clip to the OpenAI transcription endpoint with silence filtered out", async () => {
    let sent: { url: string; form: FormData } | undefined;
    const transcriber = whisperTranscriber({
      url: "http://127.0.0.1:2022",
      model: "tiny",
      fetch: async (url, init) => {
        sent = { url: new Request(url).url, form: init!.body as FormData };
        return Response.json({ text: " Hello there." });
      },
    });

    expect(await transcriber(speech)).toBe(" Hello there.");
    expect(sent!.url).toBe("http://127.0.0.1:2022/v1/audio/transcriptions");
    expect(sent!.form.get("model")).toBe("tiny");
    expect(sent!.form.get("vad_filter")).toBe("true");
  });

  it("tells the reader how to fix an unreachable server", async () => {
    const transcriber = whisperTranscriber({ fetch: () => Promise.reject(new TypeError("fetch failed")) });
    await expect(transcriber(speech)).rejects.toThrow(/Cannot reach the Whisper server at http:\/\/127\.0\.0\.1:2022\..*TELEPROMPTER_WHISPER_URL/);
  });

  it("reports an error answer with its status", async () => {
    const transcriber = whisperTranscriber({ fetch: async () => new Response("model not found", { status: 404 }) });
    await expect(transcriber(speech)).rejects.toThrow(/answered 404\. model not found/);
  });
});

const azureAnswering = (answer: () => Response | Promise<Response>) => {
  const sent: { url: string; init: RequestInit }[] = [];

  const transcriber = azureSpeechTranscriber({
    key: "secret",
    endpoint: azureSpeechEndpoint({ region: "westeurope" }),
    fetch: async (url, init) => {
      sent.push({ url: new Request(url).url, init: init! });
      return answer();
    },
  });

  return { transcriber, sent };
};

describe("azureSpeechTranscriber", () => {
  it("sends the clip to the short audio endpoint as 16 kHz WAV with the key", async () => {
    const { transcriber, sent } = azureAnswering(() => Response.json({ RecognitionStatus: "Success", DisplayText: "Hello there." }));

    expect(await transcriber(speech)).toBe("Hello there.");
    expect(sent.at(0)!.url).toBe(
      "https://westeurope.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=en-US&format=simple"
    );
    expect(new Headers(sent.at(0)!.init.headers).get("ocp-apim-subscription-key")).toBe("secret");
    expect(new Headers(sent.at(0)!.init.headers).get("content-type")).toBe("audio/wav; codecs=audio/pcm; samplerate=16000");
    expect(sent.at(0)!.init.body).toBe(speech);
  });

  it.each(["NoMatch", "InitialSilenceTimeout", "BabbleTimeout"])("hears nothing when it answers %s", async (status) => {
    const { transcriber } = azureAnswering(() => Response.json({ RecognitionStatus: status }));
    expect(await transcriber(speech)).toBe("");
  });

  it("reports a recognition error", async () => {
    const { transcriber } = azureAnswering(() => Response.json({ RecognitionStatus: "Error" }));
    await expect(transcriber(speech)).rejects.toThrow(/could not transcribe the clip \(Error\)/);
  });

  it("tells the reader to check the key when Azure refuses it", async () => {
    const { transcriber } = azureAnswering(() => new Response("", { status: 401 }));
    await expect(transcriber(speech)).rejects.toThrow(/refused the key \(401\).*TELEPROMPTER_AZURE_SPEECH_KEY/);
  });

  it("tells the reader how to fix an unreachable service", async () => {
    const { transcriber } = azureAnswering(() => Promise.reject(new TypeError("fetch failed")));
    await expect(transcriber(speech)).rejects.toThrow(/Cannot reach Azure Speech at westeurope\.stt\.speech\.microsoft\.com/);
  });
});

describe("azureSpeechEndpoint", () => {
  it("uses the stt path on a custom domain endpoint, with or without its trailing slash", () => {
    const expected = "https://name.cognitiveservices.azure.com/stt/speech/recognition/conversation/cognitiveservices/v1";
    expect(azureSpeechEndpoint({ endpoint: "https://name.cognitiveservices.azure.com/" })).toBe(expected);
    expect(azureSpeechEndpoint({ endpoint: "https://name.cognitiveservices.azure.com" })).toBe(expected);
  });
});

describe("transcribersFromEnv", () => {
  // The Transcribers are made after fetch is replaced, since each keeps the fetch it was made with.
  const heardFrom = async (env: NodeJS.ProcessEnv, id: keyof Transcribers) => {
    const urls: string[] = [];
    const realFetch = globalThis.fetch;

    globalThis.fetch = async (url) => {
      urls.push(new Request(url).url);
      return Response.json({ text: "", RecognitionStatus: "NoMatch" });
    };

    try {
      await transcribersFromEnv(env).transcribers[id]!(speech);
    }
    finally {
      globalThis.fetch = realFetch;
    }

    return urls.at(0)!;
  };

  it("sets up only the Whisper server when no Azure key is set", async () => {
    const env = { TELEPROMPTER_WHISPER_URL: "http://127.0.0.1:8080" };
    const { transcribers, label } = transcribersFromEnv(env);
    expect(Object.keys(transcribers)).toEqual(["whisper"]);
    expect(await heardFrom(env, "whisper")).toBe("http://127.0.0.1:8080/v1/audio/transcriptions");
    expect(label).toBe("Whisper at http://127.0.0.1:8080 (Systran/faster-whisper-small)");
  });

  it("sets up Azure Speech beside Whisper in the region and language set, and names it without the key", async () => {
    const env = { TELEPROMPTER_AZURE_SPEECH_KEY: "secret", TELEPROMPTER_AZURE_SPEECH_REGION: "eastus", TELEPROMPTER_AZURE_SPEECH_LANGUAGE: "fr-FR" };
    const { transcribers, label } = transcribersFromEnv(env);
    expect(Object.keys(transcribers)).toEqual(["whisper", "azure"]);
    expect(await heardFrom(env, "azure")).toBe(
      "https://eastus.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=fr-FR&format=simple"
    );
    expect(label).toBe("Whisper at http://127.0.0.1:2022 (Systran/faster-whisper-small) or Azure Speech at eastus.stt.speech.microsoft.com (fr-FR)");
  });

  it("prefers the custom domain endpoint to the region", async () => {
    const env = {
      TELEPROMPTER_AZURE_SPEECH_KEY: "secret",
      TELEPROMPTER_AZURE_SPEECH_REGION: "eastus",
      TELEPROMPTER_AZURE_SPEECH_ENDPOINT: "https://name.cognitiveservices.azure.com/",
    };
    expect(await heardFrom(env, "azure")).toMatch(/^https:\/\/name\.cognitiveservices\.azure\.com\/stt\//);
  });

  it("refuses a key with no region or endpoint", () => {
    expect(() => transcribersFromEnv({ TELEPROMPTER_AZURE_SPEECH_KEY: "secret" })).toThrow(ConfigError);
  });
});
