export type PlaybackMode = { kind: 'paused' } | { kind: 'countdown'; remainingMs: number } | { kind: 'playing' }

export interface PlaybackState {
  mode: PlaybackMode
  /** True until a play from the start has run; the next countdown-at-start-only play counts down. */
  countdownArmed: boolean
  /** Fractional word index of the Current line's position. */
  cursor: number
  /** Where a step animation is easing the cursor to. */
  animTarget: number | null
  wordCount: number
  paragraphStarts: readonly number[]
  lineStarts: readonly number[]
}

/** Where the reader goes when the Script changes: back to the top, or wherever their old position now is. */
export type Placement = 'reset' | ((cursor: number) => number)

export const keepPlace: Placement = (cursor) => cursor

export type PlaybackEvent =
  | { type: 'TOGGLE'; countdownSec: number; countdownAtStartOnly: boolean }
  | { type: 'PLAY'; countdownSec: number; countdownAtStartOnly: boolean }
  | { type: 'PAUSE' }
  | { type: 'TICK'; dtMs: number; wpm: number; minLineMs?: number }
  | { type: 'STEP_LINE'; delta: 1 | -1 }
  | { type: 'STEP_PARAGRAPH'; delta: 1 | -1 }
  | { type: 'RESTART' }
  | { type: 'SCRUB'; cursor: number }
  | { type: 'SET_SCRIPT'; wordCount: number; paragraphStarts: readonly number[]; place: Placement }
  | { type: 'SET_LAYOUT'; lineStarts: readonly number[] }

/** Time constant of the step easing. About 95% of a step lands in 3 of these. */
export const STEP_EASE_TAU_MS = 65
const SNAP_DISTANCE = 0.02
const START_EPSILON = 0.001

export const initialPlayback: PlaybackState = {
  mode: { kind: 'paused' },
  countdownArmed: true,
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

function play(state: PlaybackState, countdownSec: number, atStartOnly: boolean): PlaybackState {
  if (state.wordCount === 0 || state.mode.kind !== 'paused') return state
  const rewound = state.cursor >= state.wordCount
  const cursor = rewound ? 0 : state.cursor
  const armed = state.countdownArmed || rewound
  const counts = countdownSec > 0 && (armed || !atStartOnly)
  const mode: PlaybackMode = counts ? { kind: 'countdown', remainingMs: countdownSec * 1000 } : { kind: 'playing' }
  return { ...state, cursor, mode, countdownArmed: false }
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

/** Reading pace on the Current line: Speed, slowed so a short line stays up at least `minLineMs`. */
function wordsPerMs(state: PlaybackState, wpm: number, minLineMs: number): number {
  const base = wpm / 60000
  const { lineStarts, cursor } = state
  let line = -1
  for (let i = 0; i < lineStarts.length && lineStarts[i]! <= cursor; i++) line = i
  if (line < 0) return base
  const words = (lineStarts[line + 1] ?? state.wordCount) - lineStarts[line]!
  return words > 0 ? Math.min(base, words / minLineMs) : base
}

function tick(state: PlaybackState, dtMs: number, wpm: number, minLineMs: number): PlaybackState {
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
      const cursor = state.cursor + wordsPerMs(state, wpm, minLineMs) * dtMs
      return cursor >= state.wordCount
        ? { ...state, cursor: state.wordCount, mode: { kind: 'paused' } }
        : { ...state, cursor }
    }
  }
}

export function playbackReducer(state: PlaybackState, event: PlaybackEvent): PlaybackState {
  switch (event.type) {
    case 'PLAY':
      return play(state, event.countdownSec, event.countdownAtStartOnly)
    case 'PAUSE':
      return pause(state)
    case 'TOGGLE':
      return state.mode.kind === 'paused' ? play(state, event.countdownSec, event.countdownAtStartOnly) : pause(state)
    case 'TICK':
      return tick(state, event.dtMs, event.wpm, event.minLineMs ?? 0)
    case 'STEP_LINE':
      return step(state, state.lineStarts, event.delta)
    case 'STEP_PARAGRAPH':
      return step(state, state.paragraphStarts, event.delta)
    case 'RESTART':
      return { ...state, cursor: 0, animTarget: null, mode: { kind: 'paused' }, countdownArmed: true }
    case 'SCRUB':
      return { ...state, cursor: clampCursor(state, event.cursor), animTarget: null, mode: { kind: 'paused' } }
    case 'SET_SCRIPT': {
      const next = { ...state, wordCount: event.wordCount, paragraphStarts: event.paragraphStarts }
      return event.place === 'reset'
        ? { ...next, cursor: 0, animTarget: null, mode: { kind: 'paused' }, lineStarts: [], countdownArmed: true }
        : { ...next, cursor: clampCursor(next, event.place(state.cursor)), animTarget: null }
    }
    case 'SET_LAYOUT':
      return { ...state, lineStarts: event.lineStarts }
  }
}
