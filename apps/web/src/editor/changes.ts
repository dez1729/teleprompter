import { ChangeSet, type ChangeSpec } from '@codemirror/state'
import { diffArrays } from 'diff'

/** Past this many changed words the middle of the text is swapped as one piece. */
const MAX_EDIT_WORDS = 500

/** CodeMirror keeps every line break as "\n", so texts are compared in that form. */
export const normalizeLineBreaks = (text: string) => text.replace(/\r\n?/g, '\n')

/**
 * Each word with the whitespace after it. Whitespace on its own would match all over two
 * unrelated texts and splice them together word by word.
 */
const pieces = (text: string) => text.match(/\S+\s*|\s+/g) ?? []

/** The changes that turn `from` into `to`, as fine-grained as a word-level diff allows. */
export function changesBetween(from: string, to: string): ChangeSet {
  const shortest = Math.min(from.length, to.length)
  let prefix = 0
  while (prefix < shortest && from[prefix] === to[prefix]) prefix++
  let suffix = 0
  while (suffix < shortest - prefix && from[from.length - 1 - suffix] === to[to.length - 1 - suffix]) suffix++

  const fromMiddle = from.slice(prefix, from.length - suffix)
  const toMiddle = to.slice(prefix, to.length - suffix)
  // A plain insertion or deletion needs no diff.
  const parts =
    fromMiddle === '' || toMiddle === ''
      ? undefined
      : diffArrays(pieces(fromMiddle), pieces(toMiddle), { maxEditLength: MAX_EDIT_WORDS })
  if (!parts) return ChangeSet.of({ from: prefix, to: prefix + fromMiddle.length, insert: toMiddle }, from.length)

  const specs: ChangeSpec[] = []
  let position = prefix
  for (const part of parts) {
    const text = part.value.join('')
    if (part.added) specs.push({ from: position, insert: text })
    else {
      if (part.removed) specs.push({ from: position, to: position + text.length })
      position += text.length
    }
  }
  return ChangeSet.of(specs, from.length)
}

/**
 * A change that arrived from the server, rebased over edits the server has not seen.
 * `base` is the last text the Editor and server agreed on, `local` is the Editor's
 * document, and `remote` is the server's new text. The result applies to `local`.
 */
export function rebaseRemote(base: string, local: string, remote: string): ChangeSet {
  return changesBetween(base, remote).map(changesBetween(base, local))
}
