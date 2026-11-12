import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { appendToDraft, draftText, editDraft, isDirty, keepsPlace, type Draft } from './draft'
import { commandForKey, type Command, type UiCommand } from './keymap'
import { initialPlayback, needsTick, playbackReducer } from './playback'
import { appendScript, makeScript, tokenize, type Script, type TokenizedScript } from './script'
import { nudgeSetting, SETTING_DEFS, formatSettingValue, type DisplaySettings, type SettingKey } from './settings'
import { loadDraft, loadScript, loadSettings, saveDraft, saveScript, saveSettings } from './storage'

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

export interface NudgeReadout {
  /** Changes on every nudge, so repeated nudges restart the fade. */
  seq: number
  text: string
}

interface UiBridge {
  /** While true, only the help toggle acts; Esc is the dialog's own. */
  helpOpen: boolean
  onUiCommand: (command: UiCommand) => void
}

export function usePrompter(ui: UiBridge) {
  const [script, setScript] = useState<Script | null>(loadScript)
  const [settings, setSettings] = useState<DisplaySettings>(loadSettings)
  const [draft, setDraft] = useState<Draft>(loadDraft)
  const tokens = useMemo(() => (script ? tokenize(script) : EMPTY_TOKENS), [script])

  const [playback, dispatch] = useReducer(playbackReducer, tokens, (initial) =>
    playbackReducer(initialPlayback, {
      type: 'SET_SCRIPT',
      wordCount: initial.words.length,
      paragraphStarts: initial.paragraphStarts,
      reset: true,
    }),
  )

  const [readout, setReadout] = useState<NudgeReadout | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const uiRef = useRef(ui)
  uiRef.current = ui

  useEffect(() => saveSettings(settings), [settings])
  useEffect(() => saveDraft(draft), [draft])

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

  const install = useCallback((next: Script, reset: boolean) => {
    const nextTokens = tokenize(next)
    setScript(next)
    saveScript(next)
    dispatch({ type: 'SET_SCRIPT', wordCount: nextTokens.words.length, paragraphStarts: nextTokens.paragraphStarts, reset })
  }, [])

  /** Replaces the Script with the draft. Keeps the reader's place if the words already read are unchanged. */
  const applyDraft = useCallback(() => {
    const text = draftText(draft, script)
    if (text.trim() === '') return
    const next = makeScript(text)
    install(next, !script || !keepsPlace(tokens, tokenize(next), playback.cursor))
    setDraft(null)
  }, [draft, script, tokens, playback.cursor, install])

  const discardDraft = useCallback(() => setDraft(null), [])

  const editDraftText = useCallback((text: string) => setDraft(editDraft(text, script)), [script])

  /** Append is the domain operation behind every Push that adds to the end: the place is kept and no countdown is armed. */
  const append = useCallback(
    (text: string) => {
      if (text.trim() === '') return
      install(script ? appendScript(script, text) : makeScript(text), !script)
      setDraft((current) => appendToDraft(current, text))
    },
    [script, install],
  )

  const run = useCallback((command: Command) => {
    const { countdownSec, countdownAtStartOnly } = settingsRef.current
    switch (command.type) {
      case 'toggle':
        return dispatch({ type: 'TOGGLE', countdownSec, countdownAtStartOnly })
      case 'restart':
        return dispatch({ type: 'RESTART' })
      case 'nudge': {
        const next = nudgeSetting(settingsRef.current, command.setting, command.direction)
        settingsRef.current = next
        setSettings(next)
        const text = `${SETTING_DEFS[command.setting].label}: ${formatSettingValue(command.setting, next[command.setting])}`
        return setReadout((current) => ({ seq: (current?.seq ?? 0) + 1, text }))
      }
      case 'stepLine':
        return dispatch({ type: 'STEP_LINE', delta: command.delta })
      case 'stepParagraph':
        return dispatch({ type: 'STEP_PARAGRAPH', delta: command.delta })
      case 'openSettings':
      case 'openPaste':
      case 'toggleHelp':
        return uiRef.current.onUiCommand(command)
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
      if (uiRef.current.helpOpen && command.type !== 'toggleHelp') return
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

  return {
    script,
    tokens,
    settings,
    playback,
    readout,
    draft: draftText(draft, script),
    draftDirty: isDirty(draft, script),
    dispatch,
    updateSetting,
    editDraft: editDraftText,
    applyDraft,
    discardDraft,
    append,
    run,
  }
}
