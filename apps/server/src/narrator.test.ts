import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app.ts";
import { kokoroNarrator, NarratorError, type Narrator } from "./narrator.ts";
import { ScriptStore } from "./store.ts";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tp-speak-"));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const speak = (narrator: Narrator | undefined, body: unknown = { text: "Hello there.", speed: 1.2 }) => {
  const app = createApp({ store: new ScriptStore(dir), port: () => 4747, narrator });
  return app.request("/api/speak", {
    method: "POST",
    headers: { host: "localhost:4747", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
};

describe("POST /api/speak", () => {
  it("answers with the Narrator's audio", async () => {
    const res = await speak(async (text, speed) => new TextEncoder().encode(`${text} at ${speed}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/wav");
    expect(await res.text()).toBe("Hello there. at 1.2");
  });

  it("passes on why the Narrator failed", async () => {
    const res = await speak(() => Promise.reject(new NarratorError("Cannot reach the Kokoro server.")));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Cannot reach the Kokoro server." });
  });

  it("refuses empty text and a speed out of range", async () => {
    const narrator: Narrator = async () => new Uint8Array(2);
    expect((await speak(narrator, { text: "  ", speed: 1 })).status).toBe(400);
    expect((await speak(narrator, { text: "Hi.", speed: 9 })).status).toBe(400);
  });

  it("says when no Narrator is set up", async () => {
    expect((await speak(undefined)).status).toBe(503);
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

    const wav = await narrator("Hello.", 1.5);
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
    await expect(narrator("Hi.", 1)).rejects.toThrow(/Cannot reach the Kokoro server at http:\/\/127\.0\.0\.1:8880\..*TELEPROMPTER_KOKORO_URL/);
  });

  it("reports an error answer with its status", async () => {
    const narrator = kokoroNarrator({ fetch: async () => new Response("voice not found", { status: 400 }) });
    await expect(narrator("Hi.", 1)).rejects.toThrow(/answered 400\. voice not found/);
  });
});
