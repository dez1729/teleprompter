import { describe, expect, it } from 'vitest'
import { cursorToY, lineIndexOf, yToCursor, type Layout } from './layout'

const layout: Layout = {
  lines: [
    { top: 0, height: 50, firstWord: 0, endWord: 4 },
    { top: 50, height: 50, firstWord: 4, endWord: 6 },
    { top: 130, height: 50, firstWord: 6, endWord: 10 },
  ],
}

describe('layout', () => {
  it('puts a line start at that line top', () => {
    expect(cursorToY(layout, 0)).toBe(0)
    expect(cursorToY(layout, 4)).toBe(50)
    expect(cursorToY(layout, 6)).toBe(130)
  })

  it('moves smoothly within a line, through paragraph gaps', () => {
    expect(cursorToY(layout, 2)).toBe(25)
    expect(cursorToY(layout, 5)).toBe(90)
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
    expect(lineIndexOf({ lines: [] }, 3)).toBe(-1)
    expect(cursorToY({ lines: [] }, 3)).toBe(0)
    expect(yToCursor({ lines: [] }, 30)).toBe(0)
  })
})
