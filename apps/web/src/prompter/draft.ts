import { appendText, type Script } from '@teleprompter/protocol'
import type { TokenizedScript } from './script'

type ScriptText = Pick<Script, 'text'> | null

/**
 * The paste dialog's text. `null` means clean: the draft is the Script itself,
 * so it follows the Script when that changes. A string is an edit that differs from the Script.
 */
export type Draft = string | null

export const draftText = (draft: Draft, script: ScriptText): string => draft ?? script?.text ?? ''

export const isDirty = (draft: Draft, script: ScriptText): boolean => draft !== null && draft !== (script?.text ?? '')

/** Typing the Script back in exactly makes the draft clean again. */
export const editDraft = (text: string, script: ScriptText): Draft => (text === (script?.text ?? '') ? null : text)

/** A clean draft follows the Script on its own; a dirty one gets the same addition. */
export const appendToDraft = (draft: Draft, addition: string): Draft =>
  draft === null ? null : appendText(draft, addition)

/** What a Push Append added, read off the new text. Null when the new text does not extend the old one. */
export function appendedTail(before: string, after: string): string | null {
  const prefix = before.trim() === '' ? '' : `${before.replace(/\s+$/, '')}\n\n`
  return after.startsWith(prefix) ? after.slice(prefix.length) : null
}

/** True when the words before the reader's position are the same in both versions. */
export function keepsPlace(before: TokenizedScript, after: TokenizedScript, cursor: number): boolean {
  const passed = Math.floor(cursor)
  if (after.words.length < passed) return false
  for (let i = 0; i < passed; i++) {
    if (before.words[i]?.text !== after.words[i]?.text) return false
  }
  return true
}
