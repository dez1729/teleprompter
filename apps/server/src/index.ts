import { serve } from "@hono/node-server";
import { existsSync } from "node:fs";
import { constants, homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PORT } from "@teleprompter/protocol";
import { createApp } from "./app.ts";
import { ScriptStore } from "./store.ts";
import { whisperTranscriber, type Transcriber } from "./transcriber.ts";

export interface ServerOptions {
  host?: string;
  port?: number;
  dataDir?: string;
  webDir?: string;
  transcriber?: Transcriber;
}

export interface RunningServer {
  url: string;
  port: number;
  close: () => Promise<void>;
}

export const defaultDataDir = (env: NodeJS.ProcessEnv = process.env): string => {
  if (env.TELEPROMPTER_DATA_DIR) return env.TELEPROMPTER_DATA_DIR;
  return join(env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "teleprompter");
};

// A wildcard address listens on every interface, but the host guard answers only loopback names.
const WILDCARD_HOSTS = new Set(["0.0.0.0", "::"]);

const urlHost = (host: string): string => {
  if (WILDCARD_HOSTS.has(host)) return "localhost";
  return host.includes(":") ? `[${host}]` : host;
};

const BUILT_WEB_DIR = fileURLToPath(new URL("../../web/dist", import.meta.url));

export const optionsFromEnv = (env: NodeJS.ProcessEnv = process.env): ServerOptions => {
  return {
    host: env.HOST || "127.0.0.1",
    port: env.PORT ? Number(env.PORT) : DEFAULT_PORT,
    dataDir: defaultDataDir(env),
    transcriber: whisperTranscriber({ url: env.TELEPROMPTER_WHISPER_URL || undefined, model: env.TELEPROMPTER_WHISPER_MODEL || undefined }),
  };
};

export const startServer = (options: ServerOptions = {}): Promise<RunningServer> => {
  const { host = "127.0.0.1", port = DEFAULT_PORT, dataDir = defaultDataDir(), webDir = BUILT_WEB_DIR, transcriber = whisperTranscriber() } = options;
  const store = new ScriptStore(dataDir);
  const hasWeb = existsSync(join(webDir, "index.html"));
  let boundPort = port;
  const app = createApp({ store, port: () => boundPort, webDir: hasWeb ? webDir : undefined, transcriber });

  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, hostname: host, port }, (info) => {
      boundPort = info.port;
      server.off("error", reject);

      resolve({
        url: `http://${urlHost(host)}:${info.port}`,
        port: info.port,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
            if ("closeAllConnections" in server) server.closeAllConnections();
          }),
      });
    });

    server.once("error", reject);
    if (!hasWeb) console.warn(`The web app is not built (${webDir}). Run "pnpm build" to serve it; the API still works.`);
  });
};

export class PortInUseError extends Error {
  constructor() {
    super("That port is already in use. Set PORT to use another.");
  }
}

const STOP_SIGNALS = ["SIGTERM", "SIGINT"] as const;

// Node ignores these signals when it runs as PID 1 in a container. Exits with 128 plus the
// signal's number, as the signal itself would have, so an interrupted run does not look finished.
const stopOnSignals = (server: RunningServer): void => {
  for (const signal of STOP_SIGNALS) {
    process.once(signal, () => void server.close().then(() => process.exit(128 + constants.signals[signal])));
  }
};

// Runs the server set up from the environment, as `tp serve` and the container do. It stops on
// signals before it says it is listening, so a signal sent at that moment cannot kill it outright.
export const serveFromEnv = async (env: NodeJS.ProcessEnv = process.env): Promise<void> => {
  let server: RunningServer;

  try {
    server = await startServer(optionsFromEnv(env));
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") throw new PortInUseError();
    throw error;
  }

  stopOnSignals(server);
  console.log(`Teleprompter listening on ${server.url}`);
};
