import { DEFAULT_PORT, ScriptSchema, type PushRequest, type Script } from '@teleprompter/protocol'

export class CliError extends Error {}

export interface SendOptions {
  kind: 'replace' | 'append'
  text: string
  markdown: boolean
  source?: string
}

export const defaultUrl = `http://127.0.0.1:${DEFAULT_PORT}`

export function buildRequest({ kind, text, markdown, source }: SendOptions): PushRequest {
  return { kind, text, format: markdown ? 'markdown' : 'text', ...(source ? { source } : {}) }
}

export async function send(
  options: SendOptions,
  { url, fetch: doFetch = fetch }: { url: string; fetch?: typeof fetch },
): Promise<Script> {
  const endpoint = new URL('/api/script', url)
  let response: Response
  try {
    response = await doFetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildRequest(options)),
    })
  } catch {
    throw new CliError(`Cannot reach the Teleprompter server at ${url}. Start it with "tp serve".`)
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new CliError(`The server rejected the Push (${response.status}). ${detail}`.trim())
  }
  return ScriptSchema.parse(await response.json())
}
