import { describe, expect, it } from 'vitest'
import { appendedTail, appendToDraft, draftText, editDraft, isDirty, keepsPlace } from './draft'
import { tokenize } from './script'

const tok = (text: string) => tokenize({ text })
const makeScript = (text: string) => ({ text })

describe('keepsPlace', () => {
  const before = tok('one two three four five')

  it('keeps the place when only words after the position change', () => {
    expect(keepsPlace(before, tok('one two three CHANGED more words'), 3)).toBe(true)
  })

  it('keeps the place when words are appended', () => {
    expect(keepsPlace(before, tok('one two three four five six'), 5)).toBe(true)
  })

  it('resets when a word before the position changes', () => {
    expect(keepsPlace(before, tok('one TWO three four five'), 3)).toBe(false)
  })

  it('resets when the new text is shorter than the position', () => {
    expect(keepsPlace(before, tok('one two'), 3)).toBe(false)
  })

  it('compares only whole words before a fractional position', () => {
    expect(keepsPlace(before, tok('one two X'), 2.9)).toBe(true)
    expect(keepsPlace(before, tok('one X'), 2.9)).toBe(false)
  })

  it('ignores whitespace differences', () => {
    expect(keepsPlace(before, tok('one  two\n\nthree four five'), 4)).toBe(true)
  })

  it('always keeps the place at the top', () => {
    expect(keepsPlace(before, tok('completely different'), 0)).toBe(true)
  })
})

describe('draft', () => {
  const script = makeScript('Hello world')

  it('is clean and shows the Script until edited', () => {
    expect(isDirty(null, script)).toBe(false)
    expect(draftText(null, script)).toBe('Hello world')
  })

  it('is dirty once the text differs from the Script', () => {
    const draft = editDraft('Hello there', script)
    expect(isDirty(draft, script)).toBe(true)
    expect(draftText(draft, script)).toBe('Hello there')
  })

  it('becomes clean again when edited back to the Script', () => {
    expect(isDirty(editDraft('Hello world', script), script)).toBe(false)
  })

  it('goes clean when the Script catches up to the draft', () => {
    const draft = editDraft('Hello there', script)
    expect(isDirty(draft, makeScript('Hello there'))).toBe(false)
  })

  it('a clean draft shows an appended Script', () => {
    const next = makeScript('Hello world\n\nMore')
    expect(draftText(appendToDraft(null, 'More'), next)).toBe('Hello world\n\nMore')
  })

  it('a dirty draft gets the appended text too', () => {
    const draft = appendToDraft(editDraft('My edit', script), 'More')
    expect(draftText(draft, script)).toBe('My edit\n\nMore')
    expect(isDirty(draft, script)).toBe(true)
  })

  it('an empty Script counts as clean with an empty draft', () => {
    expect(isDirty(null, null)).toBe(false)
    expect(isDirty(editDraft('text', null), null)).toBe(true)
  })
})

describe('appendedTail', () => {
  it('returns what Append added after the blank-line join', () => {
    expect(appendedTail('Hello world', 'Hello world\n\nMore')).toBe('More')
    expect(appendedTail('Hello world\n\n', 'Hello world\n\nMore')).toBe('More')
  })

  it('returns the whole text when the Script was empty', () => {
    expect(appendedTail('', 'More')).toBe('More')
  })

  it('returns null when the new text does not extend the old', () => {
    expect(appendedTail('Hello', 'Goodbye')).toBeNull()
  })
})
