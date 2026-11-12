export interface Line {
  top: number
  height: number
  firstWord: number
  endWord: number
}

export interface Layout {
  lines: readonly Line[]
}

export const EMPTY_LAYOUT: Layout = { lines: [] }

export function lineIndexOf(layout: Layout, cursor: number): number {
  const { lines } = layout
  if (lines.length === 0) return -1
  let lo = 0
  let hi = lines.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (lines[mid]!.firstWord <= cursor) lo = mid
    else hi = mid - 1
  }
  return lo
}

function lineSpan(layout: Layout, index: number): number {
  const line = layout.lines[index]!
  const next = layout.lines[index + 1]
  return next ? next.top - line.top : line.height
}

export function cursorToY(layout: Layout, cursor: number): number {
  const index = lineIndexOf(layout, cursor)
  if (index < 0) return 0
  const line = layout.lines[index]!
  const wordsInLine = line.endWord - line.firstWord
  const fraction = Math.min(1, Math.max(0, (cursor - line.firstWord) / wordsInLine))
  return line.top + fraction * lineSpan(layout, index)
}

export function yToCursor(layout: Layout, y: number): number {
  const { lines } = layout
  if (lines.length === 0) return 0
  const first = lines[0]!
  if (y <= first.top) return first.firstWord
  let lo = 0
  let hi = lines.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (lines[mid]!.top <= y) lo = mid
    else hi = mid - 1
  }
  const line = lines[lo]!
  const fraction = Math.min(1, (y - line.top) / lineSpan(layout, lo))
  return line.firstWord + fraction * (line.endWord - line.firstWord)
}

/** Groups word spans (marked with data-word) by rendered row. Positions are relative to the container. */
export function measureLayout(container: HTMLElement): Layout {
  const spans = container.querySelectorAll<HTMLElement>('[data-word]')
  const lines: Line[] = []
  spans.forEach((span, word) => {
    const rowTop = span.offsetTop
    const current = lines[lines.length - 1]
    const lineHeight = parseFloat(getComputedStyle(span).lineHeight) || span.offsetHeight
    if (current && Math.abs(current.top - (rowTop - (lineHeight - span.offsetHeight) / 2)) < 1) {
      current.endWord = word + 1
      return
    }
    lines.push({
      top: rowTop - (lineHeight - span.offsetHeight) / 2,
      height: lineHeight,
      firstWord: word,
      endWord: word + 1,
    })
  })
  return { lines }
}
