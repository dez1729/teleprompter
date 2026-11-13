import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import {
  HISTORY_LIMIT,
  HistorySchema,
  type ChangeKind,
  type Script,
  type Version,
  type VersionSummary,
} from '@teleprompter/protocol'
import { readJsonFile, writeJsonFile } from './jsonFile.ts'

/** An Edit saves a Version only after this long with no Edit, so a typing session is one Version. */
export const EDIT_IDLE_MS = 30_000
const PREVIEW_CHARS = 80

export function summarize({ text, format: _format, ...rest }: Version): VersionSummary {
  const flat = text.trim().replace(/\s+/g, ' ')
  return {
    ...rest,
    wordCount: flat === '' ? 0 : flat.split(' ').length,
    preview: flat.length > PREVIEW_CHARS ? `${flat.slice(0, PREVIEW_CHARS).trimEnd()}…` : flat,
  }
}

/** Script history: the last Versions of the Script, newest first, persisted on every save. */
export class ScriptHistory {
  readonly #file: string
  #versions: Version[]
  #lastEditAt = -Infinity

  constructor(dataDir: string) {
    this.#file = join(dataDir, 'history.json')
    this.#versions = readJsonFile(this.#file, HistorySchema, []).slice(0, HISTORY_LIMIT)
  }

  list(): readonly Version[] {
    return this.#versions
  }

  get(id: string): Version | undefined {
    return this.#versions.find((version) => version.id === id)
  }

  /**
   * Called with the Script as it stands just before a change of `kind`.
   * Returns the id of the Version it saved, or null when the rules say not to save one.
   */
  beforeChange(current: Script, kind: ChangeKind, nowMs: number): string | null {
    const quietMs = nowMs - this.#lastEditAt
    if (kind === 'edit') this.#lastEditAt = nowMs
    if (current.text.trim() === '') return null
    if (kind === 'edit' && quietMs < EDIT_IDLE_MS) return null
    const version: Version = { id: randomUUID(), savedAt: new Date(nowMs).toISOString(), reason: kind, ...current }
    this.#versions = [version, ...this.#versions].slice(0, HISTORY_LIMIT)
    writeJsonFile(this.#file, this.#versions)
    return version.id
  }
}
