export type ScriptFormat = 'markdown' | 'text'

export interface Script {
  source: string
  format: ScriptFormat
}

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
const MARKDOWN_HINT = /^(#{1,6}\s|\s*[-*+]\s|>\s|```|---\s*$)|\*\*|\[[^\]]+\]\([^)]+\)/m

export function guessFormat(source: string): ScriptFormat {
  return MARKDOWN_HINT.test(source) ? 'markdown' : 'text'
}

export function makeScript(source: string): Script {
  return { source, format: guessFormat(source) }
}

export function appendScript(script: Script, addition: string): Script {
  const source = script.source.trim() === '' ? addition : `${script.source.replace(/\s+$/, '')}\n\n${addition}`
  return { source, format: guessFormat(source) }
}

export function tokenize(script: Script): TokenizedScript {
  const words: Word[] = []
  const paragraphStarts: number[] = []
  const paragraphs = script.source
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
