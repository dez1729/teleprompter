import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ScriptChangeSchema, ScriptSchema, type Script } from '@teleprompter/protocol'
import { createApp, MAX_BODY_BYTES } from './app.ts'
import { ScriptStore } from './store.ts'

const PORT = 4747
const HOST = `localhost:${PORT}`

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tp-server-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

function setup(heartbeatMs?: number) {
  const store = new ScriptStore(dir)
  const app = createApp({ store, port: () => PORT, heartbeatMs })
  const request = (path: string, init: RequestInit & { headers?: Record<string, string> } = {}) =>
    app.request(path, { ...init, headers: { host: HOST, ...init.headers } })
  const push = (body: unknown, headers: Record<string, string> = {}) =>
    request('/api/script', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  return { store, app, request, push }
}

describe('Push', () => {
  it('starts with an empty Script at revision 0', async () => {
    const { request } = setup()
    const script = ScriptSchema.parse(await (await request('/api/script')).json())
    expect(script).toEqual({ text: '', format: 'text', source: null, revision: 0 })
  })

  it('Replace sets the text, source and format and bumps the revision', async () => {
    const { push } = setup()
    const res = await push({ kind: 'replace', text: '# Hi\nthere', source: 'Note' })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ text: '# Hi\nthere', format: 'markdown', source: 'Note', revision: 1 })
  })

  it('Replace clears the previous source when none is given', async () => {
    const { push } = setup()
    await push({ kind: 'replace', text: 'a', source: 'Note' })
    expect(((await (await push({ kind: 'replace', text: 'b' })).json()) as Script).source).toBeNull()
  })

  it('Append joins with a blank line and keeps the source', async () => {
    const { push } = setup()
    await push({ kind: 'replace', text: 'one two', source: 'Note' })
    const script = (await (await push({ kind: 'append', text: 'three' })).json()) as Script
    expect(script).toMatchObject({ text: 'one two\n\nthree', source: 'Note', revision: 2 })
  })

  it('Append to an empty Script is the addition alone', async () => {
    const { push } = setup()
    expect(((await (await push({ kind: 'append', text: 'three' })).json()) as Script).text).toBe('three')
  })

  it('Apply replaces the text and keeps the source', async () => {
    const { push } = setup()
    await push({ kind: 'replace', text: 'one', source: 'Note' })
    const script = (await (await push({ kind: 'apply', text: 'one two' })).json()) as Script
    expect(script).toMatchObject({ text: 'one two', source: 'Note', revision: 2 })
  })

  it('an explicit format wins over detection', async () => {
    const { push } = setup()
    expect(((await (await push({ kind: 'replace', text: 'plain', format: 'markdown' })).json()) as Script).format).toBe(
      'markdown',
    )
  })
})

describe('validation', () => {
  it.each([
    ['unknown kind', { kind: 'zap', text: 'a' }],
    ['blank text', { kind: 'replace', text: '   ' }],
    ['missing text', { kind: 'replace' }],
    ['unknown key', { kind: 'replace', text: 'a', extra: true }],
    ['bad format', { kind: 'replace', text: 'a', format: 'html' }],
  ])('rejects %s with 400 and leaves the Script alone', async (_name, body) => {
    const { push, store } = setup()
    const res = await push(body)
    expect(res.status).toBe(400)
    expect(((await res.json()) as { error: string }).error).toBe('Invalid request')
    expect(store.get().revision).toBe(0)
  })

  it('rejects a body that is not JSON', async () => {
    const { request } = setup()
    const res = await request('/api/script', { method: 'POST', body: 'not json' })
    expect(res.status).toBe(400)
  })

  it('rejects a body over the cap with 413', async () => {
    const { request } = setup()
    const big = JSON.stringify({ kind: 'replace', text: 'x'.repeat(MAX_BODY_BYTES) })
    const res = await request('/api/script', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(big.length) },
      body: big,
    })
    expect(res.status).toBe(413)
  })

  it('answers unknown API paths with a JSON 404', async () => {
    const { request } = setup()
    expect((await request('/api/nope')).status).toBe(404)
  })
})

describe('Host and Origin guards', () => {
  it('rejects a Host that is not loopback with our port', async () => {
    const { app } = setup()
    for (const host of ['evil.example', 'evil.example:4747', 'localhost', 'localhost:9999', '']) {
      const res = await app.request('/api/script', { headers: host ? { host } : {} })
      expect(res.status, host).toBe(403)
    }
  })

  it('accepts localhost and 127.0.0.1 on the app port and the dev port', async () => {
    const { app } = setup()
    for (const host of ['localhost:4747', '127.0.0.1:4747', 'localhost:4748', '127.0.0.1:4748']) {
      expect((await app.request('/api/script', { headers: { host } })).status, host).toBe(200)
    }
  })

  it('rejects a state-changing request from another origin', async () => {
    const { push, store } = setup()
    for (const origin of ['https://evil.example', 'http://localhost:9999', 'null']) {
      expect((await push({ kind: 'replace', text: 'a' }, { origin })).status, origin).toBe(403)
    }
    expect(store.get().revision).toBe(0)
  })

  it('accepts the app origins and a request with no Origin', async () => {
    const { push } = setup()
    for (const origin of ['http://localhost:4747', 'http://localhost:4748', 'http://127.0.0.1:4747', 'http://127.0.0.1:4748']) {
      expect((await push({ kind: 'replace', text: 'a' }, { origin })).status, origin).toBe(200)
    }
    expect((await push({ kind: 'replace', text: 'a' })).status).toBe(200)
  })

  it('does not check Origin on reads', async () => {
    const { request } = setup()
    expect((await request('/api/script', { headers: { origin: 'https://evil.example' } })).status).toBe(200)
  })
})

describe('persistence', () => {
  it('a new store on the same directory sees the last Script', async () => {
    const first = setup()
    await first.push({ kind: 'replace', text: 'kept', source: 'Note' })
    await first.push({ kind: 'append', text: 'more' })
    const second = new ScriptStore(dir)
    expect(second.get()).toEqual({ text: 'kept\n\nmore', format: 'text', source: 'Note', revision: 2 })
    expect(JSON.parse(readFileSync(join(dir, 'script.json'), 'utf8'))).toEqual(second.get())
  })

  it('moves an unreadable file aside and starts empty', () => {
    writeFileSync(join(dir, 'script.json'), '{nope')
    expect(new ScriptStore(dir).get().revision).toBe(0)
    expect(readdirSync(dir).some((name) => name.startsWith('script.json.corrupt-'))).toBe(true)
  })
})

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, needle: string, seen = ''): Promise<string> {
  const decoder = new TextDecoder()
  let text = seen
  while (!text.includes(needle)) {
    const { value, done } = await reader.read()
    if (done) throw new Error(`stream ended before ${JSON.stringify(needle)}: ${text}`)
    text += decoder.decode(value)
  }
  return text
}

function parseEvents(text: string) {
  return text
    .split('\n\n')
    .filter((block) => block.includes('event:'))
    .map((block) => {
      const event = /event: (.*)/.exec(block)?.[1]
      const data = JSON.parse(/data: (.*)/.exec(block)?.[1] ?? 'null')
      return { event, data }
    })
}

describe('GET /api/events', () => {
  it('sends the current Script on connect, then one ScriptChange per change', async () => {
    const { request, push } = setup()
    await push({ kind: 'replace', text: 'first' })
    const res = await request('/api/events')
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const reader = res.body!.getReader()

    let text = await readUntil(reader, '\n\n')
    await push({ kind: 'append', text: 'second' })
    text = await readUntil(reader, 'event: change', text)
    text = await readUntil(reader, '"revision":2', text)
    await reader.cancel()

    const events = parseEvents(text)
    expect(events[0]).toMatchObject({ event: 'script', data: { text: 'first', revision: 1 } })
    expect(events[1]?.event).toBe('change')
    const change = ScriptChangeSchema.parse(events[1]?.data)
    expect(change).toMatchObject({ kind: 'append', script: { text: 'first\n\nsecond', revision: 2 } })
  })

  it('sends heartbeat comments', async () => {
    const { request } = setup(10)
    const reader = (await request('/api/events')).body!.getReader()
    await readUntil(reader, ': keep-alive')
    await reader.cancel()
  })
})
