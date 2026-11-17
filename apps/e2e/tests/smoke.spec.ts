import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const TP = join(import.meta.dirname, "../../../packages/cli/bin/tp.js");

const freePort = (): Promise<number> => {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);

    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });
};

let server: ChildProcess;
let dataDir: string;
let url: string;

test.beforeEach(async () => {
  const port = await freePort();
  url = `http://127.0.0.1:${port}`;
  dataDir = mkdtempSync(join(tmpdir(), "tp-e2e-"));

  server = spawn("node", [TP, "serve"], {
    env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", TELEPROMPTER_DATA_DIR: dataDir },
    stdio: "inherit",
  });

  for (let attempt = 0; attempt < 100; attempt++) {
    if (
      await fetch(`${url}/api/script`).then(
        (r) => r.ok,
        () => false
      )
    )
      return;

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error("The server did not start");
});

test.afterEach(() => {
  server?.kill();
  rmSync(dataDir, { recursive: true, force: true });
});

const tp = (args: string[], input: string) => {
  const result = spawnSync("node", [TP, ...args], {
    input,
    encoding: "utf8",
    env: { ...process.env, TELEPROMPTER_URL: url },
  });

  expect(result.status, result.stderr).toBe(0);
};

test("a Pushed Script appears, plays and pauses", async ({ page }) => {
  await page.goto(url);
  await expect(page.getByText("No Script yet")).toBeVisible();

  tp(["send", "--replace"], "alpha bravo charlie delta echo foxtrot");
  await expect(page.getByText("alpha")).toBeVisible();
  await expect(page.getByText("No Script yet")).toHaveCount(0);

  // Another Push reaches the open Prompter without a reload.
  tp(["send", "--append"], "golf hotel");
  await expect(page.getByText("hotel")).toBeVisible();

  const play = page.getByRole("button", { name: /^play/i });
  await play.click();
  await expect(page.getByRole("button", { name: /^pause/i })).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: /^play/i })).toBeVisible();
});

test("the speaking rate shows no number while nothing is heard", async ({ page }) => {
  await page.goto(url);
  tp(["send", "--replace"], "alpha bravo charlie delta echo foxtrot");
  await expect(page.getByText("alpha")).toBeVisible();

  await expect(page.locator("[data-speaking-rate]")).toHaveText("-- wpm");
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: /^pause/i })).toBeVisible();
  // Auto listens to no one, so the corner shows no speaking rate.
  await expect(page.locator("[data-speaking-rate]")).toHaveCount(1);
});

test("the words before the reader are colored as read, unless Read words is off", async ({ page }) => {
  await page.goto(url);
  tp(["send", "--replace"], "alpha bravo\n\ncharlie delta");
  await expect(page.getByText("charlie")).toBeVisible();
  const read = page.locator("[data-read]");
  await expect(read).toHaveCount(0);

  await page.keyboard.press("Shift+ArrowRight");
  await expect(read).toHaveText(["alpha", "bravo"]);
  await expect(read.first()).toHaveCSS("color", "rgb(250, 204, 21)");

  await page.keyboard.press(",");
  await page.getByRole("dialog").getByRole("switch", { name: "Read words" }).click();
  await expect(read).toHaveCount(0);
});

test("the old browser-stored Script moves to the server once", async ({ page }) => {
  // Stored before the app's first load, as an earlier version left it.
  await page.addInitScript(() => localStorage.setItem("teleprompter.script", JSON.stringify({ source: "kept from before", format: "text" })));
  await page.goto(url);

  await expect(page.getByText("kept from before")).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("teleprompter.script"))).toBeNull();
  const script = await (await fetch(`${url}/api/script`)).json();
  expect(script).toMatchObject({ text: "kept from before", revision: 1 });
});

test("the Editor edits the Script, takes a Push, and a Replace can be undone", async ({ page }) => {
  const serverScript = async () => (await (await fetch(`${url}/api/script`)).json()) as { text: string };

  await page.goto(url);
  await expect(page.getByText("No Script yet")).toBeVisible();
  const [editor] = await Promise.all([page.waitForEvent("popup"), page.getByRole("button", { name: "Open the Editor" }).first().click()]);
  await editor.waitForURL("**/editor");
  const document = editor.getByRole("textbox", { name: "Script" });

  await document.click();
  await editor.keyboard.type("alpha bravo charlie");
  await expect(page.getByText("charlie")).toBeVisible();
  await expect(editor.getByRole("status")).toHaveText("Saved");
  expect(await serverScript()).toMatchObject({ text: "alpha bravo charlie", revision: 1 });

  // An Edit leaves a playing Prompter playing. Going back to the top would pause it.
  await page.getByRole("button", { name: /^play/i }).click();
  await editor.keyboard.type(" zulu");
  await expect(page.getByText("zulu")).toBeVisible();
  await expect(page.getByRole("button", { name: /^pause/i })).toBeVisible();
  await page.getByRole("button", { name: /^pause/i }).click();
  await editor.keyboard.press("Control+z");
  await expect(page.getByText("zulu")).toHaveCount(0);

  // A Push lands in the Editor, and undoing it there takes it out of the Prompter too.
  tp(["send", "--append"], "delta echo");
  await expect(document).toContainText("delta echo");
  await expect(page.getByText("echo")).toBeVisible();
  await editor.keyboard.press("Control+z");
  await expect(document).not.toContainText("delta echo");
  await expect(page.getByText("echo")).toHaveCount(0);
  await expect.poll(async () => (await serverScript()).text).toBe("alpha bravo charlie");

  tp(["send", "--replace", "--source", "My note"], "a whole new script");
  await expect(page.getByText("whole")).toBeVisible();
  await expect(document).toContainText("a whole new script");
  await expect(editor.getByText("Source: My note")).toBeVisible();
  await expect(page.getByText("Script replaced from My note")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("charlie")).toBeVisible();
  await expect(page.getByText("Script restored")).toBeVisible();
  await expect(document).toContainText("alpha bravo charlie");

  // The Replace that was undone is the newest Version in Script history.
  await editor.getByRole("button", { name: "History" }).click();
  const newest = editor.getByRole("listitem").first();
  await expect(newest).toContainText("a whole new script");
  await newest.getByRole("button", { name: "Restore" }).click();
  await expect(document).toContainText("a whole new script");
  await expect(page.getByText("whole")).toBeVisible();
});

test("opening the Editor again reuses the open one", async ({ page, context }) => {
  await page.goto(url);
  await expect(page.getByText("No Script yet")).toBeVisible();
  const [editor] = await Promise.all([page.waitForEvent("popup"), page.keyboard.press("p")]);
  await editor.waitForURL("**/editor");
  const document = editor.getByRole("textbox", { name: "Script" });
  await document.click();
  await editor.keyboard.type("still here");
  await editor.evaluate(() => Object.assign(window, { keptAcrossOpen: true }));

  await page.bringToFront();
  await page.keyboard.press("p");
  await expect(page.getByText("still here")).toBeVisible();
  expect(context.pages()).toHaveLength(2);
  expect(await editor.evaluate(() => "keptAcrossOpen" in window)).toBe(true);
});

test("edits left over from the old Script dialog are removed", async ({ page }) => {
  await page.goto(url);
  await page.evaluate(() => localStorage.setItem("teleprompter.draft", JSON.stringify("stale")));
  await page.reload();
  await expect(page.getByText("No Script yet")).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("teleprompter.draft"))).toBeNull();
});

test("Spoken-only shows a markdown Script without what is not read aloud", async ({ page }) => {
  await page.goto(url);
  tp(["send", "--replace", "--markdown"], "# Opening\n\nWelcome *(smile)* everyone.\n\n## Part two\n\nThanks for coming.");
  await expect(page.getByText("everyone.")).toBeVisible();
  await expect(page.getByText("Opening")).toHaveCount(0);
  await expect(page.getByText("(smile)")).toHaveCount(0);
  await expect(page.locator("[data-section-marker]")).toHaveCount(1);

  await page.keyboard.press("s");
  await expect(page.getByText("Spoken-only: off")).toBeVisible();
  await expect(page.getByText("*(smile)*")).toBeVisible();
  await expect(page.locator("[data-section-marker]")).toHaveCount(0);

  await page.keyboard.press("s");
  await expect(page.getByText("*(smile)*")).toHaveCount(0);
});

test("Advanced settings open in place of the display settings and Back returns", async ({ page }) => {
  await page.goto(url);
  await expect(page.getByText("No Script yet")).toBeVisible();
  await page.keyboard.press(",");
  const panel = page.getByRole("dialog");
  await expect(panel.getByText("Display settings")).toBeVisible();
  await expect(panel.getByText("Speed", { exact: true })).toBeVisible();
  await expect(panel.getByText("Minimum time per line")).toHaveCount(0);

  await panel.getByRole("button", { name: "Advanced settings" }).click();
  await expect(panel.getByText("Minimum time per line")).toBeVisible();
  await expect(panel.getByText("Paragraph pause")).toBeVisible();
  await expect(panel.getByText("Speed", { exact: true })).toHaveCount(0);

  await panel.getByRole("button", { name: "Back" }).click();
  await expect(panel.getByText("Speed", { exact: true })).toBeVisible();

  await page.keyboard.press("Escape");
  await page.keyboard.press(",");
  await panel.getByRole("button", { name: "Advanced settings" }).click();
  await page.keyboard.press("Escape");
  await page.keyboard.press(",");
  await expect(page.getByRole("dialog").getByText("Display settings")).toBeVisible();
});

test("the Timer counts reading time and resets", async ({ page }) => {
  await page.goto(url);
  tp(["send", "--replace"], "alpha bravo charlie delta echo foxtrot");
  await expect(page.getByText("alpha")).toBeVisible();

  const readout = page.getByRole("timer");
  await expect(readout).toHaveText("0:00");

  await page.keyboard.press("t");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(readout).toHaveText(/^0:0[1-9]$/);

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(readout).toHaveText("0:00");
});

test("the Timer's settings stay folded until opened", async ({ page }) => {
  await page.goto(url);
  tp(["send", "--replace"], "alpha bravo charlie");
  await expect(page.getByText("alpha")).toBeVisible();

  await page.keyboard.press("t");
  const timerMenu = page.getByRole("dialog", { name: "Timer" });
  await expect(timerMenu).toBeVisible();
  const runWithPlayback = timerMenu.getByRole("switch", { name: "Run with playback" });
  await expect(runWithPlayback).toBeHidden();

  await timerMenu.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(runWithPlayback).toBeVisible();
});

test("the Timer closes when you click the Script unless it is pinned, and Esc closes it", async ({ page }) => {
  await page.goto(url);
  tp(["send", "--replace"], "alpha bravo charlie");
  await expect(page.getByText("alpha")).toBeVisible();

  await page.keyboard.press("t");
  const timerMenu = page.getByRole("dialog", { name: "Timer" });
  await expect(timerMenu).toBeVisible();
  await page.getByText("alpha").click();
  await expect(timerMenu).toBeHidden();

  await page.keyboard.press("t");
  await timerMenu.getByRole("button", { name: "Keep the Timer open" }).click();
  await page.getByText("alpha").click();
  await expect(timerMenu).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(timerMenu).toBeHidden();

  await page.reload();
  await expect(page.getByText("alpha")).toBeVisible();
  await page.keyboard.press("t");
  await expect(timerMenu.getByRole("button", { name: "Keep the Timer open" })).toHaveAttribute("aria-pressed", "true");
});

test("the Timer runs with playback, not through the countdown, and Restart zeroes it", async ({ page }) => {
  await page.goto(url);
  tp(["send", "--replace"], Array.from({ length: 200 }, (_, i) => `word${i}`).join(" "));
  await expect(page.getByText("word0", { exact: false }).first()).toBeVisible();

  const readout = page.getByRole("timer");
  await page.keyboard.press("Space");
  await expect(readout).toHaveText("0:00");
  await expect(readout).toHaveText(/^0:0[1-9]$/, { timeout: 8000 });

  await page.keyboard.press("Space");
  const paused = await readout.textContent();
  await page.waitForTimeout(1500);
  await expect(readout).toHaveText(paused ?? "");

  await page.keyboard.press("Home");
  await expect(readout).toHaveText("0:00");
});

// Silence, as the Narrator would send speech.
const silentWav = (seconds = 0.5): Buffer => {
  const rate = 24000;
  const bytes = Math.round(rate * seconds) * 2;
  const wav = Buffer.alloc(44 + bytes);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + bytes, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(bytes, 40);
  return wav;
};

test("Read aloud speaks the Script from the Current line as it scrolls", async ({ page }) => {
  const spoken: string[] = [];

  await page.route("**/api/speak", async (route) => {
    spoken.push((route.request().postDataJSON() as { text: string }).text);
    await route.fulfill({ contentType: "audio/wav", body: silentWav() });
  });

  await page.goto(url);
  tp(["send", "--replace"], "Alpha bravo charlie. Delta echo foxtrot golf hotel india juliet.");
  await expect(page.getByText("Alpha")).toBeVisible();

  await page.keyboard.press("r");
  await expect(page.getByRole("button", { name: "Read aloud", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press(" ");
  await expect(page.locator('[data-read-aloud-status="speaking"]')).toHaveText("Reading aloud at 150 wpm");
  await expect.poll(() => spoken).toEqual(["Alpha bravo charlie.", "Delta echo foxtrot golf hotel india juliet."]);

  await page.keyboard.press(" ");
  await expect(page.locator("[data-read-aloud-status]")).toHaveCount(0);
});

test("Read aloud pauses and says why when the Narrator fails", async ({ page }) => {
  await page.route("**/api/speak", (route) => route.fulfill({ status: 502, json: { error: "Cannot reach the Kokoro server." } }));

  await page.goto(url);
  tp(["send", "--replace"], "alpha bravo charlie");
  await expect(page.getByText("alpha")).toBeVisible();

  await page.keyboard.press("r");
  await page.keyboard.press(" ");
  await expect(page.locator('[data-read-aloud-status="error"]')).toHaveText("Read aloud stopped. Cannot reach the Kokoro server.");
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
});

test("Read aloud speaks in the chosen voice and jumps where the reader moves by hand", async ({ page }) => {
  const spoken: { text: string; voice?: string }[] = [];
  await page.route("**/api/voices", (route) => route.fulfill({ json: { voices: ["af_heart", "bf_emma", "am_adam"], default: "af_heart" } }));

  await page.route("**/api/speak", async (route) => {
    spoken.push(route.request().postDataJSON() as { text: string; voice?: string });
    // Long enough that only a move by hand reaches the third paragraph.
    await route.fulfill({ contentType: "audio/wav", body: silentWav(20) });
  });

  await page.goto(url);
  tp(["send", "--replace"], "Alpha bravo charlie delta.\n\nEcho foxtrot golf hotel.\n\nIndia juliet kilo lima.");
  await expect(page.getByText("Alpha")).toBeVisible();

  await page.keyboard.press(",");
  const voice = page.getByLabel("Voice", { exact: true });
  await expect(voice.locator("optgroup")).toHaveText(["Heart (female)Adam (male)", "Emma (female)"]);
  await voice.selectOption("bf_emma");
  await page.keyboard.press("Escape");

  await page.keyboard.press("r");
  await page.keyboard.press(" ");
  await expect.poll(() => spoken.at(0)).toEqual({ text: "Alpha bravo charlie delta.", speed: expect.any(Number), voice: "bf_emma" });
  // The next passage is fetched while one plays.
  await expect.poll(() => spoken.map((request) => request.text)).toEqual(["Alpha bravo charlie delta.", "Echo foxtrot golf hotel."]);

  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(() => spoken.map((request) => request.text).at(-1)).toBe("India juliet kilo lima.");
});
