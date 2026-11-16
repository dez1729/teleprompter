import type { PushRequest } from "@teleprompter/protocol";

/** The server's DEFAULT_PORT, written out so the plugin does not bundle the protocol's schemas. */
export const DEFAULT_SERVER_URL = "http://127.0.0.1:4747";

export type PushKind = "replace" | "append";

export interface Note {
  /** The note's title, shown in the Prompter as the Script's Source. */
  basename: string;
  text: string;
}

/** A Push of the selection, or of the whole note when nothing is selected. Null when there is no text. */
export const pushFor = (kind: PushKind, selection: string, note: Note): PushRequest | null => {
  const text = selection.trim() !== "" ? selection : note.text;
  if (text.trim() === "") return null;
  return { kind, text, format: "markdown", source: note.basename } satisfies PushRequest as PushRequest;
};

export interface HttpRequest {
  url: string;
  method: "POST";
  contentType: string;
  body: string;
}

/** Obsidian's requestUrl in production; fetch in tests. Rejects only when the server cannot be reached. */
export type Http = (request: HttpRequest) => Promise<{ status: number; text: string }>;

export class PushError extends Error {}

export const sendPush = async (request: PushRequest, serverUrl: string, http: Http): Promise<void> => {
  let endpoint: string;

  try {
    endpoint = new URL("/api/script", serverUrl).href;
  }
  catch {
    throw new PushError(`The Teleprompter server address "${serverUrl}" is not a URL. Fix it in the plugin settings.`);
  }

  let response: Awaited<ReturnType<Http>>;

  try {
    response = await http({
      url: endpoint,
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify(request),
    } satisfies HttpRequest as HttpRequest);
  }
  catch {
    throw new PushError(`Cannot reach the Teleprompter server at ${serverUrl}. Start it with "tp serve".`);
  }

  if (response.status < 200 || response.status >= 300) {
    throw new PushError(`The Teleprompter server rejected the text (${response.status}). ${response.text}`.trim());
  }
};
