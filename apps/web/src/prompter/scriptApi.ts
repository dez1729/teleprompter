import { ScriptChangeSchema, ScriptSchema, type ChangeKind, type PushRequest, type Script } from '@teleprompter/protocol'

export async function pushScript(request: PushRequest): Promise<void> {
  const response = await fetch('/api/script', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) throw new Error(`The server rejected the Script (${response.status}).`)
}

export type ScriptMessage =
  | { type: 'snapshot'; script: Script }
  | { type: 'change'; kind: ChangeKind; script: Script }

function parse<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }, data: string) {
  try {
    const result = schema.safeParse(JSON.parse(data))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

/**
 * Opens the server's event stream. EventSource reconnects on its own and the
 * server sends the current Script again each time, which arrives as a snapshot.
 */
export function openScriptStream(handlers: {
  onMessage: (message: ScriptMessage) => void
  onConnection: (connected: boolean) => void
}): () => void {
  const source = new EventSource('/api/events')
  source.onopen = () => handlers.onConnection(true)
  source.onerror = () => handlers.onConnection(false)
  source.addEventListener('script', (event) => {
    const script = parse(ScriptSchema, (event as MessageEvent<string>).data)
    if (script) handlers.onMessage({ type: 'snapshot', script })
  })
  source.addEventListener('change', (event) => {
    const change = parse(ScriptChangeSchema, (event as MessageEvent<string>).data)
    if (change) handlers.onMessage({ type: 'change', ...change })
  })
  return () => source.close()
}

