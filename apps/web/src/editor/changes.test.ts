import { Text } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { changesBetween, rebaseRemote } from './changes'

const apply = (text: string, changes: ReturnType<typeof changesBetween>) => changes.apply(Text.of(text.split('\n'))).toString()

describe('changesBetween', () => {
  it.each([
    ['', ''],
    ['', 'hello world'],
    ['hello world', ''],
    ['one two three', 'one two three'],
    ['one two three', 'one TWO three'],
    ['one two three', 'zero one two three four'],
    ['first line\nsecond line\n\nthird', 'first line\n\nthird\nsecond line'],
    ['a b c d e f', 'f e d c b a'],
    ['naïve 👋 café', 'naïve 👋🏽 cafés'],
  ])('turns %j into %j', (from, to) => {
    expect(apply(from, changesBetween(from, to))).toBe(to)
  })

  it('leaves untouched text alone, so a selection elsewhere does not move', () => {
    const from = 'one two three four five six'
    const changes = changesBetween(from, 'one TWO three four FIVE six')
    let ranges = 0
    changes.iterChangedRanges(() => ranges++)
    expect(ranges).toBe(2)
    expect(changes.mapPos(from.indexOf('four'))).toBe(from.indexOf('four'))
  })

  it('swaps the middle whole when the texts are unrelated', () => {
    const from = `start ${Array.from({ length: 2000 }, (_, i) => `a${i}`).join(' ')} end`
    const to = `start ${Array.from({ length: 2000 }, (_, i) => `b${i}`).join(' ')} end`
    expect(apply(from, changesBetween(from, to))).toBe(to)
  })
})

describe('rebaseRemote', () => {
  const merged = (base: string, local: string, remote: string) => apply(local, rebaseRemote(base, local, remote))

  it('is the plain remote change when nothing is unsent', () => {
    expect(merged('one two', 'one two', 'one two\n\nthree')).toBe('one two\n\nthree')
  })

  it('keeps unsent typing when a Push appends', () => {
    expect(merged('one two', 'one NEW two', 'one two\n\nthree')).toBe('one NEW two\n\nthree')
  })

  it('puts an Append after words being typed at the end', () => {
    expect(merged('one two', 'one two and', 'one two\n\nthree')).toBe('one two and\n\nthree')
  })

  it('keeps unsent typing when another window edits elsewhere', () => {
    expect(merged('alpha bravo charlie delta', 'alpha bravo charlie delta echo', 'ALPHA bravo charlie delta')).toBe(
      'ALPHA bravo charlie delta echo',
    )
  })

  it('keeps unsent typing when a Push replaces the whole text', () => {
    for (const local of ['old text here typed', 'typed old text here']) {
      const result = merged('old text here', local, 'completely different')
      expect(result).toContain('completely different')
      expect(result).toContain('typed')
      expect(result).not.toContain('old')
    }
  })

  it('keeps both insertions when both sides insert at the same place', () => {
    const result = merged('one two', 'one LOCAL two', 'one REMOTE two')
    expect(result).toContain('LOCAL')
    expect(result).toContain('REMOTE')
  })

  it('agrees with rebasing the unsent edits over the remote change instead', () => {
    const base = 'alpha bravo charlie delta'
    const local = 'alpha bravo typed charlie'
    const remote = 'zero alpha bravo charlie delta echo'
    const unsentOverRemote = changesBetween(base, local).map(changesBetween(base, remote), true)
    expect(apply(remote, unsentOverRemote)).toBe(merged(base, local, remote))
  })
})
