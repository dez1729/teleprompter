import type { ChangeSet } from '@codemirror/state'
import type { Script, ScriptFormat } from '@teleprompter/protocol'
import { normalizeLineBreaks, rebaseRemote } from './changes'

/** How long typing must stop before the Editor sends an Edit. */
export const SEND_DELAY_MS = 400
const RETRY_DELAY_MS = 2000

/** saved: the server has the document. pending: an Edit is waiting or on its way. failed: the last send failed and will be retried. */
export type SyncStatus = 'saved' | 'pending' | 'failed'

export interface SyncHost {
  /** The Editor's document as it stands. */
  doc: () => string
  /** Applies a change that came from the server to the document. */
  applyRemote: (changes: ChangeSet) => void
  /** Sends the whole text as an Edit and resolves with the Script the server made of it. */
  send: (text: string, format: ScriptFormat | undefined) => Promise<Script>
  /** Called whenever the status or the Script the server holds may have changed. */
  onState: (state: { status: SyncStatus; script: Script }) => void
}

/**
 * Keeps the Editor's document and the server's Script the same (ADR 0002).
 *
 * The only state is the Script the Editor last agreed on with the server. Whatever the
 * document holds beyond that is unsent, so nothing has to track edits as they happen.
 */
export class ScriptSync {
  readonly #host: SyncHost
  #synced: Script
  #syncedText: string
  /** The text of the Edit on its way to the server, to recognise it when it comes back. */
  #inFlight: string | null = null
  #format: ScriptFormat | undefined
  #timer: ReturnType<typeof setTimeout> | undefined
  #failed = false

  constructor(host: SyncHost, initial: Script) {
    this.#host = host
    this.#synced = initial
    this.#syncedText = normalizeLineBreaks(initial.text)
  }

  /** The document changed. Sends once typing stops. */
  documentChanged(): void {
    if (this.#host.doc() === this.#syncedText) return this.#report()
    this.#schedule(SEND_DELAY_MS)
  }

  setFormat(format: ScriptFormat): void {
    this.#format = format
    this.#schedule(0)
  }

  /** A Script from the server: a snapshot, another writer's change, or this Editor's own Edit coming back. */
  receive(script: Script, isSnapshot = false): void {
    const { revision } = this.#synced
    if (isSnapshot ? script.revision === revision : script.revision <= revision) return
    const base = this.#syncedText
    const text = normalizeLineBreaks(script.text)
    this.#synced = script
    this.#syncedText = text
    const local = this.#host.doc()
    if (text !== local && text !== this.#inFlight) this.#host.applyRemote(rebaseRemote(base, local, text))
    this.documentChanged()
  }

  /** Sends now instead of waiting for typing to stop, for when the window is closing. */
  flush(): void {
    clearTimeout(this.#timer)
    this.#timer = undefined
    void this.#send()
  }

  dispose(): void {
    clearTimeout(this.#timer)
  }

  #schedule(delayMs: number): void {
    clearTimeout(this.#timer)
    this.#timer = setTimeout(() => this.flush(), delayMs)
    this.#report()
  }

  async #send(): Promise<void> {
    // The reply to the Edit in flight sends whatever was typed meanwhile.
    if (this.#inFlight !== null) return
    const text = this.#host.doc()
    const format = this.#format
    if (text === this.#syncedText && format === undefined) return this.#report()
    this.#inFlight = text
    this.#format = undefined
    this.#report()
    try {
      const script = await this.#host.send(text, format)
      this.#failed = false
      this.receive(script)
      this.#inFlight = null
      this.documentChanged()
    } catch {
      this.#inFlight = null
      this.#format ??= format
      this.#failed = true
      this.#schedule(RETRY_DELAY_MS)
    }
  }

  #report(): void {
    const settled = this.#inFlight === null && this.#timer === undefined && this.#format === undefined
    const saved = settled && this.#host.doc() === this.#syncedText
    this.#host.onState({ status: this.#failed ? 'failed' : saved ? 'saved' : 'pending', script: this.#synced })
  }
}
