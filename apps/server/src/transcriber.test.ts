import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { ScriptStore } from './store.ts'
import { TranscriberError, whisperTranscriber, type Transcriber } from './transcriber.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tp-transcribe-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const speech = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/wav' })

const transcribe = (transcriber: Transcriber | undefined, body: Blob = speech) => {
  const app = createApp({ store: new ScriptStore(dir), port: () => 4747, transcriber })
  return app.request('/api/transcribe', { method: 'POST', headers: { host: 'localhost:4747', 'content-type': 'audio/wav' }, body })
}

describe('POST /api/transcribe', () => {
  it('answers with what the Transcriber heard', async () => {
    const res = await transcribe(async (audio) => `heard ${audio.size} bytes`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ text: 'heard 3 bytes' })
  })

  it('passes on why the Transcriber failed', async () => {
    const res = await transcribe(() => Promise.reject(new TranscriberError('Cannot reach the Whisper server.')))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'Cannot reach the Whisper server.' })
  })

  it('refuses empty audio', async () => {
    expect((await transcribe(async () => 'never', new Blob([]))).status).toBe(400)
  })

  it('says when no Transcriber is set up', async () => {
    expect((await transcribe(undefined)).status).toBe(503)
  })
})

describe('whisperTranscriber', () => {
  it('sends the clip to the OpenAI transcription endpoint with silence filtered out', async () => {
    let sent: { url: string; form: FormData } | undefined
    const transcriber = whisperTranscriber({
      url: 'http://127.0.0.1:2022',
      model: 'tiny',
      fetch: async (url, init) => {
        sent = { url: String(url), form: init!.body as FormData }
        return Response.json({ text: ' Hello there.' })
      },
    })

    expect(await transcriber(speech)).toBe(' Hello there.')
    expect(sent!.url).toBe('http://127.0.0.1:2022/v1/audio/transcriptions')
    expect(sent!.form.get('model')).toBe('tiny')
    expect(sent!.form.get('vad_filter')).toBe('true')
  })

  it('tells the reader how to fix an unreachable server', async () => {
    const transcriber = whisperTranscriber({ fetch: () => Promise.reject(new TypeError('fetch failed')) })
    await expect(transcriber(speech)).rejects.toThrow(/Cannot reach the Whisper server at http:\/\/127\.0\.0\.1:2022\..*TELEPROMPTER_WHISPER_URL/)
  })

  it('reports an error answer with its status', async () => {
    const transcriber = whisperTranscriber({ fetch: async () => new Response('model not found', { status: 404 }) })
    await expect(transcriber(speech)).rejects.toThrow(/answered 404\. model not found/)
  })
})
