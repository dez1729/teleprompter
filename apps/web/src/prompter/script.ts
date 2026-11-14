import type { Script } from '@teleprompter/protocol'
import { spokenBlocks } from './spoken'

export interface Word {
  text: string
  paragraphIndex: number
  lineBreakBefore: boolean
}

export interface TokenizedScript {
  words: readonly Word[]
  paragraphStarts: readonly number[]
  /** Paragraphs shown with a Section marker before them. */
  sectionStarts: readonly number[]
}

/** A paragraph as the Prompter shows it, before it is split into words. */
export interface Block {
  lines: readonly string[]
  /** Comes after a heading or a horizontal rule. */
  sectionStart: boolean
}

export const EMPTY_TOKENS: TokenizedScript = { words: [], paragraphStarts: [], sectionStarts: [] }

const PARAGRAPH_SEPARATOR = /\n[ \t]*\n\s*/

function plainBlocks(text: string): Block[] {
  return text.split(PARAGRAPH_SEPARATOR).map((paragraph) => ({ lines: paragraph.trim().split('\n'), sectionStart: false }))
}

export function tokenize(script: Pick<Script, 'text' | 'format'>, spokenOnly: boolean): TokenizedScript {
  const text = script.text.replace(/\r\n?/g, '\n')
  const blocks = spokenOnly && script.format === 'markdown' ? spokenBlocks(text) : plainBlocks(text)
  const words: Word[] = []
  const paragraphStarts: number[] = []
  const sectionStarts: number[] = []
  let sectionStart = false

  for (const block of blocks) {
    sectionStart ||= block.sectionStart
    const lines = block.lines.map((line) => line.split(/\s+/).filter(Boolean)).filter((line) => line.length > 0)
    if (lines.length === 0) continue
    const paragraphIndex = paragraphStarts.length
    if (sectionStart && paragraphIndex > 0) sectionStarts.push(paragraphIndex)
    sectionStart = false
    paragraphStarts.push(words.length)
    lines.forEach((line, lineIndex) =>
      line.forEach((text, wordIndex) =>
        words.push({ text, paragraphIndex, lineBreakBefore: lineIndex > 0 && wordIndex === 0 }),
      ),
    )
  }
  return { words, paragraphStarts, sectionStarts }
}
