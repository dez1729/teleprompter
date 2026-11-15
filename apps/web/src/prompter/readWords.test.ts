import { describe, expect, it } from 'vitest'
import { readCount } from './readWords'

describe('readCount', () => {
  it('counts the words wholly before the cursor', () => {
    expect(readCount(0, 10)).toBe(0)
    expect(readCount(3.9, 10)).toBe(3)
    expect(readCount(4, 10)).toBe(4)
  })

  it('stays within the Script', () => {
    expect(readCount(12, 10)).toBe(10)
    expect(readCount(-1, 10)).toBe(0)
  })
})
