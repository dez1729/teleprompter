import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PortInUseError, serveFromEnv, startServer, type RunningServer } from "./index.ts";

const MAIN = fileURLToPath(new URL("./main.ts", import.meta.url));

let dir: string;
let servers: RunningServer[];

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tp-server-"));
  servers = [];
});

afterEach(async () => {
  await Promise.all(servers.map((server) => server.close()));
  rmSync(dir, { recursive: true, force: true });
});

const start = async (host: string) => {
  const server = await startServer({ host, port: 0, dataDir: dir, webDir: dir });
  servers.push(server);
  return server;
};

describe("startServer", () => {
  it("gives a localhost URL that the server answers when it listens on every interface", async () => {
    const server = await start("0.0.0.0");
    expect(server.url).toBe(`http://localhost:${server.port}`);
    expect((await fetch(new URL("/api/script", server.url))).status).toBe(200);
  });

  it("puts an IPv6 host in brackets", async () => {
    const server = await start("::1");
    expect(server.url).toBe(`http://[::1]:${server.port}`);
    expect(() => new URL(server.url)).not.toThrow();
  });
});

describe("serveFromEnv", () => {
  it("says the port is in use when another server holds it", async () => {
    const { port } = await start("127.0.0.1");
    const env = { HOST: "127.0.0.1", PORT: String(port), TELEPROMPTER_DATA_DIR: dir };
    await expect(serveFromEnv(env)).rejects.toThrow(PortInUseError);
  });
});

describe("the server process", () => {
  it.each([
    ["SIGTERM", 143],
    ["SIGINT", 130],
  ] as const)("stops on %s and exits with %i, as the signal would", async (signal, code) => {
    const child = spawn(process.execPath, [MAIN], {
      env: { ...process.env, HOST: "127.0.0.1", PORT: "0", TELEPROMPTER_DATA_DIR: dir },
      stdio: ["ignore", "pipe", "ignore"],
    });
    const [line] = await once(child.stdout, "data");
    expect(String(line)).toMatch(/^Teleprompter listening on /);

    child.kill(signal);
    const [exitCode] = await once(child, "exit");
    expect(exitCode).toBe(code);
  });
});
