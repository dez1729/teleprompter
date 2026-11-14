/** A rendered line as pacing sees it. */
export interface PacedLine {
  /** Index of the line's first word. */
  start: number
  /** How much longer the line takes than its row alone, for crossing the gap below it. At least 1. */
  stretch: number
}

export type PlaybackMode =
  | { kind: 'paused' }
  | { kind: 'countdown'; remainingMs: number }
  | { kind: 'playing' }
  /**
   * Follow: the cursor moves to `target`, where the reader's voice was last matched. Between matches the target
   * keeps moving at the reader's `pace`, in words per ms, for up to FOLLOW_COAST_MS, so the cursor does not stall
   * while the next clip is transcribed.
   */
  | { kind: 'following'; target: number; pace: number; coastMs: number }

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
  lines: readonly PacedLine[]
}

/** Where the reader goes when the Script changes: back to the top, or wherever their old position now is. */
export type Placement = 'reset' | ((cursor: number) => number)

export const keepPlace: Placement = (cursor) => cursor

export type PlaybackEvent =
  | { type: 'TOGGLE'; countdownSec: number; countdownAtStartOnly: boolean }
  | { type: 'PLAY'; countdownSec: number; countdownAtStartOnly: boolean }
  | { type: 'PAUSE' }
  | { type: 'FOLLOW' }
  /** `position` is where the reader is now; `pace` is how fast they have been reading, in words per ms. */
  | { type: 'HEARD'; position: number; pace: number }
  /** The reader has gone quiet: stop moving until their voice is matched again. */
  | { type: 'QUIET' }
  | { type: 'TICK'; dtMs: number; wpm: number; minLineMs?: number }
  | { type: 'STEP_LINE'; delta: 1 | -1 }
  | { type: 'STEP_PARAGRAPH'; delta: 1 | -1 }
  | { type: 'RESTART' }
  | { type: 'SCRUB'; cursor: number }
  | { type: 'SET_SCRIPT'; wordCount: number; paragraphStarts: readonly number[]; place: Placement }
  | { type: 'SET_LAYOUT'; lines: readonly PacedLine[] }

/** Time constant of the step easing. About 95% of a step lands in 3 of these. */
export const STEP_EASE_TAU_MS = 65
/** Time constant of the Follow easing: the cursor glides to each match instead of jumping. */
export const FOLLOW_EASE_TAU_MS = 300
/**
 * A match less than this many words behind the target is speech heard again late, or the cursor having coasted
 * past a reader who stopped, not the reader going back to reread.
 */
export const FOLLOW_BACKTRACK_WORDS = 6
/** How long the cursor keeps moving at the reader's pace after the last match, before it waits for their voice. */
export const FOLLOW_COAST_MS = 1500
const SNAP_DISTANCE = 0.02
const START_EPSILON = 0.001

export const initialPlayback: PlaybackState = {
  mode: { kind: 'paused' },
  countdownArmed: true,
  cursor: 0,
  animTarget: null,
  wordCount: 0,
  paragraphStarts: [],
  lines: [],
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

function follow(state: PlaybackState): PlaybackState {
  if (state.wordCount === 0 || state.mode.kind === 'following') return state
  const cursor = state.cursor >= state.wordCount ? 0 : state.cursor
  return { ...state, cursor, mode: listeningAt(cursor), countdownArmed: false }
}

const listeningAt = (target: number): PlaybackMode => ({ kind: 'following', target, pace: 0, coastMs: FOLLOW_COAST_MS })

function heard(state: PlaybackState, position: number, pace: number): PlaybackState {
  if (state.mode.kind !== 'following') return state
  const { target } = state.mode
  if (position < target && position > target - FOLLOW_BACKTRACK_WORDS) return state
  return { ...state, mode: { kind: 'following', target: clampCursor(state, position), pace, coastMs: 0 } }
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
  if (target === null) return state
  // A step while following moves where Follow listens from, too.
  const mode = state.mode.kind === 'following' ? listeningAt(target) : state.mode
  return { ...state, animTarget: target, mode }
}

/**
 * Reading pace on the Current line: Speed, slowed so a short line stays up at least `minLineMs`,
 * then slowed by the line's stretch to leave time for the gap below it.
 */
function wordsPerMs(state: PlaybackState, wpm: number, minLineMs: number): number {
  const base = wpm / 60000
  const { lines, cursor } = state
  let index = -1
  for (let i = 0; i < lines.length && lines[i]!.start <= cursor; i++) index = i
  if (index < 0) return base
  const line = lines[index]!
  const words = (lines[index + 1]?.start ?? state.wordCount) - line.start
  const reading = words > 0 ? Math.min(base, words / minLineMs) : base
  return reading / line.stretch
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
    case 'following': {
      const { pace, coastMs } = state.mode
      const coasting = Math.max(0, Math.min(dtMs, FOLLOW_COAST_MS - coastMs))
      const target = clampCursor(state, state.mode.target + pace * coasting)
      const mode: PlaybackMode = coasting > 0 ? { kind: 'following', target, pace, coastMs: coastMs + coasting } : state.mode
      const distance = target - state.cursor
      if (Math.abs(distance) <= SNAP_DISTANCE) return state.cursor === target && mode === state.mode ? state : { ...state, cursor: target, mode }
      return { ...state, cursor: state.cursor + distance * (1 - Math.exp(-dtMs / FOLLOW_EASE_TAU_MS)), mode }
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
    case 'FOLLOW':
      return follow(state)
    case 'HEARD':
      return heard(state, event.position, event.pace)
    case 'QUIET':
      return state.mode.kind === 'following' ? { ...state, mode: { ...state.mode, coastMs: FOLLOW_COAST_MS } } : state
    case 'TOGGLE':
      return state.mode.kind === 'paused' ? play(state, event.countdownSec, event.countdownAtStartOnly) : pause(state)
    case 'TICK':
      return tick(state, event.dtMs, event.wpm, event.minLineMs ?? 0)
    case 'STEP_LINE':
      return step(state, state.lines.map((line) => line.start), event.delta)
    case 'STEP_PARAGRAPH':
      return step(state, state.paragraphStarts, event.delta)
    case 'RESTART':
      return { ...state, cursor: 0, animTarget: null, mode: { kind: 'paused' }, countdownArmed: true }
    case 'SCRUB':
      return { ...state, cursor: clampCursor(state, event.cursor), animTarget: null, mode: { kind: 'paused' } }
    case 'SET_SCRIPT': {
      const next = { ...state, wordCount: event.wordCount, paragraphStarts: event.paragraphStarts }
      return event.place === 'reset'
        ? { ...next, cursor: 0, animTarget: null, mode: { kind: 'paused' }, lines: [], countdownArmed: true }
        : { ...next, cursor: clampCursor(next, event.place(state.cursor)), animTarget: null }
    }
    case 'SET_LAYOUT':
      return { ...state, lines: event.lines }
  }
}
