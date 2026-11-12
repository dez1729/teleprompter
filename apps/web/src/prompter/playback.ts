export type PlaybackMode =
  | { kind: 'paused' }
  | { kind: 'countdown'; remainingMs: number }
  | { kind: 'playing' }

export interface PlaybackState {
  mode: PlaybackMode
  /** Fractional word index of the Current line's position. */
  cursor: number
  /** Where a step animation is easing the cursor to. */
  animTarget: number | null
  wordCount: number
  paragraphStarts: readonly number[]
  lineStarts: readonly number[]
}

export type PlaybackEvent =
  | { type: 'TOGGLE'; countdownSec: number }
  | { type: 'PLAY'; countdownSec: number }
  | { type: 'PAUSE' }
  | { type: 'TICK'; dtMs: number; wpm: number }
  | { type: 'STEP_LINE'; delta: 1 | -1 }
  | { type: 'STEP_PARAGRAPH'; delta: 1 | -1 }
  | { type: 'RESTART' }
  | { type: 'SCRUB'; cursor: number }
  | { type: 'SET_SCRIPT'; wordCount: number; paragraphStarts: readonly number[]; reset: boolean }
  | { type: 'SET_LAYOUT'; lineStarts: readonly number[] }

/** Time constant of the step easing. About 95% of a step lands in 3 of these. */
export const STEP_EASE_TAU_MS = 65
const SNAP_DISTANCE = 0.02
const START_EPSILON = 0.001

export const initialPlayback: PlaybackState = {
  mode: { kind: 'paused' },
  cursor: 0,
  animTarget: null,
  wordCount: 0,
  paragraphStarts: [],
  lineStarts: [],
}

export function needsTick(state: PlaybackState): boolean {
  return state.mode.kind !== 'paused' || state.animTarget !== null
}

const clampCursor = (state: PlaybackState, cursor: number) => Math.min(state.wordCount, Math.max(0, cursor))

function play(state: PlaybackState, countdownSec: number): PlaybackState {
  if (state.wordCount === 0 || state.mode.kind !== 'paused') return state
  const cursor = state.cursor >= state.wordCount ? 0 : state.cursor
  const mode: PlaybackMode =
    countdownSec > 0 ? { kind: 'countdown', remainingMs: countdownSec * 1000 } : { kind: 'playing' }
  return { ...state, cursor, mode }
}

function pause(state: PlaybackState): PlaybackState {
  return state.mode.kind === 'paused' ? state : { ...state, mode: { kind: 'paused' } }
}

/** Moves to the next start in `starts`; going back from mid-line first returns to that line's start. */
function stepTarget(starts: readonly number[], from: number, delta: 1 | -1): number | null {
  if (starts.length === 0) return null
  let index = 0
  for (let i = 0; i < starts.length; i++) if (starts[i]! <= from + START_EPSILON) index = i
  const atStart = Math.abs(starts[index]! - from) <= START_EPSILON
  const target = delta < 0 && !atStart ? index : index + delta
  return starts[Math.min(starts.length - 1, Math.max(0, target))]!
}

function step(state: PlaybackState, starts: readonly number[], delta: 1 | -1): PlaybackState {
  const target = stepTarget(starts, state.animTarget ?? state.cursor, delta)
  return target === null ? state : { ...state, animTarget: target }
}

function tick(state: PlaybackState, dtMs: number, wpm: number): PlaybackState {
  if (state.animTarget !== null) {
    const distance = state.animTarget - state.cursor
    if (Math.abs(distance) <= SNAP_DISTANCE) return { ...state, cursor: state.animTarget, animTarget: null }
    const eased = state.cursor + distance * (1 - Math.exp(-dtMs / STEP_EASE_TAU_MS))
    return { ...state, cursor: eased }
  }
  switch (state.mode.kind) {
    case 'paused':
      return state
    case 'countdown': {
      const remainingMs = state.mode.remainingMs - dtMs
      return { ...state, mode: remainingMs > 0 ? { kind: 'countdown', remainingMs } : { kind: 'playing' } }
    }
    case 'playing': {
      const cursor = state.cursor + (wpm * dtMs) / 60000
      return cursor >= state.wordCount
        ? { ...state, cursor: state.wordCount, mode: { kind: 'paused' } }
        : { ...state, cursor }
    }
  }
}

export function playbackReducer(state: PlaybackState, event: PlaybackEvent): PlaybackState {
  switch (event.type) {
    case 'PLAY':
      return play(state, event.countdownSec)
    case 'PAUSE':
      return pause(state)
    case 'TOGGLE':
      return state.mode.kind === 'paused' ? play(state, event.countdownSec) : pause(state)
    case 'TICK':
      return tick(state, event.dtMs, event.wpm)
    case 'STEP_LINE':
      return step(state, state.lineStarts, event.delta)
    case 'STEP_PARAGRAPH':
      return step(state, state.paragraphStarts, event.delta)
    case 'RESTART':
      return { ...state, cursor: 0, animTarget: null, mode: { kind: 'paused' } }
    case 'SCRUB':
      return { ...state, cursor: clampCursor(state, event.cursor), animTarget: null, mode: { kind: 'paused' } }
    case 'SET_SCRIPT': {
      const next = { ...state, wordCount: event.wordCount, paragraphStarts: event.paragraphStarts }
      return event.reset
        ? { ...next, cursor: 0, animTarget: null, mode: { kind: 'paused' }, lineStarts: [] }
        : { ...next, cursor: clampCursor(next, state.cursor), animTarget: null }
    }
    case 'SET_LAYOUT':
      return { ...state, lineStarts: event.lineStarts }
  }
}
