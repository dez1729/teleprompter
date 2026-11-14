import { describe, expect, it } from 'vitest'
import { cursorToY, lineIndexOf, pacedLines, readingOffset, yToCursor, type Layout } from './layout'

describe('readingOffset', () => {
  it('keeps the line being read inside the Reading window from start to finish', () => {
    for (const lines of [1, 2, 3, 4, 5, 10]) {
      const offset = readingOffset(lines, 50)
      expect(offset).toBeGreaterThanOrEqual(0)
      if (lines >= 2) expect(offset + 50).toBeLessThanOrEqual(lines * 50)
    }
  })

  it('starts a 3-line window on the middle row', () => {
    expect(readingOffset(3, 50)).toBe(50)
  })
})

const layout: Layout = {
  lines: [
    { top: 0, height: 50, firstWord: 0, endWord: 4 },
    { top: 50, height: 50, firstWord: 4, endWord: 6 },
    { top: 130, height: 50, firstWord: 6, endWord: 10 },
  ],
  gapPace: 3,
}

describe('layout', () => {
  it('puts a line start at that line top', () => {
    expect(cursorToY(layout, 0)).toBe(0)
    expect(cursorToY(layout, 4)).toBe(50)
    expect(cursorToY(layout, 6)).toBe(130)
  })

  it('moves smoothly within a line', () => {
    expect(cursorToY(layout, 2)).toBe(25)
  })

  it('crosses the gap below a line faster than the line itself', () => {
    // Line 1 is a 50 px row over a 30 px gap: the row takes 50 parts of its progress, the gap 30 / layout.gapPace.
    const rowEnd = 4 + 2 * (50 / (50 + 30 / layout.gapPace))
    expect(cursorToY(layout, rowEnd)).toBeCloseTo(100)
    const rowPace = 50 / (rowEnd - 4)
    const gapPace = 30 / (6 - rowEnd)
    expect(gapPace / rowPace).toBeCloseTo(layout.gapPace)
  })

  it('round-trips between cursor and y', () => {
    for (const cursor of [0, 0.5, 1.25, 3.9, 4, 5.5, 6, 8.2, 9.9]) {
      expect(yToCursor(layout, cursorToY(layout, cursor))).toBeCloseTo(cursor, 9)
    }
  })

  it('clamps y outside the text', () => {
    expect(yToCursor(layout, -40)).toBe(0)
    expect(yToCursor(layout, 9999)).toBe(10)
  })

  it('finds the line containing a cursor', () => {
    expect(lineIndexOf(layout, 0)).toBe(0)
    expect(lineIndexOf(layout, 3.99)).toBe(0)
    expect(lineIndexOf(layout, 4)).toBe(1)
    expect(lineIndexOf(layout, 100)).toBe(2)
  })

  it('handles an empty layout', () => {
    expect(lineIndexOf({ lines: [], gapPace: 3 }, 3)).toBe(-1)
    expect(cursorToY({ lines: [], gapPace: 3 }, 3)).toBe(0)
    expect(yToCursor({ lines: [], gapPace: 3 }, 30)).toBe(0)
  })
})

describe('pacedLines', () => {
  it('gives a line extra time for the gap below it, and not the last line', () => {
    const paragraphs: Layout = {
      lines: [
        { top: 0, height: 50, firstWord: 0, endWord: 4 },
        { top: 50, height: 50, firstWord: 4, endWord: 8 },
        { top: 125, height: 50, firstWord: 8, endWord: 10 },
      ],
      gapPace: 3,
    }
    expect(pacedLines(paragraphs)).toEqual([
      { start: 0, stretch: 1 },
      { start: 4, stretch: 1 + 0.5 / 3 },
      { start: 8, stretch: 1 },
    ])
  })
})
