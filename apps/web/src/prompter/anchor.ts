import { diffArrays } from 'diff'
import type { ChangeKind } from '@teleprompter/protocol'
import { keepPlace, type Placement } from './playback'
import type { TokenizedScript } from './script'

/**
 * Past this many inserted plus deleted words the two texts are treated as unrelated
 * between their common start and end, which keeps a wholesale rewrite from stalling a frame.
 */
const MAX_EDIT_WORDS = 200

/** A run of old words and the run of new words that took its place. */
interface Segment {
  oldLength: number
  newLength: number
  kept: boolean
}

function segments(oldWords: readonly string[], newWords: readonly string[]): Segment[] {
  const shortest = Math.min(oldWords.length, newWords.length)
  let prefix = 0
  while (prefix < shortest && oldWords[prefix] === newWords[prefix]) prefix++
  let suffix = 0
  while (suffix < shortest - prefix && oldWords.at(-1 - suffix) === newWords.at(-1 - suffix)) suffix++

  const oldMiddle = oldWords.slice(prefix, oldWords.length - suffix)
  const newMiddle = newWords.slice(prefix, newWords.length - suffix)
  const parts = diffArrays(oldMiddle, newMiddle, { maxEditLength: MAX_EDIT_WORDS })

  const result: Segment[] = [{ oldLength: prefix, newLength: prefix, kept: true }]
  const change = (oldLength: number, newLength: number) => {
    const last = result.at(-1)!
    if (last.kept) result.push({ oldLength, newLength, kept: false })
    else {
      last.oldLength += oldLength
      last.newLength += newLength
    }
  }
  if (!parts) change(oldMiddle.length, newMiddle.length)
  else {
    for (const part of parts) {
      if (part.removed) change(part.count, 0)
      else if (part.added) change(0, part.count)
      else result.push({ oldLength: part.count, newLength: part.count, kept: true })
    }
  }
  result.push({ oldLength: suffix, newLength: suffix, kept: true })
  return result
}

/**
 * Where a reader at `cursor` (a fractional word index into `oldWords`) is in `newWords`.
 *
 * A word that survives the change keeps the reader's exact offset into it. A deleted
 * word sends the reader to the next surviving word, or the end. Inside a span that was
 * rewritten the reader lands the same share of the way through the words that replaced it.
 */
export function mapCursor(oldWords: readonly string[], newWords: readonly string[], cursor: number): number {
  const position = Math.min(Math.max(cursor, 0), oldWords.length)
  let oldStart = 0
  let newStart = 0
  let mapped = 0
  for (const { oldLength, newLength } of segments(oldWords, newWords)) {
    if (oldLength > 0 && position >= oldStart) {
      const share = Math.min(position - oldStart, oldLength) / oldLength
      mapped = newStart + share * newLength
      if (position < oldStart + oldLength) break
    }
    oldStart += oldLength
    newStart += newLength
  }
  return mapped
}

const wordTexts = (tokens: TokenizedScript) => tokens.words.map((word) => word.text)

/** Where each kind of change puts the reader. A first Script starts at the top like a Replace. */
export function placementFor(kind: ChangeKind, before: TokenizedScript, after: TokenizedScript): Placement {
  if (kind === 'replace' || before.words.length === 0) return 'reset'
  if (kind === 'append') return keepPlace
  const oldWords = wordTexts(before)
  const newWords = wordTexts(after)
  return (cursor) => mapCursor(oldWords, newWords, cursor)
}
