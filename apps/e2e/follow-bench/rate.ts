// Checks the Speaking rate against a voice whose rate is known. Kokoro speaks a passage at a few speeds, Whisper times
// each word, and Chromium's microphone plays the recording while the Prompter follows it. Each second the shown rate
// is compared with the true rate over the same last ten seconds.
// Usage: node follow-bench/rate.ts [--speed 0.8 --speed 1 --speed 1.3]
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import { normalizeWord, type PushRequest } from "@teleprompter/protocol";
import { optionsFromEnv, startServer } from "@teleprompter/server";

const PASSAGE =
  "The harbor wakes before the town does. Fishing boats slip their moorings while the lamps still burn, and gulls " +
  "follow them out past the breakwater. By seven the first catch is on the dock, sorted into crates of ice. Buyers " +
  "from the restaurants arrive with lists and cash. Nobody haggles for long, because the tide waits for no one. By " +
  "noon the boats are scrubbed, the nets are mended, and the harbor falls quiet again until evening. The market " +
  "empties slowly as the sun climbs over the roofs. Children run along the sea wall, and old men sit on the benches " +
  "outside the chandlery, arguing about the weather and the price of diesel.";
const KOKORO_URL = process.env.KOKORO_URL ?? "http://127.0.0.1:8880";
const WHISPER_URL = process.env.TELEPROMPTER_WHISPER_URL ?? "http://127.0.0.1:2022";
const WHISPER_MODEL = process.env.TELEPROMPTER_WHISPER_MODEL ?? "Systran/faster-whisper-small";
const WEB_DIR = join(import.meta.dirname, "../../web/dist");
const WINDOW_SEC = 10;
const TAIL_SEC = 4;

const speak = async (speed: number): Promise<Buffer> => {
  const response = await fetch(new URL("/v1/audio/speech", KOKORO_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "kokoro", input: PASSAGE, voice: "af_heart", response_format: "wav", speed }),
  });

  if (!response.ok) throw new Error(`Kokoro answered ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};

// When each word starts, in seconds from the start of the recording.
const wordStarts = async (audio: Buffer): Promise<number[]> => {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/wav" }), "speech.wav");
  form.append("model", WHISPER_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  const response = await fetch(new URL("/v1/audio/transcriptions", WHISPER_URL), { method: "POST", body: form });
  if (!response.ok) throw new Error(`Whisper answered ${response.status}`);
  const { words } = (await response.json()) as { words: { word: string; start: number }[] };
  return words.filter((w) => normalizeWord(w.word) !== "").map((w) => w.start);
};

// The recording with silence after it, so Chromium's looping microphone does not start it over during the run.
const withTail = (wav: Buffer): Buffer => {
  const rate = wav.readUInt32LE(24);
  const blockAlign = wav.readUInt16LE(32);
  const dataAt = wav.indexOf("data") + 8;
  const data = Buffer.concat([wav.subarray(dataAt), Buffer.alloc(TAIL_SEC * rate * blockAlign)]);
  const header = Buffer.from(wav.subarray(0, dataAt));
  header.writeUInt32LE(header.length - 8 + data.length, 4);
  header.writeUInt32LE(data.length, dataAt - 4);
  return Buffer.concat([header, data]);
};

// The true rate at `sec`: words started in the last WINDOW_SEC, over the time since the first of them.
const trueWpm = (starts: readonly number[], sec: number): number | null => {
  const recent = starts.filter((s) => s <= sec && s > sec - WINDOW_SEC);
  if (recent.length < 2) return null;
  return ((recent.length - 1) / (recent.at(-1)! - recent.at(0)!)) * 60;
};

const run = async (speed: number, dir: string) => {
  const audio = await speak(speed);
  const starts = await wordStarts(audio);
  const clip = join(dir, `speed-${speed}.wav`);
  writeFileSync(clip, withTail(audio));
  const overall = ((starts.length - 1) / (starts.at(-1)! - starts.at(0)!)) * 60;

  const dataDir = mkdtempSync(join(tmpdir(), "tp-rate-bench-"));
  const server = await startServer({ ...optionsFromEnv(), port: 0, dataDir, webDir: WEB_DIR });
  const browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${clip}`],
  });

  try {
    await fetch(`${server.url}/api/script`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "replace", text: PASSAGE } satisfies PushRequest as PushRequest),
    });

    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.goto(server.url);
    await page.locator("[data-word]").first().waitFor();
    await page.keyboard.press("f");
    await page.keyboard.press(" ");
    await page.waitForSelector('[data-follow-status="listening"]');
    // The fake microphone starts playing about when it opens, so the recording's clock starts here.
    const opened = Date.now();
    const shown: string[] = [];
    const errors: number[] = [];

    while ((Date.now() - opened) / 1000 < starts.at(-1)! + TAIL_SEC - 0.5) {
      await page.waitForTimeout(1000);
      const sec = (Date.now() - opened) / 1000;
      const text = (await page.locator("div.absolute [data-speaking-rate]").textContent()) ?? "";
      const truth = trueWpm(starts, sec);
      const value = Number.parseInt(text, 10);
      if (Number.isFinite(value) && truth !== null && sec > 3) errors.push(value - truth);
      shown.push(`${sec.toFixed(0)}s ${text.replace(" wpm", "")}/${truth === null ? "-" : truth.toFixed(0)}`);
    }

    const abs = errors.map(Math.abs).sort((a, b) => a - b);
    const mean = errors.reduce((sum, e) => sum + e, 0) / errors.length;
    console.log(`speed ${speed}: true ${overall.toFixed(0)} wpm overall`);
    console.log(`  shown/true each second: ${shown.join("  ")}`);
    console.log(
      `  over ${errors.length} readings: mean error ${mean.toFixed(1)} wpm, median |error| ${abs.at(abs.length >> 1)?.toFixed(1)}, ` +
        `max |error| ${abs.at(-1)?.toFixed(1)}`
    );
  }
  finally {
    await browser.close();
    await server.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
};

const { values } = parseArgs({ options: { speed: { type: "string", multiple: true, default: ["0.8", "1", "1.3"] } } });
const dir = mkdtempSync(join(tmpdir(), "tp-rate-clips-"));

try {
  for (const speed of values.speed) await run(Number(speed), dir);
}
finally {
  rmSync(dir, { recursive: true, force: true });
}
