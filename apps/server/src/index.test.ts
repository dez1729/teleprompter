import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isString } from "es-toolkit";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { optionsFromEnv, PortInUseError, serveFromEnv, SettingError, startServer, type RunningServer } from "./index.ts";

const MAIN = fileURLToPath(new URL("./main.ts", import.meta.url));

// Some containers and CI machines turn IPv6 loopback off.
const canBindIpv6Loopback = await new Promise<boolean>((resolve) => {
  const probe = createServer();
  probe.once("error", () => resolve(false));
  probe.listen(0, "::1", () => probe.close(() => resolve(true)));
});

let dir: string;
let servers: RunningServer[];
let children: ChildProcess[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tp-server-"));
  servers = [];
  children = [];
});

afterEach(async () => {
  const running = children.filter((child) => child.exitCode === null && child.signalCode === null);

  await Promise.all(
    running.map((child) => {
      child.kill("SIGKILL");
      return once(child, "exit");
    })
  );

  await Promise.all(servers.map((server) => server.close()));
  rmSync(dir, { recursive: true, force: true });
});

const start = async (host: string) => {
  const server = await startServer({ host, port: 0, dataDir: dir, webDir: dir });
  servers.push(server);
  return server;
};

// Resolves once the server process says it is listening, or fails with its stderr if it exits first.
const startProcess = async () => {
  const child = spawn(process.execPath, [MAIN], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: "0", TELEPROMPTER_DATA_DIR: dir },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let stderr = "";
  child.stderr.on("data", (chunk) => (stderr += String(chunk)));

  const first = await Promise.race([
    once(child.stdout, "data").then(([chunk]) => String(chunk)),
    once(child, "close").then(([code, signal]) => ({ status: code ?? signal })),
  ]);

  if (!isString(first)) throw new Error(`The server exited with ${first.status} before it was listening.\n${stderr}`);
  expect(first).toMatch(/^Teleprompter listening on /);
  return child;
};

describe("startServer", () => {
  it("gives a localhost URL that the server answers when it listens on every interface", async () => {
    const server = await start("0.0.0.0");
    expect(server.url).toBe(`http://localhost:${server.port}`);
    expect((await fetch(new URL("/api/script", server.url))).status).toBe(200);
  });

  it.skipIf(!canBindIpv6Loopback)("gives a bracketed URL that the server answers on IPv6 loopback", async () => {
    const server = await start("::1");
    expect(server.url).toBe(`http://[::1]:${server.port}`);
    expect((await fetch(new URL("/api/script", server.url))).status).toBe(200);
  });

  it.skipIf(!canBindIpv6Loopback)("gives a localhost URL that the server answers on another loopback address", async () => {
    const server = await start("::ffff:127.0.0.1");
    expect(server.url).toBe(`http://localhost:${server.port}`);
    expect((await fetch(new URL("/api/script", server.url))).status).toBe(200);
  });
});

describe("serveFromEnv", () => {
  it("says the port is in use when another server holds it", async () => {
    const { port } = await start("127.0.0.1");
    const env = { HOST: "127.0.0.1", PORT: String(port), TELEPROMPTER_DATA_DIR: dir };
    await expect(serveFromEnv(env)).rejects.toThrow(PortInUseError);
  });
});

describe("TELEPROMPTER_KOKORO_TIMEOUT_MS", () => {
  it("sets how long the server waits for Kokoro", async () => {
    // A Kokoro that takes the request and never answers.
    const held: Socket[] = [];
    const silent = createServer((socket) => held.push(socket));
    await new Promise<void>((resolve) => silent.listen(0, "127.0.0.1", resolve));
    const { port } = silent.address() as { port: number };

    try {
      const { narrator } = optionsFromEnv({ TELEPROMPTER_KOKORO_URL: `http://127.0.0.1:${port}`, TELEPROMPTER_KOKORO_TIMEOUT_MS: "200" });
      await expect(narrator!.speak({ text: "Hi.", speed: 1 })).rejects.toThrow(/did not answer within 0\.2 s/);
    }
    finally {
      held.forEach((socket) => socket.destroy());
      silent.close();
    }
  });

  it.each(["soon", "0", "-5"])("refuses %s, saying what it needs", (value) => {
    expect(() => optionsFromEnv({ TELEPROMPTER_KOKORO_TIMEOUT_MS: value })).toThrow(SettingError);
    expect(() => optionsFromEnv({ TELEPROMPTER_KOKORO_TIMEOUT_MS: value })).toThrow(/a number of milliseconds above 0/);
  });
});

describe("the server process", () => {
  it.each([
    ["SIGTERM", 143],
    ["SIGINT", 130],
  ] as const)("stops on %s and exits with %i, as the signal would", async (signal, code) => {
    const child = await startProcess();
    child.kill(signal);
    const [exitCode] = await once(child, "exit");
    expect(exitCode).toBe(code);
  });
});
