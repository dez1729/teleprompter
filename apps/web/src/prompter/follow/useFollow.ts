import { useEffect, useMemo, useRef, useState, type Dispatch } from 'react'
import { transcribe } from '@/lib/scriptApi'
import { FOLLOW_BACKTRACK_WORDS, type PlaybackEvent, type PlaybackMode } from '../playback'
import type { Word } from '../script'
import { align, heardWords, normalize } from './align'
import { openMicrophone } from './microphone'

/** The least time between clips, so Whisper is not asked about the same half second over and over. */
const INTERVAL_MS = 600
/** Faster than anyone reads aloud; a larger jump between matches is a skip, not pace. */
const MAX_PACE = 8 / 1000
/** A longer gap between matches is the reader pausing. */
const PAUSE_MS = 2000
/** How much each new match moves the pace estimate. */
const PACE_SMOOTHING = 0.5

export type FollowStatus = { kind: 'off' } | { kind: 'starting' } | { kind: 'listening' } | { kind: 'error'; message: string }

function paceAfter(previous: { position: number; at: number; pace: number } | null, position: number, at: number): number {
  if (!previous || at <= previous.at) return 0
  // Across a pause the words per ms say nothing about how fast the reader reads.
  if (at - previous.at > PAUSE_MS) return previous.pace
  const latest = (position - previous.position) / (at - previous.at)
  if (latest < 0 || latest > MAX_PACE) return 0
  return previous.pace + PACE_SMOOTHING * (latest - previous.pace)
}

/** The same words as the last match, or slightly before them: nothing new, so the cursor carries on as it was. */
function alreadyHeard(previous: { position: number } | null, position: number): boolean {
  return previous !== null && position <= previous.position && position > previous.position - FOLLOW_BACKTRACK_WORDS
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function micError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : ''
  if (name === 'NotAllowedError') return 'Follow needs the microphone. Allow it in the browser and press F again.'
  if (name === 'NotFoundError') return 'Follow found no microphone.'
  return `Follow could not open the microphone: ${String(error)}`
}

/**
 * While the mode is following, listens to the reader and reports where they are with HEARD.
 * Stops with an error status, and pauses, when the microphone or the Transcriber fails.
 */
export function useFollow(mode: PlaybackMode, words: readonly Word[], dispatch: Dispatch<PlaybackEvent>): FollowStatus {
  const following = mode.kind === 'following'
  const [status, setStatus] = useState<FollowStatus>({ kind: 'off' })
  const script = useMemo(() => words.map((word) => normalize(word.text)), [words])
  const live = useRef({ script, target: 0 })
  live.current = { script, target: mode.kind === 'following' ? mode.target : 0 }
  const last = useRef<{ position: number; at: number; pace: number } | null>(null)

  useEffect(() => {
    if (!following) {
      setStatus((current) => (current.kind === 'error' ? current : { kind: 'off' }))
      return
    }
    let stopped = false
    const stop = (message: string) => {
      if (stopped) return
      stopped = true
      setStatus({ kind: 'error', message })
      dispatch({ type: 'PAUSE' })
    }
    setStatus({ kind: 'starting' })
    last.current = null
    const opening = openMicrophone()
    void (async () => {
      const mic = await opening.catch((error: unknown) => stop(micError(error)))
      if (!mic) return
      if (!stopped) setStatus({ kind: 'listening' })
      while (!stopped) {
        const started = performance.now()
        if (!mic.speaking()) dispatch({ type: 'QUIET' })
        const clip = mic.clip()
        if (clip) {
          try {
            const text = await transcribe(clip)
            const matched = align(live.current.script, heardWords(text), live.current.target)
            if (!stopped && matched !== null && !alreadyHeard(last.current, matched)) {
              // The clip ended when it was sent; the reader has kept reading since.
              const pace = paceAfter(last.current, matched, started)
              last.current = { position: matched, at: started, pace }
              dispatch({ type: 'HEARD', position: matched + pace * (performance.now() - started), pace })
            }
          } catch (error) {
            stop(error instanceof Error ? error.message : String(error))
          }
        }
        await sleep(Math.max(0, INTERVAL_MS - (performance.now() - started)))
      }
    })()
    return () => {
      stopped = true
      void opening.then((mic) => mic.stop(), () => {})
    }
  }, [following, dispatch])

  return status
}
