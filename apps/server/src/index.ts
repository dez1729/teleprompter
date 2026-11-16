import { serve } from "@hono/node-server";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PORT } from "@teleprompter/protocol";
import { createApp } from "./app.ts";
import { ScriptStore } from "./store.ts";
import { transcribersFromEnv, whisperTranscriber, type Transcribers } from "./transcriber.ts";

export { ConfigError } from "./transcriber.ts";

export interface ServerOptions {
  host?: string;
  port?: number;
  dataDir?: string;
  webDir?: string;
  transcribers?: Transcribers;
}

export interface EnvServerOptions extends ServerOptions {
  /** Which Transcribers Follow can listen through, for the server to say at startup. */
  transcribersLabel: string;
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

const BUILT_WEB_DIR = fileURLToPath(new URL("../../web/dist", import.meta.url));

/** Adds the settings in `.env` in the current directory to process.env. Variables already set in the shell win. */
export const loadDotEnv = (): void => {
  try {
    process.loadEnvFile();
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
};

export const optionsFromEnv = (env: NodeJS.ProcessEnv = process.env): EnvServerOptions => {
  const { transcribers, label } = transcribersFromEnv(env);

  return {
    host: env.HOST || "127.0.0.1",
    port: env.PORT ? Number(env.PORT) : DEFAULT_PORT,
    dataDir: defaultDataDir(env),
    transcribers,
    transcribersLabel: label,
  };
};

export const startServer = (options: ServerOptions = {}): Promise<RunningServer> => {
  const {
    host = "127.0.0.1",
    port = DEFAULT_PORT,
    dataDir = defaultDataDir(),
    webDir = BUILT_WEB_DIR,
    transcribers = { whisper: whisperTranscriber() },
  } = options;
  const store = new ScriptStore(dataDir);
  const hasWeb = existsSync(join(webDir, "index.html"));
  let boundPort = port;
  const app = createApp({ store, port: () => boundPort, webDir: hasWeb ? webDir : undefined, transcribers });

  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, hostname: host, port }, (info) => {
      boundPort = info.port;
      server.off("error", reject);

      resolve({
        url: `http://${host}:${info.port}`,
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
