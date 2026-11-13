import { describe, expect, it } from 'vitest'
import { relativeTime } from './relativeTime'

describe('relativeTime', () => {
  const now = Date.parse('2026-03-10T12:00:00Z')
  const ago = (ms: number) => relativeTime(new Date(now - ms).toISOString(), now)

  it('names recent times by how long ago they were', () => {
    expect(ago(0)).toBe('just now')
    expect(ago(59_000)).toBe('just now')
    expect(ago(60_000)).toBe('1 min ago')
    expect(ago(59 * 60_000)).toBe('59 min ago')
    expect(ago(60 * 60_000)).toBe('1 h ago')
    expect(ago(23 * 60 * 60_000)).toBe('23 h ago')
  })

  it('names older times by their date', () => {
    expect(ago(3 * 24 * 60 * 60_000)).toMatch(/7/)
  })
})
