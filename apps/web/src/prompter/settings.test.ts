import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, SETTING_DEFS, nudgeSetting, parseSettings } from './settings'
import { commandForKey } from './keymap'
import { appendScript, guessFormat, tokenize } from './script'

describe('settings', () => {
  it('uses defaults for missing or malformed input', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings({ fontSize: 'big', textColor: 'red', mirror: 1, fontFamily: 'comic' })).toEqual(
      DEFAULT_SETTINGS,
    )
  })

  it('clamps numbers into range and keeps valid values', () => {
    const parsed = parseSettings({
      speedWpm: 9999,
      fontSize: -4,
      mirror: true,
      textColor: '#abcdef',
      windowHeightLines: 5,
    })
    expect(parsed.speedWpm).toBe(SETTING_DEFS.speedWpm.max)
    expect(parsed.fontSize).toBe(SETTING_DEFS.fontSize.min)
    expect(parsed.mirror).toBe(true)
    expect(parsed.textColor).toBe('#abcdef')
    expect(parsed.windowHeightLines).toBe(5)
  })

  it('nudges by the field step and stops at the range ends', () => {
    expect(nudgeSetting(DEFAULT_SETTINGS, 'speedWpm', 1).speedWpm).toBe(145)
    const max = { ...DEFAULT_SETTINGS, speedWpm: SETTING_DEFS.speedWpm.max }
    expect(nudgeSetting(max, 'speedWpm', 1).speedWpm).toBe(SETTING_DEFS.speedWpm.max)
  })
})

describe('keymap', () => {
  it('distinguishes line and paragraph steps by Shift', () => {
    expect(commandForKey({ key: 'ArrowLeft', shiftKey: false })).toEqual({ type: 'stepLine', delta: -1 })
    expect(commandForKey({ key: 'ArrowRight', shiftKey: true })).toEqual({ type: 'stepParagraph', delta: 1 })
  })

  it('ignores unbound keys', () => {
    expect(commandForKey({ key: 'q', shiftKey: false })).toBeNull()
  })
})

describe('script', () => {
  it('splits paragraphs on blank lines and keeps single newlines as breaks', () => {
    const { words, paragraphStarts } = tokenize({ source: 'one two\nthree\n\n\nfour', format: 'text' })
    expect(words.map((w) => w.text)).toEqual(['one', 'two', 'three', 'four'])
    expect(words.map((w) => w.lineBreakBefore)).toEqual([false, false, true, false])
    expect(paragraphStarts).toEqual([0, 3])
    expect(words[3]!.paragraphIndex).toBe(1)
  })

  it('appends after a blank line', () => {
    expect(appendScript({ source: 'a b', format: 'text' }, 'c').source).toBe('a b\n\nc')
    expect(appendScript({ source: '', format: 'text' }, 'c').source).toBe('c')
  })

  it('guesses markdown', () => {
    expect(guessFormat('# Title\n\nbody')).toBe('markdown')
    expect(guessFormat('just some plain words.')).toBe('text')
  })
})
