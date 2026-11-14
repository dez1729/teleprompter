import { describe, expect, it } from 'vitest'
import { mapCursor, placementFor } from './anchor'
import { tokenize } from './script'

const words = (text: string) => text.split(/\s+/).filter(Boolean)
const map = (before: string, after: string, cursor: number) => mapCursor(words(before), words(after), cursor)

describe('placementFor', () => {
  const tok = (text: string) => tokenize({ text })
  const before = tok('one two three four')

  it('resets on a Replace and on a first Script', () => {
    expect(placementFor('replace', before, tok('one two three four'))).toBe('reset')
    expect(placementFor('edit', tok(''), before)).toBe('reset')
    expect(placementFor('append', tok(''), before)).toBe('reset')
  })

  it('keeps the position on an Append', () => {
    const place = placementFor('append', before, tok('one two three four\n\nfive'))
    expect(place).not.toBe('reset')
    expect((place as (cursor: number) => number)(2.5)).toBe(2.5)
  })

  it('anchors to the same words on an Edit', () => {
    const place = placementFor('edit', before, tok('zero\n\none two three four'))
    expect((place as (cursor: number) => number)(2.5)).toBe(3.5)
  })
})

describe('mapCursor', () => {
  const before = 'one two three four five six'

  it('stays put when nothing changes', () => {
    expect(map(before, before, 3.25)).toBe(3.25)
  })

  it('moves with its word when words are inserted before it', () => {
    expect(map(before, `zero and ${before}`, 3)).toBe(5)
    expect(map(before, 'one two NEW three four five six', 2)).toBe(3)
  })

  it('stays put when words are inserted after it', () => {
    expect(map(before, 'one two three four NEW five six', 2)).toBe(2)
    expect(map(before, `${before} seven eight`, 3.5)).toBe(3.5)
  })

  it('moves back with its word when earlier words are deleted', () => {
    expect(map(before, 'three four five six', 3)).toBe(1)
  })

  it('keeps the fractional offset into a surviving word', () => {
    expect(map(before, 'zero one two three four five six', 3.4)).toBeCloseTo(4.4)
    expect(map(before, 'two three four five six', 3.75)).toBeCloseTo(2.75)
  })

  it('snaps to the next surviving word when its word is deleted', () => {
    expect(map(before, 'one two five six', 2.6)).toBe(2)
    expect(map(before, 'one two five six', 3.2)).toBe(2)
  })

  it('snaps to the end when its word and everything after it is deleted', () => {
    expect(map(before, 'one two', 4.5)).toBe(2)
  })

  it('stays on a word that was reworded in place', () => {
    expect(map(before, 'one two THREE four five six', 2.5)).toBe(2.5)
  })

  it('lands the same share of the way through a rewritten span', () => {
    // "two three four five" became two words; the reader was halfway through the span.
    expect(map(before, 'one A B six', 3)).toBe(2)
    expect(map(before, 'one A B C D E F G H six', 3)).toBe(5)
  })

  it('follows its paragraph when the paragraph before it moves after it', () => {
    const a = 'alpha bravo charlie delta echo'
    const b = 'one two three'
    expect(map(`${a} ${b}`, `${b} ${a}`, 2.5)).toBe(5.5)
  })

  it('goes to the next surviving word when its short paragraph moves away', () => {
    const a = 'alpha bravo charlie delta echo'
    const b = 'one two three'
    // The longer paragraph is the common part, so the moved one counts as deleted here.
    expect(map(`${b} ${a}`, `${a} ${b}`, 1.5)).toBe(0)
  })

  it('keeps the end at the end of what was there, ahead of appended words', () => {
    expect(map(before, `${before} seven eight`, 6)).toBe(6)
    expect(map(before, 'one two three four five', 6)).toBe(5)
  })

  it('returns 0 for an empty old or new text', () => {
    expect(map('', before, 0)).toBe(0)
    expect(map(before, '', 4.2)).toBe(0)
    expect(map('', '', 0)).toBe(0)
  })

  it('clamps a cursor outside the old text', () => {
    expect(map(before, before, -3)).toBe(0)
    expect(map(before, before, 99)).toBe(6)
  })

  describe('on a 5,000-word Script', () => {
    const big = Array.from({ length: 5000 }, (_, i) => `w${i % 700}x${i % 13}`)
    const timed = (run: () => number) => {
      run()
      const start = performance.now()
      const result = run()
      return { result, ms: performance.now() - start }
    }

    it('maps through scattered edits in well under a frame', () => {
      const edited = [...big]
      edited.splice(4500, 3)
      edited.splice(2500, 1, 'changed')
      edited.splice(10, 0, 'new', 'words')
      const { result, ms } = timed(() => mapCursor(big, edited, 3000.5))
      expect(result).toBe(3002.5)
      expect(ms).toBeLessThan(8)
    })

    it('gives up on an unrelated text quickly and maps by share', () => {
      const other = Array.from({ length: 2500 }, (_, i) => `other${i}`)
      const { result, ms } = timed(() => mapCursor(big, other, 2500))
      expect(result).toBe(1250)
      expect(ms).toBeLessThan(16)
    })
  })
})
