import type { Script } from '@teleprompter/protocol'
import { spokenBlocks } from './spokenOnly'

export interface Word {
  text: string
  paragraphIndex: number
  lineBreakBefore: boolean
  /** First word of a paragraph that follows a Section marker. */
  sectionBefore: boolean
}

export interface TokenizedScript {
  words: readonly Word[]
  paragraphStarts: readonly number[]
}

/** What the Prompter displays: runs of lines to speak, and Section markers between them. */
export type Block = { kind: 'paragraph'; lines: string[] } | { kind: 'section' }

const PARAGRAPH_SEPARATOR = /\n[ \t]*\n\s*/

export function textBlocks(text: string): Block[] {
  return text
    .replace(/\r\n?/g, '\n')
    .split(PARAGRAPH_SEPARATOR)
    .filter((p) => p.trim() !== '')
    .map((paragraph) => ({ kind: 'paragraph', lines: paragraph.trim().split('\n') }))
}

export function tokenize(blocks: readonly Block[]): TokenizedScript {
  const words: Word[] = []
  const paragraphStarts: number[] = []
  let sectionPending = false

  for (const block of blocks) {
    if (block.kind === 'section') {
      sectionPending = true
      continue
    }
    const lines = block.lines.map((line) => line.split(/\s+/).filter(Boolean)).filter((line) => line.length > 0)
    if (lines.length === 0) continue
    const paragraphIndex = paragraphStarts.length
    paragraphStarts.push(words.length)
    lines.forEach((line, lineIndex) => {
      line.forEach((text, wordIndex) => {
        words.push({
          text,
          paragraphIndex,
          lineBreakBefore: lineIndex > 0 && wordIndex === 0,
          sectionBefore: sectionPending && lineIndex === 0 && wordIndex === 0,
        })
      })
    })
    sectionPending = false
  }
  return { words, paragraphStarts }
}

export function project(script: Pick<Script, 'text' | 'format'>, options: { spokenOnly: boolean }): TokenizedScript {
  const spoken = options.spokenOnly && script.format === 'markdown'
  return tokenize(spoken ? spokenBlocks(script.text) : textBlocks(script.text))
}
