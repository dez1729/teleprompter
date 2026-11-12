import type { Script } from '@teleprompter/protocol'

export interface Word {
  text: string
  paragraphIndex: number
  lineBreakBefore: boolean
}

export interface TokenizedScript {
  words: readonly Word[]
  paragraphStarts: readonly number[]
}

const PARAGRAPH_SEPARATOR = /\n[ \t]*\n\s*/
export function tokenize(script: Pick<Script, 'text'>): TokenizedScript {
  const words: Word[] = []
  const paragraphStarts: number[] = []
  const paragraphs = script.text
    .replace(/\r\n?/g, '\n')
    .split(PARAGRAPH_SEPARATOR)
    .filter((p) => p.trim() !== '')

  paragraphs.forEach((paragraph) => {
    const paragraphIndex = paragraphStarts.length
    paragraphStarts.push(words.length)
    paragraph
      .trim()
      .split('\n')
      .forEach((line, lineIndex) => {
        line
          .split(/\s+/)
          .filter(Boolean)
          .forEach((text, wordIndex) => {
            words.push({ text, paragraphIndex, lineBreakBefore: lineIndex > 0 && wordIndex === 0 })
          })
      })
  })
  return { words, paragraphStarts }
}
