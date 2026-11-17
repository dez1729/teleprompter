import {
  ScriptChangeSchema,
  ScriptSchema,
  VersionSummarySchema,
  VoicesSchema,
  type PushRequest,
  type Script,
  type SpeakRequest,
  type Voices,
  type ScriptChange,
  type VersionSummary,
} from "@teleprompter/protocol";
import { isNil, isPlainObject, isString } from "es-toolkit";

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

// The server's reason for a failed request, such as Kokoro not running, or its status when it gave none.
const failure = (response: Response, body: unknown): Error => {
  const reason = isPlainObject(body) && isString(body.error) ? body.error : null;
  return new Error(reason ?? `The server answered ${response.status}.`);
};

// What the Transcriber heard in a clip of the reader's speech. Rejects with the server's reason.
export const transcribe = async (clip: Blob): Promise<string> => {
  const response = await fetch("/api/transcribe", { method: "POST", headers: { "content-type": clip.type }, body: clip });
  const body: unknown = await response.json().catch(() => null);
  if (response.ok && isPlainObject(body) && isString(body.text)) return body.text;
  throw failure(response, body);
};

// The Narrator speaking the request as WAV audio. Rejects with the server's reason.
export const speak = async (request: SpeakRequest, signal: AbortSignal): Promise<ArrayBuffer> => {
  const response = await fetch("/api/speak", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (response.ok) return response.arrayBuffer();
  throw failure(response, await response.json().catch(() => null));
};

// The Narrator's voices. Rejects with the server's reason.
export const fetchVoices = async (): Promise<Voices> => {
  const response = await fetch("/api/voices");
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) return VoicesSchema.parse(body);
  throw failure(response, body);
};
