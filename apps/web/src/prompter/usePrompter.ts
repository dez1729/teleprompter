import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { EMPTY_SCRIPT, type Script } from '@teleprompter/protocol'
import { placementFor } from './anchor'
import { appendedTail, appendToDraft, draftText, editDraft, isDirty, type Draft } from './draft'
import { commandForKey, type Command, type UiCommand } from './keymap'
import { initialPlayback, needsTick, playbackReducer } from './playback'
import { pushScript, openScriptStream, type ScriptMessage } from './scriptApi'
import { tokenize, type TokenizedScript } from './script'
import { nudgeSetting, SETTING_DEFS, formatSettingValue, type DisplaySettings, type SettingKey } from './settings'
import { clearLegacyScript, loadDraft, loadLegacyScript, loadSettings, saveDraft, saveSettings } from './storage'

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

/** The Script used to live in this browser. If the server has none yet, it gets this one, once. */
function moveLegacyScript() {
  const legacy = loadLegacyScript()
  if (!legacy) return
  pushScript({ kind: 'replace', ...legacy }).then(clearLegacyScript, () => {})
}

export function usePrompter(ui: UiBridge) {
  const [current, setCurrent] = useState<Script>(EMPTY_SCRIPT)
  const [connected, setConnected] = useState<boolean | null>(null)
  const script = current.text.trim() === '' ? null : current
  const [settings, setSettings] = useState<DisplaySettings>(loadSettings)
  const [draft, setDraft] = useState<Draft>(loadDraft)
  const tokens = useMemo(() => (script ? tokenize(script) : EMPTY_TOKENS), [script])


  const [playback, dispatch] = useReducer(playbackReducer, tokens, (initial) =>
    playbackReducer(initialPlayback, {
      type: 'SET_SCRIPT',
      wordCount: initial.words.length,
      paragraphStarts: initial.paragraphStarts,
      place: 'reset',
    }),
  )

  const [readout, setReadout] = useState<NudgeReadout | null>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const live = useRef({ current, tokens })
  live.current = { current, tokens }
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

  /**
   * The only way a Script reaches playback. Pushes, this window's Apply and other
   * windows all arrive here as a change from the server.
   */
  const receive = useCallback((message: ScriptMessage) => {
    const { current: before, tokens: beforeTokens } = live.current
    const incoming = message.script
    if (message.type === 'snapshot' && incoming.revision === 0) moveLegacyScript()
    if (message.type === 'snapshot' ? incoming.revision === before.revision : incoming.revision <= before.revision) return

    const nextTokens = tokenize(incoming)
    // A snapshot that differs is whatever happened while disconnected, so it anchors like an Edit.
    const kind = message.type === 'change' ? message.kind : 'edit'
    const place = placementFor(kind, beforeTokens, nextTokens)

    live.current = { current: incoming, tokens: nextTokens }
    setCurrent(incoming)
    dispatch({ type: 'SET_SCRIPT', wordCount: nextTokens.words.length, paragraphStarts: nextTokens.paragraphStarts, place })
    if (kind === 'append') {
      const tail = appendedTail(before.text, incoming.text)
      if (tail !== null) setDraft((draft) => appendToDraft(draft, tail))
    }
  }, [])

  useEffect(() => openScriptStream({ onMessage: receive, onConnection: setConnected }), [receive])

  /** Sends the draft to the server. The Script changes when the server's change comes back. */
  const applyDraft = useCallback(async () => {
    const text = draftText(draft, script)
    if (text.trim() === '') return
    await pushScript({ kind: 'edit', text })
    setDraft((now) => (now === text ? null : now))
  }, [draft, script])

  const discardDraft = useCallback(() => setDraft(null), [])

  const editDraftText = useCallback((text: string) => setDraft(editDraft(text, script)), [script])

  const append = useCallback(async (text: string) => {
    if (text.trim() !== '') await pushScript({ kind: 'append', text })
  }, [])

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
    connected,
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
