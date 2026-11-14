import { useEffect, useMemo, useRef, useState, type Dispatch } from 'react'
import { transcribe } from '@/lib/scriptApi'
import { FOLLOW_BACKTRACK_WORDS, type PlaybackEvent, type PlaybackMode } from '../playback'
import type { Word } from '../script'
import { align, heardWords, normalize } from './align'
import { openMicrophone, QUIET_MS } from './microphone'

/** The least time between clips, so Whisper is not asked about the same half second over and over. */
const INTERVAL_MS = 600
const QUIET_CHECK_MS = 100
/** Faster than anyone reads aloud, in words per ms; a larger jump between matches is a skip, not pace. */
const MAX_PACE = 8 / 1000
/** The reader's pace is measured over the matches in this much time. One gap between clips is too noisy. */
const PACE_WINDOW_MS = 3000

export type FollowStatus = { kind: 'off' } | { kind: 'starting' } | { kind: 'listening' } | { kind: 'error'; message: string }

interface Match {
  position: number
  at: number
}

/** Words per ms across the recent matches, or `fallback` when they span too little time, such as after a pause. */
function paceOver(matches: readonly Match[], fallback: number): number {
  const first = matches[0]
  const last = matches[matches.length - 1]
  if (!first || !last || last.at - first.at < PACE_WINDOW_MS / 3) return fallback
  const pace = (last.position - first.position) / (last.at - first.at)
  return pace >= 0 && pace <= MAX_PACE ? pace : fallback
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
  const matches = useRef<{ recent: Match[]; pace: number }>({ recent: [], pace: 0 })

  useEffect(() => {
    if (!following) {
      setStatus((current) => (current.kind === 'error' ? current : { kind: 'off' }))
      return
    }
    let stopped = false
    let stopQuietCheck = () => {}
    const stop = (message: string) => {
      if (stopped) return
      stopped = true
      stopQuietCheck()
      setStatus({ kind: 'error', message })
      dispatch({ type: 'PAUSE' })
    }
    setStatus({ kind: 'starting' })
    matches.current = { recent: [], pace: 0 }
    const opening = openMicrophone()
    void (async () => {
      const mic = await opening.catch((error: unknown) => stop(micError(error)))
      if (!mic) return
      if (!stopped) setStatus({ kind: 'listening' })
      // Checked often, apart from the slower transcription loop, so the cursor stops soon after the reader does.
      const quietCheck = setInterval(() => !stopped && !mic.speaking() && dispatch({ type: 'QUIET', forMs: QUIET_MS }), QUIET_CHECK_MS)
      stopQuietCheck = () => clearInterval(quietCheck)
      while (!stopped) {
        const started = performance.now()
        const clip = mic.clip()
        if (clip) {
          try {
            const text = await transcribe(clip)
            const matched = align(live.current.script, heardWords(text), live.current.target)
            const { recent } = matches.current
            if (!stopped && matched !== null && !alreadyHeard(recent[recent.length - 1] ?? null, matched)) {
              const wentBack = recent.length > 0 && matched < recent[recent.length - 1]!.position
              const kept = wentBack ? [] : recent.filter((match) => match.at > started - PACE_WINDOW_MS)
              kept.push({ position: matched, at: started })
              const pace = paceOver(kept, matches.current.pace)
              matches.current = { recent: kept, pace }
              // The clip ended when it was sent; the reader has kept reading since.
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
      stopQuietCheck()
      void opening.then((mic) => mic.stop(), () => {})
    }
  }, [following, dispatch])

  return status
}
