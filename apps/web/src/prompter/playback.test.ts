import { describe, expect, it } from 'vitest'
import { initialPlayback, keepPlace, needsTick, playbackReducer, type PlaybackEvent, type PlaybackState } from './playback'

const run = (state: PlaybackState, ...events: PlaybackEvent[]) => events.reduce(playbackReducer, state)

const loaded = run(
  initialPlayback,
  { type: 'SET_SCRIPT', wordCount: 100, paragraphStarts: [0, 40, 70], place: 'reset' },
  { type: 'SET_LAYOUT', lineStarts: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90] },
)

describe('minimum time per line', () => {
  const short = run(
    initialPlayback,
    { type: 'SET_SCRIPT', wordCount: 22, paragraphStarts: [0], place: 'reset' },
    { type: 'SET_LAYOUT', lineStarts: [0, 10, 12] },
    { type: 'PLAY', countdownSec: 0, countdownAtStartOnly: false },
  )
  const tickFor = (state: PlaybackState, ms: number) => {
    for (let t = 0; t < ms; t += 10) state = run(state, { type: 'TICK', dtMs: 10, wpm: 300, minLineMs: 1500 })
    return state
  }

  it('reads a full line at Speed', () => {
    expect(tickFor(short, 2000).cursor).toBeCloseTo(10, 0)
  })

  it('holds a two-word line up for the minimum time', () => {
    const atShort = tickFor(short, 2000)
    expect(tickFor(atShort, 1400).cursor).toBeLessThan(12)
    expect(tickFor(atShort, 1600).cursor).toBeGreaterThan(12)
  })

  it('reads at Speed when the minimum is 0', () => {
    const state = run(short, { type: 'TICK', dtMs: 1000, wpm: 300, minLineMs: 0 })
    expect(state.cursor).toBeCloseTo(5)
  })
})

describe('playback', () => {
  it('starts paused at the top', () => {
    expect(loaded.mode.kind).toBe('paused')
    expect(loaded.cursor).toBe(0)
    expect(needsTick(loaded)).toBe(false)
  })

  it('counts down before playing, then advances by wpm', () => {
    let state = run(loaded, { type: 'PLAY', countdownSec: 3, countdownAtStartOnly: false })
    expect(state.mode).toEqual({ kind: 'countdown', remainingMs: 3000 })
    state = run(state, { type: 'TICK', dtMs: 2000, wpm: 120 })
    expect(state.mode).toEqual({ kind: 'countdown', remainingMs: 1000 })
    expect(state.cursor).toBe(0)
    state = run(state, { type: 'TICK', dtMs: 1000, wpm: 120 })
    expect(state.mode.kind).toBe('playing')
    state = run(state, { type: 'TICK', dtMs: 30000, wpm: 120 })
    expect(state.cursor).toBeCloseTo(60)
  })

  it('plays immediately when the countdown is 0', () => {
    expect(run(loaded, { type: 'PLAY', countdownSec: 0, countdownAtStartOnly: false }).mode.kind).toBe('playing')
  })

  it('toggles between playing and paused, keeping the cursor', () => {
    let state = run(loaded, { type: 'TOGGLE', countdownSec: 0, countdownAtStartOnly: false }, { type: 'TICK', dtMs: 6000, wpm: 100 })
    expect(state.cursor).toBeCloseTo(10)
    state = run(state, { type: 'TOGGLE', countdownSec: 0, countdownAtStartOnly: false })
    expect(state.mode.kind).toBe('paused')
    expect(state.cursor).toBeCloseTo(10)
  })

  it('pausing during the countdown cancels it', () => {
    const state = run(loaded, { type: 'PLAY', countdownSec: 3, countdownAtStartOnly: false }, { type: 'PAUSE' })
    expect(state.mode.kind).toBe('paused')
  })

  it('does nothing without a script', () => {
    expect(run(initialPlayback, { type: 'PLAY', countdownSec: 0, countdownAtStartOnly: false }).mode.kind).toBe('paused')
  })

  it('stops at the end and rewinds on the next play', () => {
    let state = run(loaded, { type: 'PLAY', countdownSec: 0, countdownAtStartOnly: false }, { type: 'TICK', dtMs: 10 * 60000, wpm: 100 })
    expect(state.mode.kind).toBe('paused')
    expect(state.cursor).toBe(100)
    state = run(state, { type: 'PLAY', countdownSec: 0, countdownAtStartOnly: false })
    expect(state.cursor).toBe(0)
    expect(state.mode.kind).toBe('playing')
  })

  it('eases toward a stepped line instead of jumping', () => {
    let state = run(loaded, { type: 'STEP_LINE', delta: 1 })
    expect(state.animTarget).toBe(10)
    expect(state.cursor).toBe(0)
    expect(needsTick(state)).toBe(true)
    state = run(state, { type: 'TICK', dtMs: 16, wpm: 140 })
    expect(state.cursor).toBeGreaterThan(0)
    expect(state.cursor).toBeLessThan(10)
    for (let i = 0; i < 30; i++) state = run(state, { type: 'TICK', dtMs: 16, wpm: 140 })
    expect(state.cursor).toBe(10)
    expect(state.animTarget).toBeNull()
    expect(state.mode.kind).toBe('paused')
  })

  it('chains steps from the pending target', () => {
    const state = run(loaded, { type: 'STEP_LINE', delta: 1 }, { type: 'STEP_LINE', delta: 1 })
    expect(state.animTarget).toBe(20)
  })

  it('steps back to the start of the current line first, then the previous', () => {
    let state = run(loaded, { type: 'SCRUB', cursor: 25 }, { type: 'STEP_LINE', delta: -1 })
    expect(state.animTarget).toBe(20)
    state = run(state, { type: 'STEP_LINE', delta: -1 })
    expect(state.animTarget).toBe(10)
  })

  it('steps by paragraph', () => {
    let state = run(loaded, { type: 'STEP_PARAGRAPH', delta: 1 })
    expect(state.animTarget).toBe(40)
    state = run(state, { type: 'STEP_PARAGRAPH', delta: 1 })
    expect(state.animTarget).toBe(70)
    state = run(state, { type: 'STEP_PARAGRAPH', delta: 1 })
    expect(state.animTarget).toBe(70)
  })

  it('stepping while playing continues playing afterwards', () => {
    let state = run(loaded, { type: 'PLAY', countdownSec: 0, countdownAtStartOnly: false }, { type: 'STEP_LINE', delta: 1 })
    for (let i = 0; i < 40; i++) state = run(state, { type: 'TICK', dtMs: 16, wpm: 140 })
    expect(state.mode.kind).toBe('playing')
    expect(state.cursor).toBeGreaterThan(10)
  })

  it('scrubbing moves the cursor and pauses', () => {
    const state = run(loaded, { type: 'PLAY', countdownSec: 0, countdownAtStartOnly: false }, { type: 'SCRUB', cursor: 33.5 })
    expect(state.cursor).toBe(33.5)
    expect(state.mode.kind).toBe('paused')
    expect(run(state, { type: 'SCRUB', cursor: -5 }).cursor).toBe(0)
    expect(run(state, { type: 'SCRUB', cursor: 999 }).cursor).toBe(100)
  })

  it('restart returns to the top, paused', () => {
    const state = run(
      loaded,
      { type: 'PLAY', countdownSec: 0, countdownAtStartOnly: false },
      { type: 'TICK', dtMs: 5000, wpm: 100 },
      { type: 'RESTART' },
    )
    expect(state.cursor).toBe(0)
    expect(state.mode.kind).toBe('paused')
  })

  it('replace resets position, append keeps it', () => {
    const mid = run(loaded, { type: 'SCRUB', cursor: 50 })
    const appended = run(mid, { type: 'SET_SCRIPT', wordCount: 150, paragraphStarts: [0, 40, 70, 100], place: keepPlace })
    expect(appended.cursor).toBe(50)
    expect(appended.wordCount).toBe(150)
    const replaced = run(mid, { type: 'SET_SCRIPT', wordCount: 20, paragraphStarts: [0], place: 'reset' })
    expect(replaced.cursor).toBe(0)
    expect(replaced.mode.kind).toBe('paused')
  })

  it('an Edit moves the position without pausing or re-arming the countdown', () => {
    const playing = run(loaded, { type: 'SCRUB', cursor: 50 }, { type: 'PLAY', countdownSec: 0, countdownAtStartOnly: true })
    const edited = run(playing, { type: 'SET_SCRIPT', wordCount: 103, paragraphStarts: [0], place: (cursor) => cursor + 3 })
    expect(edited.cursor).toBe(53)
    expect(edited.mode.kind).toBe('playing')
    expect(edited.countdownArmed).toBe(false)
  })

  it('clamps a placed position to the new Script', () => {
    const mid = run(loaded, { type: 'SCRUB', cursor: 50 })
    expect(run(mid, { type: 'SET_SCRIPT', wordCount: 10, paragraphStarts: [0], place: keepPlace }).cursor).toBe(10)
  })

  describe('countdown only at start', () => {
    const play = (state: PlaybackState) => run(state, { type: 'PLAY', countdownSec: 3, countdownAtStartOnly: true })
    const countdownThenPlay = (state: PlaybackState) =>
      run(play(state), { type: 'TICK', dtMs: 3000, wpm: 100 })

    it('counts down on the first play', () => {
      expect(play(loaded).mode.kind).toBe('countdown')
    })

    it('resumes immediately after a pause', () => {
      const paused = run(countdownThenPlay(loaded), { type: 'PAUSE' })
      expect(play(paused).mode.kind).toBe('playing')
    })

    it('resumes immediately after a step or scrub', () => {
      const started = run(countdownThenPlay(loaded), { type: 'PAUSE' })
      expect(play(run(started, { type: 'STEP_LINE', delta: 1 })).mode.kind).toBe('playing')
      expect(play(run(started, { type: 'SCRUB', cursor: 30 })).mode.kind).toBe('playing')
    })

    it('counts down again after restart', () => {
      const started = run(countdownThenPlay(loaded), { type: 'PAUSE' }, { type: 'RESTART' })
      expect(play(started).mode.kind).toBe('countdown')
    })

    it('counts down again after a replace but not an append', () => {
      const started = run(countdownThenPlay(loaded), { type: 'PAUSE' })
      const appended = run(started, { type: 'SET_SCRIPT', wordCount: 150, paragraphStarts: [0], place: keepPlace })
      expect(play(appended).mode.kind).toBe('playing')
      const replaced = run(started, { type: 'SET_SCRIPT', wordCount: 20, paragraphStarts: [0], place: 'reset' })
      expect(play(replaced).mode.kind).toBe('countdown')
    })

    it('counts down when replaying from the end', () => {
      const finished = run(countdownThenPlay(loaded), { type: 'TICK', dtMs: 10 * 60000, wpm: 100 })
      expect(play(finished).mode.kind).toBe('countdown')
    })

    it('resumes immediately after cancelling the countdown', () => {
      const cancelled = run(play(loaded), { type: 'PAUSE' })
      expect(play(cancelled).mode.kind).toBe('playing')
    })

    it('counts down on every play from paused when the setting is off', () => {
      const paused = run(countdownThenPlay(loaded), { type: 'PAUSE' })
      expect(run(paused, { type: 'PLAY', countdownSec: 3, countdownAtStartOnly: false }).mode.kind).toBe('countdown')
    })
  })
})
