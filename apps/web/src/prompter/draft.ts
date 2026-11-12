import { appendScript, makeScript, type Script, type TokenizedScript } from './script'

/**
 * The paste dialog's text. `null` means clean: the draft is the Script itself,
 * so it follows the Script when that changes. A string is an edit that differs from the Script.
 */
export type Draft = string | null

export const draftText = (draft: Draft, script: Script | null): string => draft ?? script?.source ?? ''

export const isDirty = (draft: Draft, script: Script | null): boolean => draft !== null && draft !== (script?.source ?? '')

/** Typing the Script back in exactly makes the draft clean again. */
export const editDraft = (text: string, script: Script | null): Draft => (text === (script?.source ?? '') ? null : text)

/** A clean draft follows the Script on its own; a dirty one gets the same addition. */
export const appendToDraft = (draft: Draft, addition: string): Draft =>
  draft === null ? null : appendScript(makeScript(draft), addition).source

/** True when the words before the reader's position are the same in both versions. */
export function keepsPlace(before: TokenizedScript, after: TokenizedScript, cursor: number): boolean {
  const passed = Math.floor(cursor)
  if (after.words.length < passed) return false
  for (let i = 0; i < passed; i++) {
    if (before.words[i]?.text !== after.words[i]?.text) return false
  }
  return true
}
