import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_PORT, type PushRequest } from "@teleprompter/protocol";
import { startServer, type RunningServer } from "@teleprompter/server";
import { DEFAULT_SERVER_URL, PushError, pushFor, sendPush, type Http } from "./push.ts";

const note = { basename: "Opening night", text: "---\ntags: [show]\n---\n# Opening\n\nWelcome everyone." };

it("defaults to the server's port", () => {
  expect(new URL(DEFAULT_SERVER_URL).port).toBe(String(DEFAULT_PORT));
});

describe("pushFor", () => {
  it("sends the selection as markdown, with the note title as its Source", () => {
    expect(pushFor("append", "Welcome everyone.", note)).toEqual({
      kind: "append",
      text: "Welcome everyone.",
      format: "markdown",
      source: "Opening night",
    });
  });

  it("sends the whole note when nothing is selected", () => {
    expect(pushFor("replace", "  \n", note)?.text).toBe(note.text);
  });

  it("sends nothing from an empty note", () => {
    expect(pushFor("replace", "", { basename: "Empty", text: "\n\n" })).toBeNull();
  });
});

describe("sendPush", () => {
  const request = { kind: "replace", text: "Hello.", format: "markdown", source: "Note" } satisfies PushRequest as PushRequest;
  const fails = (message: RegExp, serverUrl: string, http: Http) =>
    expect(sendPush(request, serverUrl, http)).rejects.toThrow(
      expect.objectContaining({ constructor: PushError, message: expect.stringMatching(message) })
    );

  it("tells the reader to start the server when it cannot be reached", async () => {
    await fails(/Cannot reach .*tp serve/, "http://127.0.0.1:4747", () => Promise.reject(new Error("ECONNREFUSED")));
  });

  it("reports a rejected Push with the status and the reason", async () => {
    await fails(/rejected the text \(403\)\. Forbidden origin/, "http://127.0.0.1:4747", async () => ({ status: 403, text: "Forbidden origin" }));
  });

  it("reports an address that is not a URL", async () => {
    await fails(/is not a URL/, "localhost 4747", async () => ({ status: 200, text: "" }));
  });
});

describe("sending to a real server, as Obsidian does", () => {
  let server: RunningServer;
  let dataDir: string;
  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), "tp-obsidian-"));
    server = await startServer({ port: 0, dataDir, webDir: dataDir });
  });

  afterAll(async () => {
    await server.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  const obsidian: Http = async ({ url, method, contentType, body }) => {
    const response = await fetch(url, { method, body, headers: { "content-type": contentType, origin: "app://obsidian.md" } });
    return { status: response.status, text: await response.text() };
  };

  it("replaces and then appends to the Script", async () => {
    await sendPush(pushFor("replace", "", note)!, server.url, obsidian);
    await sendPush(pushFor("append", "Thanks for coming.", note)!, server.url, obsidian);
    const script = await (await fetch(new URL("/api/script", server.url))).json();
    expect(script).toMatchObject({
      text: `${note.text}\n\nThanks for coming.`,
      format: "markdown",
      source: "Opening night",
      revision: 2,
    });
  });
});
