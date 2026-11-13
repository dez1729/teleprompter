import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  appendText,
  EMPTY_SCRIPT,
  guessFormat,
  ScriptSchema,
  type PushRequest,
  type Script,
  type ScriptChange,
  type Version,
} from '@teleprompter/protocol'
import { ScriptHistory } from './history.ts'
import { readJsonFile, writeJsonFile } from './jsonFile.ts'

export function nextScript(current: Script, request: PushRequest): Script {
  const revision = current.revision + 1
  if (request.kind === 'append') {
    const text = appendText(current.text, request.text)
    const format = request.format ?? (current.format === 'markdown' ? 'markdown' : guessFormat(text))
    return { text, format, source: request.source ?? current.source, revision }
  }
  if (request.kind === 'edit') {
    // Typing must not flip the format, so an Edit only detects it when starting from nothing.
    const format = request.format ?? (current.text.trim() === '' ? guessFormat(request.text) : current.format)
    return { text: request.text, format, source: request.source ?? current.source, revision }
  }
  return { text: request.text, format: request.format ?? guessFormat(request.text), source: request.source ?? null, revision }
}

type Listener = (change: ScriptChange) => void

export interface StoreOptions {
  /** The clock, in epoch milliseconds. Injected by tests. */
  now?: () => number
}

/** Owns the Script and its history: applies changes, persists each one, and tells listeners. */
export class ScriptStore {
  readonly #file: string
  readonly #listeners = new Set<Listener>()
  readonly #history: ScriptHistory
  readonly #now: () => number
  #script: Script

  constructor(dataDir: string, { now = Date.now }: StoreOptions = {}) {
    mkdirSync(dataDir, { recursive: true })
    this.#file = join(dataDir, 'script.json')
    this.#script = readJsonFile(this.#file, ScriptSchema, EMPTY_SCRIPT)
    this.#history = new ScriptHistory(dataDir)
    this.#now = now
  }

  get(): Script {
    return this.#script
  }

  change(request: PushRequest): ScriptChange {
    const script = nextScript(this.#script, request)
    const previousVersionId = this.#history.beforeChange(this.#script, request.kind, this.#now())
    writeJsonFile(this.#file, script)
    this.#script = script
    const change: ScriptChange = { kind: request.kind, script, previousVersionId }
    for (const listener of this.#listeners) listener(change)
    return change
  }

  versions(): readonly Version[] {
    return this.#history.list()
  }

  version(id: string): Version | undefined {
    return this.#history.get(id)
  }

  /** Makes a Version the Script again, as a Replace, so the restore is itself undoable. */
  restore(id: string): ScriptChange | undefined {
    const version = this.#history.get(id)
    if (!version) return undefined
    const { text, format, source } = version
    return this.change({ kind: 'replace', text, format, ...(source === null ? {} : { source }) })
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }
}
