import type { Draft } from './draft'
import { DEFAULT_SETTINGS, parseSettings, type DisplaySettings } from './settings'

const LEGACY_SCRIPT_KEY = 'teleprompter.script'
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

/** The Script this browser stored before the server owned it, for the one-time move to the server. */
export function loadLegacyScript(): { text: string; format?: 'markdown' | 'text' } | null {
  const raw = read(LEGACY_SCRIPT_KEY)
  if (typeof raw !== 'object' || raw === null) return null
  const { source, format } = raw as Record<string, unknown>
  if (typeof source !== 'string' || source.trim() === '') return null
  return { text: source, format: format === 'markdown' || format === 'text' ? format : undefined }
}

export function clearLegacyScript(): void {
  try {
    localStorage.removeItem(LEGACY_SCRIPT_KEY)
  } catch {
    // Nothing to remove if storage is unavailable.
  }
}

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
