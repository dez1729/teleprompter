import {
  ScriptChangeSchema,
  ScriptSchema,
  TranscribersSchema,
  VersionSummarySchema,
  type PushRequest,
  type Script,
  type ScriptChange,
  type TranscriberId,
  type VersionSummary,
} from "@teleprompter/protocol";
import { isNil, isString } from "es-toolkit";

/** Chrome refuses a keepalive request whose body is over 64 KiB. */
const KEEPALIVE_MAX_CHARS = 20_000;

const request = async (path: string, init?: RequestInit): Promise<unknown> => {
  const response = await fetch(path, init);
  if (!response.ok) throw new Error(`The server answered ${response.status}.`);
  return response.json();
};

/** Sends a change to the Script and resolves with the Script the server made of it. */
export const sendScript = async (change: PushRequest): Promise<Script> => {
  const body = JSON.stringify(change);

  return ScriptSchema.parse(
    await request("/api/script", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      // Lets an Edit sent as the window closes still reach the server.
      keepalive: body.length <= KEEPALIVE_MAX_CHARS,
    })
  );
};

export const fetchHistory = async (): Promise<VersionSummary[]> => {
  return VersionSummarySchema.array().parse(await request("/api/history"));
};

export const restoreVersion = async (id: string): Promise<Script> => {
  return ScriptSchema.parse(await request(`/api/history/${encodeURIComponent(id)}/restore`, { method: "POST" }));
};

export type ScriptMessage = { type: "snapshot"; script: Script } | ({ type: "change" } & ScriptChange);

interface SafeParser<T> {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false };
}

const parse = <T>(schema: SafeParser<T>, data: string) => {
  try {
    const result = schema.safeParse(JSON.parse(data));
    return result.success ? result.data : null;
  }
  catch {
    return null;
  }
};

interface ScriptStreamHandlers {
  onMessage: (message: ScriptMessage) => void;
  onConnection: (connected: boolean) => void;
}

// The server's event stream, from start() to stop(). EventSource reconnects on its own and the
// server sends the current Script again each time, which arrives as a snapshot.
export class ScriptStream {
  readonly #handlers: ScriptStreamHandlers;
  #source: EventSource | null = null;

  constructor(handlers: ScriptStreamHandlers) {
    this.#handlers = handlers;
  }

  start(): void {
    // Starting again replaces the connection rather than adding a second one.
    this.stop();
    const source = new EventSource("/api/events");
    source.onopen = () => this.#handlers.onConnection(true);
    source.onerror = () => this.#handlers.onConnection(false);

    source.addEventListener("script", (event) => {
      const script = parse(ScriptSchema, (event as MessageEvent<string>).data);
      if (!isNil(script)) this.#handlers.onMessage({ type: "snapshot", script });
    });

    source.addEventListener("change", (event) => {
      const change = parse(ScriptChangeSchema, (event as MessageEvent<string>).data);
      if (!isNil(change)) this.#handlers.onMessage({ type: "change", ...change });
    });

    this.#source = source;
  }

  stop(): void {
    this.#source?.close();
    this.#source = null;
  }
}

/** The Transcribers set up on the server. */
export const fetchTranscribers = async (): Promise<TranscriberId[]> => {
  const response = await fetch("/api/transcribers");
  if (!response.ok) throw new Error(`The server answered ${response.status}.`);
  return TranscribersSchema.parse(await response.json()).available;
};

/** What the Transcriber heard in a clip of the reader's speech. Rejects with the server's reason. */
export const transcribe = async (clip: Blob, transcriber: TranscriberId): Promise<string> => {
  const response = await fetch(`/api/transcribe?transcriber=${transcriber}`, { method: "POST", headers: { "content-type": clip.type }, body: clip });
  const body = (await response.json().catch(() => null)) as { text?: string; error?: string } | null;
  if (!response.ok || !isString(body?.text)) throw new Error(body?.error ?? `The server answered ${response.status}.`);
  return body.text;
};
