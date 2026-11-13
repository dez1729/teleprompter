import { describe, expect, it } from 'vitest'
import { commandForKey, helpRows, shortcutFor, tooltipFor } from './keymap'

describe('shortcutFor', () => {
  it('returns the key label for a command', () => {
    expect(shortcutFor({ type: 'toggle' })).toBe('Space')
    expect(shortcutFor({ type: 'stepParagraph', delta: -1 })).toBe('Shift ←')
  })

  it('joins every key bound to the same command', () => {
    expect(shortcutFor({ type: 'nudge', setting: 'fontSize', direction: 1 })).toBe('+ / =')
  })

  it('is null for a command with no binding', () => {
    expect(shortcutFor({ type: 'nudge', setting: 'speedWpm', direction: 1 })).not.toBeNull()
    expect(shortcutFor({ type: 'nudge', setting: 'marginX', direction: 1 })).toBeNull()
  })
})

describe('tooltipFor', () => {
  it('reads "<description> (<key>)"', () => {
    expect(tooltipFor({ type: 'toggle' })).toBe('Play / pause (Space)')
    expect(tooltipFor({ type: 'openSettings' })).toBe('Display settings (,)')
  })
})

describe('helpRows', () => {
  const rows = helpRows().flatMap((g) => g.rows)

  it('renders bindings that share a command as one row', () => {
    expect(rows.filter((r) => r.description === 'Larger text')).toEqual([{ keys: '+ / =', description: 'Larger text' }])
  })

  it('lists every group and omits hidden bindings', () => {
    expect(helpRows().map((g) => g.group)).toEqual(['Playback', 'Navigation', 'Display', 'Panels'])
    expect(rows.some((r) => r.description === 'Follow')).toBe(false)
  })
})

describe('commandForKey', () => {
  it('matches ? only with Shift held', () => {
    expect(commandForKey({ key: '?', shiftKey: true })).toEqual({ type: 'toggleHelp' })
    expect(commandForKey({ key: '?', shiftKey: false })).toBeNull()
  })

  it('opens settings and the Editor', () => {
    expect(commandForKey({ key: ',', shiftKey: false })).toEqual({ type: 'openSettings' })
    expect(commandForKey({ key: 'P', shiftKey: true })).toEqual({ type: 'openEditor' })
  })
})
