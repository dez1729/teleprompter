import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { startServer } from "./index.ts";
import { kokoroNarrator, NarratorError, type Narrator } from "./narrator.ts";
import { ScriptStore } from "./store.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tp-speak-"));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const narrating = (speak: Narrator["speak"], voices: Narrator["voices"] = async () => ({ voices: [], default: "af_heart" })): Narrator => ({
  speak,
  voices,
});

const speak = (narrator: Narrator | undefined, body: unknown = { text: "Hello there.", speed: 1.2, voice: "bf_emma" }) => {
  const app = createApp({ store: new ScriptStore(dir), port: () => 4747, narrator });
  return app.request("/api/speak", {
    method: "POST",
    headers: { host: "localhost:4747", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
};

const voices = (narrator: Narrator | undefined) => {
  const app = createApp({ store: new ScriptStore(dir), port: () => 4747, narrator });
  return app.request("/api/voices", { headers: { host: "localhost:4747" } });
};

describe("POST /api/speak", () => {
  it("answers with the Narrator's audio", async () => {
    const res = await speak(narrating(async ({ text, speed, voice }) => new TextEncoder().encode(`${text} at ${speed} by ${voice}`)));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/wav");
    expect(await res.text()).toBe("Hello there. at 1.2 by bf_emma");
  });

  it("passes on why the Narrator failed", async () => {
    const res = await speak(narrating(() => Promise.reject(new NarratorError("Cannot reach the Kokoro server."))));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Cannot reach the Kokoro server." });
  });

  it("refuses empty text, a speed out of range, and a voice that is not a name", async () => {
    const narrator = narrating(async () => new Uint8Array(2));
    expect((await speak(narrator, { text: "  ", speed: 1 })).status).toBe(400);
    expect((await speak(narrator, { text: "Hi.", speed: 9 })).status).toBe(400);
    expect((await speak(narrator, { text: "Hi.", speed: 1, voice: "../etc" })).status).toBe(400);
  });

  it("says when no Narrator is set up", async () => {
    expect((await speak(undefined)).status).toBe(503);
  });
});

describe("GET /api/voices", () => {
  it("lists the Narrator's voices and its default", async () => {
    const res = await voices(
      narrating(
        async () => new Uint8Array(2),
        async () => ({ voices: ["af_heart", "bf_emma"], default: "af_heart" })
      )
    );
    expect(await res.json()).toEqual({ voices: ["af_heart", "bf_emma"], default: "af_heart" });
  });

  it("passes on why the Narrator failed", async () => {
    const res = await voices(
      narrating(
        async () => new Uint8Array(2),
        () => Promise.reject(new NarratorError("Cannot reach the Kokoro server."))
      )
    );
    expect(res.status).toBe(502);
  });

  it("says when no Narrator is set up", async () => {
    expect((await voices(undefined)).status).toBe(503);
  });
});

describe("kokoroNarrator", () => {
  it("asks for raw PCM and wraps it in a WAV header with its length", async () => {
    let sent: { url: string; body: unknown } | undefined;
    const narrator = kokoroNarrator({
      url: "http://127.0.0.1:8880",
      voice: "bf_emma",
      fetch: async (url, init) => {
        sent = { url: new Request(url).url, body: JSON.parse(init!.body as string) };
        return new Response(new Uint8Array([1, 0, 2, 0, 3]));
      },
    });

    const wav = await narrator.speak({ text: "Hello.", speed: 1.5 });
    const view = new DataView(wav.buffer);
    expect(sent).toEqual({
      url: "http://127.0.0.1:8880/v1/audio/speech",
      body: { model: "kokoro", input: "Hello.", voice: "bf_emma", response_format: "pcm", speed: 1.5 },
    });
    expect(new TextDecoder().decode(wav.subarray(0, 4))).toBe("RIFF");
    expect(view.getUint32(24, true)).toBe(24000);
    expect(view.getUint32(40, true)).toBe(4);
    expect([...wav.subarray(44)]).toEqual([1, 0, 2, 0]);
  });

  it("tells the reader how to fix an unreachable server", async () => {
    const narrator = kokoroNarrator({ fetch: () => Promise.reject(new TypeError("fetch failed")) });
    await expect(narrator.speak({ text: "Hi.", speed: 1 })).rejects.toThrow(
      /Cannot reach the Kokoro server at http:\/\/127\.0\.0\.1:8880\..*TELEPROMPTER_KOKORO_URL/
    );
  });

  it("reports an error answer with its status", async () => {
    const narrator = kokoroNarrator({ fetch: async () => new Response("voice not found", { status: 400 }) });
    await expect(narrator.speak({ text: "Hi.", speed: 1 })).rejects.toThrow(/answered 400\. voice not found/);
  });
});

describe("kokoroNarrator voices", () => {
  it("speaks in the voice asked for", async () => {
    let voice: unknown;
    const narrator = kokoroNarrator({
      fetch: async (_url, init) => {
        voice = (JSON.parse(init!.body as string) as { voice: unknown }).voice;
        return new Response(new Uint8Array([0, 0]));
      },
    });

    await narrator.speak({ text: "Hi.", speed: 1, voice: "am_adam" });
    expect(voice).toBe("am_adam");
  });

  it("lists voices whether Kokoro sends names or objects", async () => {
    const listing = (voices: unknown[]) => kokoroNarrator({ voice: "bf_emma", fetch: async () => Response.json({ voices }) }).voices();
    expect(await listing(["af_heart", "bf_emma"])).toEqual({ voices: ["af_heart", "bf_emma"], default: "bf_emma" });
    expect(await listing([{ id: "af_heart", name: "af_heart" }, { name: "no id" }])).toEqual({ voices: ["af_heart"], default: "bf_emma" });
  });
});

// Answers once `signal` aborts, as fetch does: with the signal's reason.
const hang = (signal: AbortSignal | null | undefined): Promise<Response> =>
  new Promise((_, reject) => signal?.addEventListener("abort", () => reject(signal.reason as Error)));

describe("kokoroNarrator limits", () => {
  it("gives up on a Kokoro that does not answer in time", async () => {
    const narrator = kokoroNarrator({ timeoutMs: 50, fetch: (_url, init) => hang(init?.signal) });
    await expect(narrator.speak({ text: "Hi.", speed: 1 })).rejects.toThrow(/did not answer within 0\.05 s/);
    await expect(narrator.voices()).rejects.toThrow(/did not answer within 0\.05 s/);
  });

  it("stops asking Kokoro when the caller aborts, without calling it a Kokoro failure", async () => {
    const caller = new AbortController();
    const narrator = kokoroNarrator({ fetch: (_url, init) => hang(init?.signal) });
    const speaking = narrator.speak({ text: "Hi.", speed: 1 }, caller.signal);
    caller.abort(new Error("moved on"));
    await expect(speaking).rejects.toThrow("moved on");
  });
});

describe("POST /api/speak over HTTP", () => {
  it("aborts the Narrator when the browser cancels the request", async () => {
    const called = Promise.withResolvers<void>();
    const aborted = Promise.withResolvers<void>();
    const narrator = narrating((_request, signal) => {
      signal?.addEventListener("abort", () => aborted.resolve());
      called.resolve();
      return new Promise(() => {});
    });

    const server = await startServer({ port: 0, dataDir: dir, webDir: dir, narrator });

    try {
      const browser = new AbortController();
      const sent = fetch(`${server.url}/api/speak`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Hi.", speed: 1 }),
        signal: browser.signal,
      }).catch(() => {});

      await called.promise;
      browser.abort();
      await sent;
      await aborted.promise;
    }
    finally {
      await server.close();
    }
  });
});
