import { makeScript, type Script } from './script'
import type { Draft } from './draft'
import { DEFAULT_SETTINGS, parseSettings, type DisplaySettings } from './settings'

const SCRIPT_KEY = 'teleprompter.script'
const DRAFT_KEY = 'teleprompter.draft'
const SETTINGS_KEY = 'teleprompter.settings'

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be unavailable or full. The Prompter works without it.
  }
}

export function loadScript(): Script | null {
  const raw = read(SCRIPT_KEY)
  if (typeof raw !== 'object' || raw === null) return null
  const { source, format } = raw as Record<string, unknown>
  if (typeof source !== 'string' || source.trim() === '') return null
  const guessed = makeScript(source)
  return { source, format: format === 'markdown' || format === 'text' ? format : guessed.format }
}

export const saveScript = (script: Script) => write(SCRIPT_KEY, script)

export function loadSettings(): DisplaySettings {
  const raw = read(SETTINGS_KEY)
  return raw === null ? DEFAULT_SETTINGS : parseSettings(raw)
}

export const saveSettings = (settings: DisplaySettings) => write(SETTINGS_KEY, settings)

export function loadDraft(): Draft {
  const raw = read(DRAFT_KEY)
  return typeof raw === 'string' ? raw : null
}

export const saveDraft = (draft: Draft) => write(DRAFT_KEY, draft)
