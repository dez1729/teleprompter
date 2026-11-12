import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  appendText,
  EMPTY_SCRIPT,
  guessFormat,
  ScriptSchema,
  type PushRequest,
  type Script,
  type ScriptChange,
} from '@teleprompter/protocol'

export function nextScript(current: Script, request: PushRequest): Script {
  const revision = current.revision + 1
  if (request.kind === 'append') {
    const text = appendText(current.text, request.text)
    const format = request.format ?? (current.format === 'markdown' ? 'markdown' : guessFormat(text))
    return { text, format, source: request.source ?? current.source, revision }
  }
  const source = request.source ?? (request.kind === 'apply' ? current.source : null)
  return { text: request.text, format: request.format ?? guessFormat(request.text), source, revision }
}

type Listener = (change: ScriptChange) => void

/** Owns the Script: applies changes, persists each one, and tells listeners. */
export class ScriptStore {
  readonly #file: string
  readonly #listeners = new Set<Listener>()
  #script: Script

  constructor(dataDir: string) {
    mkdirSync(dataDir, { recursive: true })
    this.#file = join(dataDir, 'script.json')
    this.#script = this.#load()
  }

  get(): Script {
    return this.#script
  }

  change(request: PushRequest): ScriptChange {
    const script = nextScript(this.#script, request)
    this.#persist(script)
    this.#script = script
    const change: ScriptChange = { kind: request.kind, script }
    for (const listener of this.#listeners) listener(change)
    return change
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #load(): Script {
    let raw: string
    try {
      raw = readFileSync(this.#file, 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return EMPTY_SCRIPT
      throw error
    }
    const parsed = ScriptSchema.safeParse(safeJson(raw))
    if (parsed.success) return parsed.data
    // Keep the unreadable file for the user and start clean rather than refuse to run.
    renameSync(this.#file, `${this.#file}.corrupt-${Date.now()}`)
    console.warn(`Ignoring unreadable ${this.#file}; moved it aside.`)
    return EMPTY_SCRIPT
  }

  /** Temp file and rename, so a crash never leaves a half-written Script. */
  #persist(script: Script): void {
    const temp = `${this.#file}.${process.pid}.tmp`
    writeFileSync(temp, JSON.stringify(script))
    renameSync(temp, this.#file)
  }
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}
