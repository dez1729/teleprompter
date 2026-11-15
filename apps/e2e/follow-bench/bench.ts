// Measures how closely Follow keeps up with a voice. Kokoro speaks a paragraph, Whisper times each word, and the
// recording, cut to start at a chosen word, is Chromium's microphone while the Prompter follows it.
// Usage: node follow-bench/bench.ts [--from 62 --from 30 --from 0] [--runs 5] [--trace]
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Page } from "@playwright/test";
import { optionsFromEnv, startServer } from "@teleprompter/server";
import { isNil } from "es-toolkit";

// Each word is one Whisper word ("streetlights" would come back as two), so word timestamps line up with the Script.
const PARAGRAPH =
  "The harbor wakes before the town does. Fishing boats slip their moorings while the lamps still burn, and gulls " +
  "follow them out past the breakwater. By seven the first catch is on the dock, sorted into crates of ice. Buyers " +
  "from the restaurants arrive with lists and cash. Nobody haggles for long, because the tide waits for no one. By " +
  "noon the boats are scrubbed, the nets are mended, and the harbor falls quiet again until evening.";
const KOKORO_URL = process.env.KOKORO_URL ?? "http://127.0.0.1:8880";
const WHISPER_URL = process.env.TELEPROMPTER_WHISPER_URL ?? "http://127.0.0.1:2022";
const WHISPER_MODEL = process.env.TELEPROMPTER_WHISPER_MODEL ?? "Systran/faster-whisper-small";
const WEB_DIR = join(import.meta.dirname, "../../web/dist");
const LEAD_IN_SEC = 1;
// Chromium loops the file; the trailing silence keeps the speech from starting over while the run is measured.
const TAIL_SEC = 4;
const SAMPLE_MS = 50;
const CAUGHT_UP_WORDS = 3;

interface TimedWord {
  word: string;
  start: number;
  end: number;
}

interface Pcm {
  fmt: Buffer;
  data: Buffer;
  rate: number;
  blockAlign: number;
}

interface Point {
  // Seconds since the reader's first word.
  since: number;
  cursor: number;
  spoken: number;
}

interface RunResult {
  catchUp: number;
  medianLag: number;
  ahead: number;
  pastSentenceEnd: number;
}

const normalize = (word: string) => word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

const speak = async (text: string): Promise<ArrayBuffer> => {
  const response = await fetch(new URL("/v1/audio/speech", KOKORO_URL), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "kokoro", input: text, voice: "af_heart", response_format: "wav", speed: 1 }),
  });
  if (!response.ok) throw new Error(`Kokoro at ${KOKORO_URL} answered ${response.status}: ${await response.text()}`);
  return response.arrayBuffer();
};

const timeWords = async (audio: ArrayBuffer, scriptWords: readonly string[]): Promise<TimedWord[]> => {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/wav" }), "speech.wav");
  form.append("model", WHISPER_MODEL);
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  const response = await fetch(new URL("/v1/audio/transcriptions", WHISPER_URL), { method: "POST", body: form });
  if (!response.ok) throw new Error(`Whisper at ${WHISPER_URL} answered ${response.status}: ${await response.text()}`);
  const { words } = (await response.json()) as { words: { word: string; start: number; end: number }[] };
  const heard = words.filter((w) => normalize(w.word) !== "");
  if (heard.length !== scriptWords.length) {
    throw new Error(`Whisper heard ${heard.length} words in a Script of ${scriptWords.length}; reword the paragraph`);
  }

  return heard.map((w, i) => ({ word: scriptWords.at(i)!, start: w.start, end: w.end }));
};

const parseWav = (wav: Buffer): Pcm => {
  let offset = 12;
  let fmt: Buffer | undefined;
  let data: Buffer | undefined;
  while (offset + 8 <= wav.length) {
    const id = wav.toString("ascii", offset, offset + 4);
    let size = wav.readUInt32LE(offset + 4);
    // A streamed WAV may leave the data size unset.
    if (id === "data" && (size === 0 || size === 0xffffffff || offset + 8 + size > wav.length)) size = wav.length - offset - 8;
    const body = wav.subarray(offset + 8, offset + 8 + size);
    if (id === "fmt ") fmt = body;
    if (id === "data") data = body;
    offset += 8 + size + (size % 2);
  }
  if (isNil(fmt) || isNil(data)) throw new Error("Kokoro did not send a PCM WAV");

  return { fmt, data, rate: fmt.readUInt32LE(4), blockAlign: fmt.readUInt16LE(12) };
};

const chunk = (id: string, body: Buffer) => {
  const header = Buffer.alloc(8);
  header.write(id, 0, "ascii");
  header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
};

const toWav = ({ fmt }: Pcm, data: Buffer) => {
  const riff = Buffer.alloc(12);
  riff.write("RIFF", 0, "ascii");
  riff.writeUInt32LE(4 + 8 + fmt.length + 8 + data.length, 4);
  riff.write("WAVE", 8, "ascii");
  return Buffer.concat([riff, chunk("fmt ", fmt), chunk("data", data)]);
};

// Halfway through the silence before the word, so none of it is lost.
const cutBefore = (timing: readonly TimedWord[], from: number) => (from === 0 ? 0 : (timing.at(from - 1)!.end + timing.at(from)!.start) / 2);

const clipFrom = (pcm: Pcm, cutSec: number) => {
  const second = pcm.rate * pcm.blockAlign;
  const cutAt = Math.floor(cutSec * pcm.rate) * pcm.blockAlign;
  return toWav(pcm, Buffer.concat([Buffer.alloc(LEAD_IN_SEC * second), pcm.data.subarray(cutAt), Buffer.alloc(TAIL_SEC * second)]));
};

// Runs in the page: records when the microphone opened, and every SAMPLE_MS which word is on the Current line, one
// line below the Reading window's top edge.
const watchCursor = (sampleMs: number) => {
  const w = window as unknown as { micOpenedAt?: number; cursorSamples: [number, number][] };
  w.cursorSamples = [];
  const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    const stream = await getUserMedia(constraints);
    w.micOpenedAt = performance.now();
    return stream;
  };

  const cursor = () => {
    const spans = [...document.querySelectorAll<HTMLElement>("[data-word]")];
    const first = spans.at(0);
    const readingWindow = first?.closest<HTMLElement>('[style*="translateY"]')?.parentElement;
    if (first === undefined || readingWindow === null || readingWindow === undefined) return null;
    const lineHeight = parseFloat(getComputedStyle(first).lineHeight);
    const currentY = readingWindow.getBoundingClientRect().top + lineHeight;
    let row = { top: -Infinity, first: 0, count: 0 };
    for (const span of spans) {
      const rect = span.getBoundingClientRect();
      const top = rect.top - (lineHeight - rect.height) / 2;
      if (top > currentY) break;
      if (Math.abs(top - row.top) < 1) row.count++;
      else row = { top, first: Number(span.dataset.word), count: 1 };
    }
    return row.first + Math.min(1, (currentY - row.top) / lineHeight) * row.count;
  };

  setInterval(() => {
    const at = cursor();
    if (at !== null && w.micOpenedAt !== undefined) w.cursorSamples.push([performance.now() - w.micOpenedAt, at]);
  }, sampleMs);
};

const readSamples = (page: Page) => page.evaluate(() => (window as unknown as { cursorSamples: [number, number][] }).cursorSamples);

const median = (values: readonly number[]) => [...values].sort((a, b) => a - b).at(values.length >> 1) ?? NaN;

// Seconds or words to two places; NaN when Follow only caught up after the voice had finished.
const show = (value: number) => (Number.isNaN(value) ? "n/a" : value.toFixed(2));

const score = (points: readonly Point[], sentenceEnds: readonly number[], wordCount: number): RunResult => {
  const caught = points.find((p) => p.since >= 0 && Math.abs(p.cursor - p.spoken) <= CAUGHT_UP_WORDS);
  const reading = isNil(caught) ? [] : points.filter((p) => p.since >= caught.since && p.spoken < wordCount);
  const nextEnd = (spoken: number) => sentenceEnds.find((end) => end >= spoken) ?? wordCount;
  return {
    catchUp: caught?.since ?? NaN,
    medianLag: median(reading.map((p) => p.spoken - p.cursor)),
    ahead: reading.length === 0 ? NaN : Math.max(...reading.map((p) => p.cursor - p.spoken)),
    pastSentenceEnd: Math.max(0, ...reading.map((p) => p.cursor - nextEnd(p.spoken))),
  };
};

interface RunOptions {
  from: number;
  clipPath: string;
  timing: readonly TimedWord[];
  trace: boolean;
}

const runOnce = async ({ from, clipPath, timing, trace }: RunOptions): Promise<RunResult> => {
  const dataDir = mkdtempSync(join(tmpdir(), "tp-follow-bench-"));
  const server = await startServer({ ...optionsFromEnv(), port: 0, dataDir, webDir: WEB_DIR });
  const browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${clipPath}`],
  });
  try {
    const pushed = await fetch(`${server.url}/api/script`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "replace", text: PARAGRAPH }),
    });
    if (!pushed.ok) throw new Error(`Pushing the Script failed: ${pushed.status}`);

    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    await page.addInitScript(watchCursor, SAMPLE_MS);
    await page.goto(server.url);
    await page.locator("[data-word]").first().waitFor();
    await page.keyboard.press("f");
    await page.keyboard.press(" ");
    const cutSec = cutBefore(timing, from);
    const speechSec = timing.at(-1)!.end - cutSec;
    await page.waitForTimeout((LEAD_IN_SEC + speechSec + TAIL_SEC - 0.5) * 1000);

    const began = timing.at(from)!.start;
    const points = (await readSamples(page)).map(([ms, cursor]): Point => {
      const sec = ms / 1000 - LEAD_IN_SEC + cutSec;
      return { since: sec - began, cursor, spoken: timing.filter((w) => w.start <= sec).length };
    });
    if (trace) for (const p of points) console.log(`${p.since.toFixed(2)}\tspoken ${p.spoken}\tcursor ${p.cursor.toFixed(2)}`);

    const sentenceEnds = timing.flatMap((w, i) => (/[.!?]$/.test(w.word) ? [i + 1] : []));
    return score(points, sentenceEnds, timing.length);
  }
  finally {
    await browser.close();
    await server.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
};

const { values } = parseArgs({
  options: {
    from: { type: "string", multiple: true, default: ["62", "30", "0"] },
    runs: { type: "string", default: "5" },
    trace: { type: "boolean", default: false },
  },
});
const runs = Number(values.runs);
const starts = values.from.map(Number);

const recording = await speak(PARAGRAPH);
const timing = await timeWords(recording, PARAGRAPH.split(/\s+/));
const pcm = parseWav(Buffer.from(recording));
const clipDir = mkdtempSync(join(tmpdir(), "tp-follow-clips-"));
try {
  for (const from of starts) {
    if (from < 0 || from >= timing.length) throw new Error(`--from must be a word index below ${timing.length}`);
    const clipPath = join(clipDir, `from-${from}.wav`);
    writeFileSync(clipPath, clipFrom(pcm, cutBefore(timing, from)));
    const results: RunResult[] = [];
    for (let run = 1; run <= runs; run++) {
      const r = await runOnce({ from, clipPath, timing, trace: values.trace });
      results.push(r);
      console.log(
        `from ${from} run ${run}: catch-up ${show(r.catchUp)} s, median lag ${show(r.medianLag)} words, ` +
          `max ahead ${show(r.ahead)}, past sentence end ${show(r.pastSentenceEnd)}`
      );
    }

    const mean = results.reduce((sum, r) => sum + r.catchUp, 0) / results.length;
    console.log(`from ${from}: mean catch-up ${show(mean)} s over ${runs} runs\n`);
  }
}
finally {
  rmSync(clipDir, { recursive: true, force: true });
}
