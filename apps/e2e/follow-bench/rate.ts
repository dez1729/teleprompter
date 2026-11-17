// Checks the Speaking rate against a voice whose rate is known. Kokoro speaks a passage at a few speeds, Whisper times
// each word, and Chromium's microphone plays the recording while the Prompter follows it. Each second the shown rate
// is compared with the true rate over the same last ten seconds.
// Usage: node follow-bench/rate.ts [--speed 0.8 --speed 1 --speed 1.3]
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import { fittedWpm, type PushRequest } from "@teleprompter/protocol";
import { optionsFromEnv, startServer } from "@teleprompter/server";
import { parseWav, speak, timeWords, toWav } from "./audio.ts";

const PASSAGE =
  "The harbor wakes before the town does. Fishing boats slip their moorings while the lamps still burn, and gulls " +
  "follow them out past the breakwater. By seven the first catch is on the dock, sorted into crates of ice. Buyers " +
  "from the restaurants arrive with lists and cash. Nobody haggles for long, because the tide waits for no one. By " +
  "noon the boats are scrubbed, the nets are mended, and the harbor falls quiet again until evening. The market " +
  "empties slowly as the sun climbs over the roofs. Children run along the pier, and old men sit on the benches " +
  "outside the chandlery, arguing about the weather and the price of diesel.";
const WEB_DIR = join(import.meta.dirname, "../../web/dist");
const WINDOW_SEC = 10;
const TAIL_SEC = 4;

// The recording with silence after it, so Chromium's looping microphone does not start it over during the run.
const withTail = (wav: ArrayBuffer): Buffer => {
  const pcm = parseWav(Buffer.from(wav));
  return toWav(pcm, Buffer.concat([pcm.data, Buffer.alloc(TAIL_SEC * pcm.rate * pcm.blockAlign)]));
};

// The true rate at `sec`: the same fit the Prompter makes, through where each word started in the last WINDOW_SEC
// rather than where Follow matched it, so the difference is only Follow's tracking.
const trueWpm = (starts: readonly number[], sec: number): number | null => {
  const heard = starts.flatMap((start, position) => (start <= sec && start > sec - WINDOW_SEC ? [{ position, at: start * 1000 }] : []));
  return fittedWpm(heard);
};

const run = async (speed: number, dir: string) => {
  const audio = await speak(PASSAGE, speed);
  const starts = (await timeWords(audio, PASSAGE.split(/\s+/))).map((word) => word.start);
  const clip = join(dir, `speed-${speed}.wav`);
  writeFileSync(clip, withTail(audio));
  const overall = ((starts.length - 1) / (starts.at(-1)! - starts.at(0)!)) * 60;

  const dataDir = mkdtempSync(join(tmpdir(), "tp-rate-bench-"));
  const server = await startServer({ ...optionsFromEnv(), port: 0, dataDir, webDir: WEB_DIR });
  const browser = await chromium.launch({
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${clip}`],
  });

  try {
    const pushed = await fetch(`${server.url}/api/script`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "replace", text: PASSAGE } satisfies PushRequest as PushRequest),
    });

    if (!pushed.ok) throw new Error(`Pushing the Script failed: ${pushed.status}`);

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
      const text = (await page.getByLabel("Speaking rate").textContent()) ?? "";
      const truth = trueWpm(starts, sec);
      const value = Number.parseInt(text, 10);
      if (Number.isFinite(value) && truth !== null && sec > 3) errors.push(value - truth);
      shown.push(`${sec.toFixed(0)}s ${text.replace(" wpm", "")}/${truth === null ? "-" : truth.toFixed(0)}`);
    }

    if (errors.length === 0) throw new Error(`The Prompter showed no Speaking rate at speed ${speed}: ${shown.join("  ")}`);
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
