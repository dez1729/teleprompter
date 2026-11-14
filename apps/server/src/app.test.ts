import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  HISTORY_LIMIT,
  ScriptChangeSchema,
  ScriptSchema,
  VersionSchema,
  VersionSummarySchema,
  type Script,
  type VersionSummary,
} from '@teleprompter/protocol'
import { EDIT_IDLE_MS } from './history.ts'
import { createApp, MAX_BODY_BYTES } from './app.ts'
import { ScriptStore } from './store.ts'

const PORT = 4747
const HOST = `localhost:${PORT}`

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tp-server-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

let nowMs: number
beforeEach(() => {
  nowMs = Date.parse('2026-01-01T00:00:00Z')
})

function setup(heartbeatMs?: number) {
  const store = new ScriptStore(dir, { now: () => nowMs })
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

  it('Edit replaces the text and keeps the source', async () => {
    const { push } = setup()
    await push({ kind: 'replace', text: 'one', source: 'Note' })
    const script = (await (await push({ kind: 'edit', text: 'one two' })).json()) as Script
    expect(script).toMatchObject({ text: 'one two', source: 'Note', revision: 2 })
  })

  it('Edit keeps the format unless it starts from an empty Script', async () => {
    const { push } = setup()
    expect(((await (await push({ kind: 'edit', text: '# Title' })).json()) as Script).format).toBe('markdown')
    expect(((await (await push({ kind: 'edit', text: 'plain now' })).json()) as Script).format).toBe('markdown')
    expect(((await (await push({ kind: 'edit', text: 'plain now', format: 'text' })).json()) as Script).format).toBe('text')
  })

  it('Edit may clear the Script', async () => {
    const { push } = setup()
    await push({ kind: 'replace', text: 'one' })
    const res = await push({ kind: 'edit', text: '' })
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ text: '', revision: 2 })
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

describe('Script history', () => {
  async function history(request: ReturnType<typeof setup>['request']) {
    return VersionSummarySchema.array().parse(await (await request('/api/history')).json())
  }
  const restore = (request: ReturnType<typeof setup>['request'], id: string, headers: Record<string, string> = {}) =>
    request(`/api/history/${id}/restore`, { method: 'POST', headers })

  it('saves the Script as it was before every Push, newest first', async () => {
    const { push, request } = setup()
    await push({ kind: 'replace', text: 'one', source: 'Note' })
    await push({ kind: 'append', text: 'two' })
    await push({ kind: 'replace', text: '# three', source: 'Other' })

    const versions = await history(request)
    expect(versions.map(({ reason, source, preview, wordCount, revision }) => ({ reason, source, preview, wordCount, revision }))).toEqual([
      { reason: 'replace', source: 'Note', preview: 'one two', wordCount: 2, revision: 2 },
      { reason: 'append', source: 'Note', preview: 'one', wordCount: 1, revision: 1 },
    ])
    expect(versions[0]).not.toHaveProperty('text')
    expect(versions[0]!.savedAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('does not save an empty Script', async () => {
    const { push, request } = setup()
    await push({ kind: 'replace', text: 'one' })
    expect(await history(request)).toEqual([])
    await push({ kind: 'edit', text: '' })
    await push({ kind: 'replace', text: 'two' })
    expect((await history(request)).map((v) => v.preview)).toEqual(['one'])
  })

  it('saves before an Edit only after 30 s with no Edit', async () => {
    const { push, request } = setup()
    await push({ kind: 'replace', text: 'a' })
    await push({ kind: 'edit', text: 'ab' })
    nowMs += EDIT_IDLE_MS - 1
    await push({ kind: 'edit', text: 'abc' })
    // The quiet is measured from the last Edit, not from the last saved Version.
    nowMs += EDIT_IDLE_MS - 1
    await push({ kind: 'edit', text: 'abcd' })
    expect((await history(request)).map((v) => [v.reason, v.preview])).toEqual([['edit', 'a']])

    nowMs += EDIT_IDLE_MS
    await push({ kind: 'edit', text: 'abcde' })
    expect((await history(request)).map((v) => [v.reason, v.preview])).toEqual([
      ['edit', 'abcd'],
      ['edit', 'a'],
    ])
  })

  it('a Push between Edits does not reset the Edit quiet period', async () => {
    const { push, request } = setup()
    await push({ kind: 'replace', text: 'a' })
    await push({ kind: 'edit', text: 'ab' })
    await push({ kind: 'append', text: 'c' })
    await push({ kind: 'edit', text: 'abcd' })
    expect((await history(request)).map((v) => v.reason)).toEqual(['append', 'edit'])
  })

  it('keeps only the newest Versions', async () => {
    const { push, request } = setup()
    for (let i = 0; i <= HISTORY_LIMIT + 2; i++) await push({ kind: 'replace', text: `script ${i}` })
    const versions = await history(request)
    expect(versions).toHaveLength(HISTORY_LIMIT)
    expect(versions[0]!.preview).toBe(`script ${HISTORY_LIMIT + 1}`)
    expect(versions.at(-1)!.preview).toBe('script 2')
  })

  it('shortens the preview of a long Script and flattens its whitespace', async () => {
    const { push, request } = setup()
    await push({ kind: 'replace', text: `first\n\nsecond ${'word '.repeat(40)}` })
    await push({ kind: 'replace', text: 'next' })
    const [version] = await history(request)
    expect(version!.preview.startsWith('first second word')).toBe(true)
    expect(version!.preview.length).toBeLessThanOrEqual(81)
    expect(version!.preview.endsWith('…')).toBe(true)
    expect(version!.wordCount).toBe(42)
  })

  it('serves one full Version, and 404 for an unknown id', async () => {
    const { push, request } = setup()
    await push({ kind: 'replace', text: '# one', source: 'Note' })
    await push({ kind: 'replace', text: 'two' })
    const [summary] = await history(request)
    const version = VersionSchema.parse(await (await request(`/api/history/${summary!.id}`)).json())
    expect(version).toMatchObject({ text: '# one', format: 'markdown', source: 'Note', reason: 'replace', revision: 1 })
    expect((await request('/api/history/nope')).status).toBe(404)
  })

  it('restore makes the Version the Script as a Replace and saves the Script it replaced', async () => {
    const { push, request, store } = setup()
    await push({ kind: 'replace', text: '# one', source: 'Note' })
    await push({ kind: 'replace', text: 'two' })
    const changes: unknown[] = []
    store.subscribe((change) => changes.push(change))
    const [first] = await history(request)

    const res = await restore(request, first!.id)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ text: '# one', format: 'markdown', source: 'Note', revision: 3 })

    const after = await history(request)
    expect(after.map((v: VersionSummary) => [v.reason, v.preview])).toEqual([
      ['replace', 'two'],
      ['replace', '# one'],
    ])
    expect(changes).toEqual([{ kind: 'replace', script: store.get(), previousVersionId: after[0]!.id }])

    // Restoring the Version the restore saved undoes the restore.
    await restore(request, after[0]!.id)
    expect(store.get().text).toBe('two')
  })

  it('restore answers 404 for an unknown id and changes nothing', async () => {
    const { push, request, store } = setup()
    await push({ kind: 'replace', text: 'one' })
    expect((await restore(request, 'nope')).status).toBe(404)
    expect(store.get().revision).toBe(1)
  })

  it('restore is guarded like any other write', async () => {
    const { push, request, app, store } = setup()
    await push({ kind: 'replace', text: 'one' })
    await push({ kind: 'replace', text: 'two' })
    const [version] = await history(request)
    expect((await restore(request, version!.id, { origin: 'https://evil.example' })).status).toBe(403)
    const res = await app.request(`/api/history/${version!.id}/restore`, { method: 'POST', headers: { host: 'evil.example' } })
    expect(res.status).toBe(403)
    expect(store.get().text).toBe('two')
    expect((await restore(request, version!.id, { origin: 'http://localhost:4747' })).status).toBe(200)
  })

  it('a change says which Version was saved ahead of it', async () => {
    const { store } = setup()
    expect(store.change({ kind: 'replace', text: 'one' }).previousVersionId).toBeNull()
    const change = store.change({ kind: 'replace', text: 'two' })
    expect(change.previousVersionId).toBe(store.versions()[0]!.id)
    expect(store.change({ kind: 'edit', text: 'two!' }).previousVersionId).toBe(store.versions()[0]!.id)
    expect(store.change({ kind: 'edit', text: 'two!!' }).previousVersionId).toBeNull()
  })

  it('survives a restart, and moves an unreadable history file aside', async () => {
    const first = setup()
    await first.push({ kind: 'replace', text: 'one' })
    await first.push({ kind: 'replace', text: 'two' })
    expect(new ScriptStore(dir).versions().map((v) => v.text)).toEqual(['one'])

    writeFileSync(join(dir, 'history.json'), '[{"nope":1}]')
    const store = new ScriptStore(dir)
    expect(store.versions()).toEqual([])
    expect(store.get().text).toBe('two')
    expect(readdirSync(dir).some((name) => name.startsWith('history.json.corrupt-'))).toBe(true)
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
