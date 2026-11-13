import { describe, expect, it } from 'vitest'
import { appendText, guessFormat, PushRequestSchema } from './index.ts'

describe('appendText', () => {
  it('joins with a blank line and drops trailing whitespace', () => {
    expect(appendText('a b\n\n', 'c')).toBe('a b\n\nc')
  })
  it('does not lead with a blank line when the Script is empty', () => {
    expect(appendText('  \n', 'c')).toBe('c')
  })
})

describe('guessFormat', () => {
  it('detects markdown headings and plain text', () => {
    expect(guessFormat('# Title\nbody')).toBe('markdown')
    expect(guessFormat('just words')).toBe('text')
  })
})

describe('PushRequestSchema', () => {
  it('rejects blank text, unknown kinds and unknown keys', () => {
    expect(PushRequestSchema.safeParse({ kind: 'replace', text: '  ' }).success).toBe(false)
    expect(PushRequestSchema.safeParse({ kind: 'nope', text: 'a' }).success).toBe(false)
    expect(PushRequestSchema.safeParse({ kind: 'replace', text: 'a', extra: 1 }).success).toBe(false)
  })
  it('accepts empty text only for an Edit', () => {
    expect(PushRequestSchema.safeParse({ kind: 'edit', text: '' }).success).toBe(true)
    expect(PushRequestSchema.safeParse({ kind: 'append', text: '' }).success).toBe(false)
  })
  it('accepts a minimal request', () => {
    expect(PushRequestSchema.safeParse({ kind: 'append', text: 'a' }).success).toBe(true)
  })
})
