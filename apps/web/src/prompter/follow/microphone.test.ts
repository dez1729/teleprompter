import { describe, expect, it } from 'vitest'
import { resample, wav } from './microphone'

describe('resample', () => {
  it('averages each span of input samples into one output sample', () => {
    const samples = new Float32Array([0, 0.3, 0.6, 1, 1, 1])
    expect([...resample(samples, 48000, 16000)].map((s) => Number(s.toFixed(3)))).toEqual([0.3, 1])
  })

  it('returns the samples unchanged at the same rate', () => {
    const samples = new Float32Array([0.1, 0.2])
    expect(resample(samples, 16000, 16000)).toBe(samples)
  })
})

describe('wav', () => {
  it('writes 16-bit mono PCM after a 44-byte header', async () => {
    const bytes = new DataView(await wav(new Float32Array([0, 1, -1]), 16000).arrayBuffer())
    expect(bytes.byteLength).toBe(44 + 3 * 2)
    expect(bytes.getUint32(24, true)).toBe(16000)
    expect([bytes.getInt16(44, true), bytes.getInt16(46, true), bytes.getInt16(48, true)]).toEqual([0, 0x7fff, -0x7fff])
  })
})
