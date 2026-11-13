import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { EMPTY_SCRIPT, type Script } from '@teleprompter/protocol'
import { placementFor } from './anchor'
import { commandForKey, type Command, type UiCommand } from './keymap'
import { initialPlayback, needsTick, playbackReducer } from './playback'
import { openScriptStream, restoreVersion, sendScript, type ScriptMessage } from '@/lib/scriptApi'
import { tokenize, type TokenizedScript } from './script'
import { nudgeSetting, SETTING_DEFS, formatSettingValue, type DisplaySettings, type SettingKey } from './settings'
import { clearLegacyDraft, clearLegacyScript, loadLegacyScript, loadSettings, saveSettings } from './storage'

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

/** A Replace that just arrived and the Version that undoes it. */
export interface ReplaceNotice {
  versionId: string
  text: string
}

/** The notice for a Replace that left a Version to go back to. Any other change clears the notice. */
function replaceNotice(message: ScriptMessage, restored: boolean): ReplaceNotice | null {
  if (message.type !== 'change' || message.kind !== 'replace' || message.previousVersionId === null) return null
  const { source } = message.script
  const text = restored ? 'Script restored' : source ? `Script replaced from ${source}` : 'Script replaced'
  return { versionId: message.previousVersionId, text }
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
  sendScript({ kind: 'replace', ...legacy }).then(clearLegacyScript, () => {})
}

export function usePrompter(ui: UiBridge) {
  const [current, setCurrent] = useState<Script>(EMPTY_SCRIPT)
  const [connected, setConnected] = useState<boolean | null>(null)
  const script = current.text.trim() === '' ? null : current
  const [settings, setSettings] = useState<DisplaySettings>(loadSettings)
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
  const [replaced, setReplaced] = useState<ReplaceNotice | null>(null)
  /** True from an Undo click until the Replace it causes arrives, so that one reads as a restore. */
  const restoring = useRef(false)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const live = useRef({ current, tokens })
  live.current = { current, tokens }
  const uiRef = useRef(ui)
  uiRef.current = ui

  useEffect(() => saveSettings(settings), [settings])
  useEffect(clearLegacyDraft, [])

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
   * The only way a Script reaches playback. Pushes, Edits and restored Versions
   * all arrive here as a change from the server.
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
    setReplaced(replaceNotice(message, restoring.current))
    if (kind === 'replace') restoring.current = false
  }, [])

  useEffect(() => openScriptStream({ onMessage: receive, onConnection: setConnected }), [receive])

  /** Restores the Version saved just before the Replace. The Script changes when the server's change comes back. */
  const undoReplace = useCallback((notice: ReplaceNotice) => {
    restoring.current = true
    setReplaced(null)
    restoreVersion(notice.versionId).catch(() => {
      restoring.current = false
      setReplaced(notice)
    })
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
      case 'openEditor':
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
    replaced,
    undoReplace,
    dispatch,
    updateSetting,
    run,
  }
}
