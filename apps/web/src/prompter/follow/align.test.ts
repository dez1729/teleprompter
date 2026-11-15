import { describe, expect, it } from 'vitest'
import { align, heardWords, LOOKAHEAD } from './align'

const script = heardWords(
  'I think they would start with delivery. I proposed rebuilding our encounter system, the screen doctors chart in, ' +
    'and the whole product depended on it. It cut visit turnaround by 20%, helped us keep two clinics, and signed us a new one.',
)
const at = (phrase: string) => {
  const words = heardWords(phrase)
  for (let i = 0; i + words.length <= script.length; i++) {
    if (words.every((word, k) => script.at(i + k) === word)) return i + words.length
  }

  throw new Error(`"${phrase}" is not in the Script`)
}

describe('align', () => {
  it('puts the reader just past the last word they said', () => {
    expect(align(script, heardWords('I think they would start with'), 0)).toBe(at('would start with'))
  })

  it('ignores case and punctuation', () => {
    expect(align(script, heardWords('Start with Delivery. I proposed'), 0)).toBe(at('delivery. I proposed'))
  })

  it('matches through a misheard or cut-off word', () => {
    expect(align(script, heardWords('rebuilding our encounter sistem the screen'), 10)).toBe(at('system, the screen'))
    expect(align(script, heardWords('ng our encounter system'), 10)).toBe(at('encounter system'))
  })

  it('follows a reader who skips a few words', () => {
    expect(align(script, heardWords('the whole product depended on it it cut visit'), 20)).toBe(at('It cut visit'))
  })

  it('moves for two words just after the reader, but not two words farther on', () => {
    const before = at('I proposed rebuilding')
    expect(align(script, heardWords('our encounter'), before)).toBe(before + 2)
    expect(align(script, heardWords('the whole'), before)).toBeNull()
  })

  it('does not move for one common word', () => {
    expect(align(script, heardWords('the'), 0)).toBeNull()
    expect(align(script, heardWords('um so yeah'), 0)).toBeNull()
  })

  it('finds a line the reader went back to', () => {
    const later = at('turnaround by 20%')
    expect(align(script, heardWords('the whole product depended'), later)).toBe(at('the whole product depended'))
  })

  it('finds a reader beyond the Lookahead window only on a long run of words', () => {
    const long = [...Array.from({ length: LOOKAHEAD + 10 }, (_, i) => `filler${i}`), ...heardWords('the closing words of the whole talk')]
    expect(align(long, heardWords('the closing words'), 0)).toBeNull()
    expect(align(long, heardWords('the closing words of the whole talk'), 0)).toBe(long.length)
  })

  it('prefers a near match to an equally good one far away', () => {
    const twice = [...heardWords('one two three four five six'), ...Array.from({ length: LOOKAHEAD + 10 }, (_, i) => `filler${i}`), ...heardWords('one two three four five six')]
    expect(align(twice, heardWords('one two three four five six'), 0)).toBe(6)
  })

  it('prefers the repeat nearest the reader', () => {
    const repeated = heardWords('thank you all for coming. one more thing. thank you all for coming.')
    expect(align(repeated, heardWords('thank you all for coming'), 0)).toBe(5)
    expect(align(repeated, heardWords('thank you all for coming'), 9)).toBe(repeated.length)
  })
})
