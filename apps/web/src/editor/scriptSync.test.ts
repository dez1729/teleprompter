import { EditorState, type ChangeSet } from '@codemirror/state'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Script, ScriptFormat } from '@teleprompter/protocol'
import { ScriptSync, SEND_DELAY_MS, type SyncStatus } from './scriptSync'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const script = (text: string, revision: number, format: ScriptFormat = 'text'): Script => ({
  text,
  format,
  source: null,
  revision,
})

/** An Editor with no DOM, and a server that answers only when the test says so. */
function setup(initial: Script) {
  let state = EditorState.create({ doc: initial.text })
  let serverRevision = initial.revision
  const sent: { text: string; format: ScriptFormat | undefined; reply: () => Script; fail: () => void }[] = []
  const statuses: SyncStatus[] = []
  const remoteChanges: ChangeSet[] = []

  const sync = new ScriptSync(
    {
      doc: () => state.doc.toString(),
      applyRemote: (changes) => {
        remoteChanges.push(changes)
        state = state.update({ changes }).state
      },
      send: (text, format) =>
        new Promise<Script>((resolve, reject) => {
          sent.push({
            text,
            format,
            reply: () => {
              const made = script(text, ++serverRevision, format)
              resolve(made)
              return made
            },
            fail: () => reject(new Error('offline')),
          })
        }),
      onState: ({ status }) => statuses.push(status),
    },
    initial,
  )

  return {
    sync,
    sent,
    remoteChanges,
    doc: () => state.doc.toString(),
    status: () => statuses.at(-1),
    type: (insert: string, from = state.doc.length) => {
      state = state.update({ changes: { from, insert } }).state
      sync.documentChanged()
    },
    /** Another writer changed the Script on the server. */
    push: (text: string) => sync.receive(script(text, ++serverRevision)),
    settle: () => vi.advanceTimersByTimeAsync(0),
    pause: () => vi.advanceTimersByTimeAsync(SEND_DELAY_MS),
  }
}

describe('ScriptSync', () => {
  it('sends the whole text once typing stops', async () => {
    const editor = setup(script('one', 1))
    editor.type(' two')
    await vi.advanceTimersByTimeAsync(SEND_DELAY_MS - 1)
    editor.type(' three')
    await vi.advanceTimersByTimeAsync(SEND_DELAY_MS - 1)
    expect(editor.sent).toHaveLength(0)
    expect(editor.status()).toBe('pending')

    await vi.advanceTimersByTimeAsync(1)
    expect(editor.sent.map((s) => s.text)).toEqual(['one two three'])
    editor.sent[0]!.reply()
    await editor.settle()
    expect(editor.status()).toBe('saved')
  })

  it('does not send when the document is back to what the server has', async () => {
    const editor = setup(script('one', 1))
    editor.type('x')
    editor.sync.receive(script('onex', 2))
    await editor.pause()
    expect(editor.sent).toHaveLength(0)
    expect(editor.status()).toBe('saved')
  })

  it('ignores its own Edit coming back, whichever of the reply and the event is first', async () => {
    for (const eventFirst of [true, false]) {
      const editor = setup(script('one', 1))
      editor.type(' two')
      await editor.pause()
      const send = editor.sent[0]!
      if (eventFirst) editor.sync.receive(script('one two', 2))
      const made = send.reply()
      await editor.settle()
      if (!eventFirst) editor.sync.receive(made)

      expect(editor.remoteChanges).toHaveLength(0)
      expect(editor.doc()).toBe('one two')
      await editor.pause()
      expect(editor.sent).toHaveLength(1)
      expect(editor.status()).toBe('saved')
    }
  })

  it('sends what was typed while an Edit was on its way', async () => {
    const editor = setup(script('one', 1))
    editor.type(' two')
    await editor.pause()
    editor.type(' three')
    await editor.pause()
    expect(editor.sent).toHaveLength(1)

    editor.sent[0]!.reply()
    await editor.pause()
    expect(editor.sent.map((s) => s.text)).toEqual(['one two', 'one two three'])
    expect(editor.remoteChanges).toHaveLength(0)
  })

  it('applies a Push to the document', () => {
    const editor = setup(script('one', 1))
    editor.push('one\n\ntwo')
    expect(editor.doc()).toBe('one\n\ntwo')
    expect(editor.remoteChanges).toHaveLength(1)
    expect(editor.status()).toBe('saved')
  })

  it('rebases a Push over unsent typing, then sends the merged text', async () => {
    const editor = setup(script('one two', 1))
    editor.type('NEW ', 4)
    editor.push('one two\n\nthree')
    expect(editor.doc()).toBe('one NEW two\n\nthree')

    await editor.pause()
    expect(editor.sent.map((s) => s.text)).toEqual(['one NEW two\n\nthree'])
  })

  it('keeps a Push that lands while an Edit is on its way', async () => {
    const editor = setup(script('one', 1))
    editor.type(' two')
    await editor.pause()
    // The server takes the Push first, then the Edit, which overwrites it there.
    editor.push('one\n\npushed')
    expect(editor.doc()).toBe('one two\n\npushed')
    editor.sent[0]!.reply()
    await editor.pause()

    expect(editor.doc()).toBe('one two\n\npushed')
    expect(editor.sent.map((s) => s.text)).toEqual(['one two', 'one two\n\npushed'])
  })

  it('ignores a stale change and a snapshot of the revision it already has', () => {
    const editor = setup(script('one', 5))
    editor.sync.receive(script('old', 4))
    editor.sync.receive(script('one', 5), true)
    expect(editor.doc()).toBe('one')
    expect(editor.remoteChanges).toHaveLength(0)
  })

  it('takes a snapshot whose revision differs, even a lower one', () => {
    const editor = setup(script('one', 5))
    editor.sync.receive(script('fresh server', 1), true)
    expect(editor.doc()).toBe('fresh server')
  })

  it('does not send a Script that differs only in line breaks', async () => {
    const editor = setup(script('one\r\ntwo', 1))
    editor.sync.documentChanged()
    await editor.pause()
    expect(editor.sent).toHaveLength(0)
    expect(editor.status()).toBe('saved')
  })

  it('retries a failed send and reports the failure until it succeeds', async () => {
    const editor = setup(script('one', 1))
    editor.type(' two')
    await editor.pause()
    editor.sent[0]!.fail()
    await editor.settle()
    expect(editor.status()).toBe('failed')

    await vi.advanceTimersByTimeAsync(2000)
    expect(editor.sent).toHaveLength(2)
    editor.sent[1]!.reply()
    await editor.settle()
    expect(editor.status()).toBe('saved')
  })

  it('sends a format change at once, with the text', async () => {
    const editor = setup(script('# one', 1))
    editor.sync.setFormat('markdown')
    await editor.settle()
    expect(editor.sent.map(({ text, format }) => ({ text, format }))).toEqual([{ text: '# one', format: 'markdown' }])
  })

  it('flush sends without waiting for typing to stop', async () => {
    const editor = setup(script('one', 1))
    editor.type(' two')
    editor.sync.flush()
    await editor.settle()
    expect(editor.sent.map((s) => s.text)).toEqual(['one two'])
  })
})
