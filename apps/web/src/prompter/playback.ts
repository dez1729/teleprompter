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
   * while the next clip is transcribed. The cursor moves at `speed`, in words per ms, which changes gradually.
   * `heard` is the word the reader's voice was last matched to, or where they last moved by hand.
   */
  | { kind: 'following'; target: number; pace: number; coastMs: number; speed: number; heard: number }

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
  /**
   * `matched` is the word just past what the reader's voice matched; `position` is where they are now, allowing
   * for the time the match took; `pace` is how fast they have been reading, in words per ms.
   */
  | { type: 'HEARD'; matched: number; position: number; pace: number }
  /** The reader went quiet `forMs` ago: stop near where they stopped, until their voice is matched again. */
  | { type: 'QUIET'; forMs: number }
  | { type: 'TICK'; dtMs: number; wpm: number; minLineMs?: number }
  /** Moves by hand: `keepPlaying` carries on scrolling from the new place, otherwise they pause. */
  | { type: 'STEP_LINE'; delta: 1 | -1; keepPlaying: boolean }
  | { type: 'STEP_PARAGRAPH'; delta: 1 | -1; keepPlaying: boolean }
  | { type: 'RESTART' }
  | { type: 'SCRUB'; cursor: number; keepPlaying: boolean }
  | { type: 'SET_SCRIPT'; wordCount: number; paragraphStarts: readonly number[]; place: Placement }
  | { type: 'SET_LAYOUT'; lines: readonly PacedLine[] }

/** Time constant of the step easing. About 95% of a step lands in 3 of these. */
export const STEP_EASE_TAU_MS = 65
/** Follow reads at the reader's pace, plus enough to close the gap to the target over this long. */
const FOLLOW_CATCHUP_MS = 1000
/** Time constant of Follow's speed changes, so the cursor speeds up and slows down instead of starting and stopping. */
const FOLLOW_SPEED_TAU_MS = 300
/** The slowest Follow closes a gap, so the cursor reaches the target instead of creeping toward it forever. */
const FOLLOW_MIN_SPEED = 1.5 / 1000
/** Faster than anyone reads aloud, in words per ms. */
const FOLLOW_MAX_SPEED = 12 / 1000
/** Time constant of the move back when the reader goes back to reread. */
const FOLLOW_BACK_TAU_MS = 300
/**
 * A reader this many words ahead of the cursor jumped there: the cursor glides all the way to them, as it does for
 * a step with the arrow keys, instead of scrolling through the words between.
 */
const FOLLOW_JUMP_WORDS = 8
/**
 * A match this many words before where the reader was last heard is them going back to reread. A match closer
 * behind is the same speech heard again late.
 */
const FOLLOW_REREAD_WORDS = 6
/**
 * How long the cursor keeps moving at the reader's pace after the last match, before it waits for their voice.
 * Long enough to ride out a slow answer from Whisper; QUIET stops it sooner when the reader stops.
 */
export const FOLLOW_COAST_MS = 3000
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

const listeningAt = (target: number): PlaybackMode => ({
  kind: 'following',
  target,
  pace: 0,
  coastMs: FOLLOW_COAST_MS,
  speed: 0,
  heard: target,
})

/** The reader moved by hand while following: Follow listens from there, keeping their pace. */
function movedTo(mode: PlaybackMode, position: number): PlaybackMode {
  return mode.kind === 'following' ? { ...mode, target: position, heard: position, coastMs: FOLLOW_COAST_MS, speed: 0 } : mode
}

function heard(state: PlaybackState, matched: number, position: number, pace: number): PlaybackState {
  if (state.mode.kind !== 'following') return state
  const { target, heard: last } = state.mode
  const reread = matched < last - FOLLOW_REREAD_WORDS
  // Nothing new: carrying on as before keeps the cursor from coasting on stale speech.
  if (!reread && matched <= last) return state
  // A new match behind the cursor means the cursor ran ahead: it waits there for the reader.
  const next = position < target && !reread ? target : clampCursor(state, position)
  const jumped = next - (state.animTarget ?? state.cursor) > FOLLOW_JUMP_WORDS
  return {
    ...state,
    animTarget: jumped ? next : state.animTarget,
    mode: { ...state.mode, target: next, pace, coastMs: 0, speed: jumped ? pace : state.mode.speed, heard: matched },
  }
}

/** Takes back the coasting since the reader stopped, without moving the cursor back. */
function quiet(state: PlaybackState, forMs: number): PlaybackState {
  if (state.mode.kind !== 'following' || state.mode.coastMs >= FOLLOW_COAST_MS) return state
  const { target, pace } = state.mode
  const stoppedAt = Math.max(state.cursor, target - pace * Math.min(forMs, state.mode.coastMs))
  return { ...state, mode: { ...state.mode, target: stoppedAt, coastMs: FOLLOW_COAST_MS } }
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

function step(state: PlaybackState, starts: readonly number[], delta: 1 | -1, keepPlaying: boolean): PlaybackState {
  const target = stepTarget(starts, state.animTarget ?? state.cursor, delta)
  if (target === null) return state
  return { ...state, animTarget: target, mode: afterMove(state.mode, target, keepPlaying) }
}

/** Where scrolling stands after the reader moved to `position` by hand. */
function afterMove(mode: PlaybackMode, position: number, keepPlaying: boolean): PlaybackMode {
  if (!keepPlaying) return { kind: 'paused' }
  return movedTo(mode, position)
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

/** Moves the cursor toward the target at the reader's pace, changing speed gradually. */
function followTick(state: PlaybackState, mode: Extract<PlaybackMode, { kind: 'following' }>, dtMs: number): PlaybackState {
  const coasting = Math.max(0, Math.min(dtMs, FOLLOW_COAST_MS - mode.coastMs))
  const target = clampCursor(state, mode.target + mode.pace * coasting)
  const coastMs = mode.coastMs + coasting
  const gap = target - state.cursor
  if (gap < -SNAP_DISTANCE) {
    const eased = state.cursor + gap * (1 - Math.exp(-dtMs / FOLLOW_BACK_TAU_MS))
    const cursor = eased - target <= SNAP_DISTANCE ? target : eased
    return { ...state, cursor, mode: { ...mode, target, coastMs, speed: 0 } }
  }
  const pace = coasting > 0 ? mode.pace : 0
  const wanted = gap <= 0 ? 0 : Math.min(FOLLOW_MAX_SPEED, Math.max(FOLLOW_MIN_SPEED, pace + gap / FOLLOW_CATCHUP_MS))
  const speed = mode.speed + (wanted - mode.speed) * (1 - Math.exp(-dtMs / FOLLOW_SPEED_TAU_MS))
  if (speed < 1e-6 && wanted === 0 && coasting === 0) return mode.speed === 0 ? state : { ...state, mode: { ...mode, speed: 0 } }
  const cursor = Math.min(target, state.cursor + speed * dtMs)
  return { ...state, cursor, mode: { ...mode, target, coastMs, speed } }
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
    case 'following':
      return followTick(state, state.mode, dtMs)
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
      return heard(state, event.matched, event.position, event.pace)
    case 'QUIET':
      return quiet(state, event.forMs)
    case 'TOGGLE':
      return state.mode.kind === 'paused' ? play(state, event.countdownSec, event.countdownAtStartOnly) : pause(state)
    case 'TICK':
      return tick(state, event.dtMs, event.wpm, event.minLineMs ?? 0)
    case 'STEP_LINE':
      return step(state, state.lines.map((line) => line.start), event.delta, event.keepPlaying)
    case 'STEP_PARAGRAPH':
      return step(state, state.paragraphStarts, event.delta, event.keepPlaying)
    case 'RESTART':
      return { ...state, cursor: 0, animTarget: null, mode: { kind: 'paused' }, countdownArmed: true }
    case 'SCRUB': {
      const cursor = clampCursor(state, event.cursor)
      return { ...state, cursor, animTarget: null, mode: afterMove(state.mode, cursor, event.keepPlaying) }
    }
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
