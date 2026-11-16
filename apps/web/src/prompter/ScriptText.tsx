import { Fragment, forwardRef, memo, type CSSProperties } from 'react'
import type { TokenizedScript } from './script'

interface Props {
  tokens: TokenizedScript
  style: CSSProperties
}

/** Memoized so per-frame cursor updates never re-render the words. */
export const ScriptText = memo(
  forwardRef<HTMLDivElement, Props>(function ScriptText({ tokens, style }, ref) {
    const paragraphs: { key: number; sectionBefore: boolean; words: { index: number; text: string; lineBreakBefore: boolean }[] }[] = []
    tokens.words.forEach((word, index) => {
      if (paragraphs.length === 0 || paragraphs[paragraphs.length - 1]!.key !== word.paragraphIndex) {
        paragraphs.push({ key: word.paragraphIndex, sectionBefore: word.sectionBefore, words: [] })
      }
      paragraphs[paragraphs.length - 1]!.words.push({ index, text: word.text, lineBreakBefore: word.lineBreakBefore })
    })
    return (
      <div ref={ref} style={style}>
        {paragraphs.map((paragraph) => (
          <Fragment key={paragraph.key}>
            {paragraph.sectionBefore && <hr style={{ margin: '0 0 1em', border: 0, borderTop: '1px solid currentColor', opacity: 0.25 }} />}
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
