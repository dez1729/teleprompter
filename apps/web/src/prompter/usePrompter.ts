import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { commandForKey, type Command } from './keymap'
import { initialPlayback, needsTick, playbackReducer } from './playback'
import { appendScript, makeScript, tokenize, type Script, type TokenizedScript } from './script'
import { nudgeSetting, type DisplaySettings, type SettingKey } from './settings'
import { loadScript, loadSettings, saveScript, saveSettings } from './storage'

const MAX_FRAME_MS = 100

const EMPTY_TOKENS: TokenizedScript = { words: [], paragraphStarts: [] }

const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'color', 'file', 'image', 'radio', 'range', 'reset', 'submit'])

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLInputElement) return !NON_TEXT_INPUT_TYPES.has(target.type)
  return target.closest('[contenteditable]:not([contenteditable="false"])') !== null
}

/** Widgets that use the arrow keys themselves; they keep the arrows, the Prompter gets the other keys. */
function consumesArrows(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('input[type="range"], [role="slider"], [data-slot="toggle-group"]') !== null
  )
}

export type PushMode = 'replace' | 'append'

export function usePrompter() {
  const [script, setScript] = useState<Script | null>(loadScript)
  const [settings, setSettings] = useState<DisplaySettings>(loadSettings)
  const tokens = useMemo(() => (script ? tokenize(script) : EMPTY_TOKENS), [script])

  const [playback, dispatch] = useReducer(playbackReducer, tokens, (initial) =>
    playbackReducer(initialPlayback, {
      type: 'SET_SCRIPT',
      wordCount: initial.words.length,
      paragraphStarts: initial.paragraphStarts,
      reset: true,
    }),
  )

  const settingsRef = useRef(settings)
  settingsRef.current = settings

  useEffect(() => saveSettings(settings), [settings])

  const active = needsTick(playback)
  useEffect(() => {
    if (!active) return
    let last = performance.now()
    let frame = 0
    const loop = (now: number) => {
      dispatch({ type: 'TICK', dtMs: Math.min(now - last, MAX_FRAME_MS), wpm: settingsRef.current.speedWpm })
      last = now
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [active])

  const updateSetting = useCallback(<K extends SettingKey>(key: K, value: DisplaySettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }))
  }, [])

  const push = useCallback(
    (text: string, mode: PushMode) => {
      if (text.trim() === '') return
      const next = mode === 'replace' || !script ? makeScript(text) : appendScript(script, text)
      const nextTokens = tokenize(next)
      setScript(next)
      saveScript(next)
      dispatch({
        type: 'SET_SCRIPT',
        wordCount: nextTokens.words.length,
        paragraphStarts: nextTokens.paragraphStarts,
        reset: mode === 'replace' || !script,
      })
    },
    [script],
  )

  const run = useCallback((command: Command) => {
    const { countdownSec, countdownAtStartOnly } = settingsRef.current
    switch (command.type) {
      case 'toggle':
        return dispatch({ type: 'TOGGLE', countdownSec, countdownAtStartOnly })
      case 'restart':
        return dispatch({ type: 'RESTART' })
      case 'nudge':
        return setSettings((current) => nudgeSetting(current, command.setting, command.direction))
      case 'stepLine':
        return dispatch({ type: 'STEP_LINE', delta: command.delta })
      case 'stepParagraph':
        return dispatch({ type: 'STEP_PARAGRAPH', delta: command.delta })
      case 'follow':
        return
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(event.target)) return
      if (event.key.startsWith('Arrow') && consumesArrows(event.target)) return
      const command = commandForKey(event)
      if (!command) return
      event.preventDefault()
      // Capture phase, so keep a focused slider from also acting on Home.
      event.stopPropagation()
      if (event.repeat && (command.type === 'toggle' || command.type === 'restart')) return
      run(command)
    }
    // Stops Space from clicking a focused button when released.
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ' && !isTypingTarget(event.target)) event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [run])

  return { script, tokens, settings, playback, dispatch, updateSetting, push, run }
}
