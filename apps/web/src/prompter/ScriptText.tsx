import { Fragment, forwardRef, memo, type CSSProperties } from 'react'
import type { TokenizedScript } from './script'

/** Short, so it never reads as one of the Reading window's edge lines. */
const SECTION_MARKER: CSSProperties = { width: '3em', border: 0, borderTop: '0.08em solid currentColor', opacity: 0.35, margin: '0 0 1em' }

interface Props {
  tokens: TokenizedScript
  style: CSSProperties
}

/** Memoized so per-frame cursor updates never re-render the words. */
export const ScriptText = memo(
  forwardRef<HTMLDivElement, Props>(function ScriptText({ tokens, style }, ref) {
    const paragraphs: { key: number; words: { index: number; text: string; lineBreakBefore: boolean }[] }[] = []
    tokens.words.forEach((word, index) => {
      if (paragraphs.length === 0 || paragraphs[paragraphs.length - 1]!.key !== word.paragraphIndex) {
        paragraphs.push({ key: word.paragraphIndex, words: [] })
      }
      paragraphs[paragraphs.length - 1]!.words.push({ index, text: word.text, lineBreakBefore: word.lineBreakBefore })
    })
    const sectionStarts = new Set(tokens.sectionStarts)
    return (
      <div ref={ref} style={style}>
        {paragraphs.map((paragraph) => (
          <Fragment key={paragraph.key}>
            {sectionStarts.has(paragraph.key) && <hr data-section-marker style={SECTION_MARKER} />}
            <p style={{ margin: '0 0 1em' }}>
            {paragraph.words.map((word, position) => (
              <Fragment key={word.index}>
                {word.lineBreakBefore ? <br /> : position > 0 ? ' ' : null}
                <span data-word={word.index}>{word.text}</span>
              </Fragment>
            ))}
            </p>
          </Fragment>
        ))}
      </div>
    )
  }),
)
