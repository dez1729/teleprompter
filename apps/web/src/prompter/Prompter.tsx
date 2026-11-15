import { SquarePen } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type WheelEvent } from 'react'
import { isNil } from 'es-toolkit'
import { Button } from '@/components/ui/button'
import { EDITOR_WINDOW, openNamedWindow, PROMPTER_WINDOW } from '@/lib/windows'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { ControlBar } from './ControlBar'
import { NudgeHud } from './NudgeHud'
import { cursorToY, EMPTY_LAYOUT, measureLayout, pacedLines, readingOffset, yToCursor, type Layout } from './layout'
import { HelpOverlay } from './HelpOverlay'
import { readCount, useReadWords } from './readWords'
import { ScriptText } from './ScriptText'
import { SettingsSheet } from './SettingsSheet'
import { UndoToast } from './UndoToast'
import { FONT_STACKS, GAP_PACES } from './settings'
import type { FollowStatus } from './follow/session'
import { usePrompter } from './usePrompter'

const BAR_HIDE_DELAY_MS = 2000
const DRAG_THRESHOLD_PX = 3
const WHEEL_LINE_PX = 16

const openEditor = () => openNamedWindow('/editor', EDITOR_WINDOW)

export const Prompter = () => {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const { script, connected, tokens, settings, playback, follow, readout, replaced, undoReplace, dispatch, updateSetting, run } = usePrompter({
    helpOpen,
    onUiCommand: (command) => {
      switch (command.type) {
        case 'toggleHelp':
          return setHelpOpen((open) => !open)
        case 'openSettings':
          return setSettingsOpen(true)
        case 'openEditor':
          return openEditor()
      }
    },
  })

  const [layout, setLayout] = useState<Layout>(EMPTY_LAYOUT)
  const [recentMouse, setRecentMouse] = useState(true)

  useEffect(() => {
    // Named so the Editor's "Open Prompter" comes back to this window instead of opening another.
    window.name ||= PROMPTER_WINDOW
  }, [])

  const stageRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)

  const lineHeightPx = settings.fontSize * settings.lineHeight
  // Memoized so ScriptText, which only takes new words or a new style, skips the per-frame renders.
  const textStyle = useMemo(
    () =>
      ({
        position: 'relative',
        margin: '0 auto',
        width:
          settings.columnMode === 'column'
            ? `min(${settings.columnWidthCh}ch, calc(100% - ${2 * settings.marginX}px))`
            : `calc(100% - ${2 * settings.marginX}px)`,
        fontFamily: FONT_STACKS[settings.fontFamily],
        fontSize: settings.fontSize,
        lineHeight: settings.lineHeight,
        textAlign: 'left',
        overflowWrap: 'break-word',
        '--read-color': settings.readWordsColor,
      }) as CSSProperties,
    [settings.columnMode, settings.columnWidthCh, settings.marginX, settings.fontFamily, settings.fontSize, settings.lineHeight, settings.readWordsColor],
  )
  useReadWords(textRef, tokens, settings.readWords ? readCount(playback.cursor, tokens.words.length) : 0)

  const remeasure = useCallback(() => {
    if (isNil(textRef.current)) return
    const next = measureLayout(textRef.current, GAP_PACES[settings.paragraphPause])
    setLayout(next)
    dispatch({ type: 'SET_LAYOUT', lines: pacedLines(next) })
  }, [dispatch, settings.paragraphPause])

  useLayoutEffect(remeasure, [
    remeasure,
    tokens,
    settings.fontSize,
    settings.lineHeight,
    settings.fontFamily,
    settings.columnMode,
    settings.columnWidthCh,
    settings.marginX,
  ])

  useEffect(() => {
    const observer = new ResizeObserver(remeasure)
    if (stageRef.current) observer.observe(stageRef.current)
    if (textRef.current) observer.observe(textRef.current)
    return () => observer.disconnect()
  }, [remeasure, script])

  // A web font that finishes loading after the first measure moves every word.
  useEffect(() => {
    document.fonts.addEventListener('loadingdone', remeasure)
    return () => document.fonts.removeEventListener('loadingdone', remeasure)
  }, [remeasure])

  const playing = playback.mode.kind === 'playing' || playback.mode.kind === 'following'
  // Starting or stopping shows the bar again, as a mouse move does.
  const [barShownFor, setBarShownFor] = useState(playing)
  if (barShownFor !== playing) {
    setBarShownFor(playing)
    setRecentMouse(true)
  }

  const showBar = () => setRecentMouse(true)
  useEffect(() => {
    if (!recentMouse || !playing) return
    const timer = setTimeout(() => setRecentMouse(false), BAR_HIDE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [recentMouse, playing])

  const scrubBy = (startCursor: number, dy: number) => {
    const y = cursorToY(layout, startCursor) + dy
    dispatch({ type: 'SCRUB', cursor: yToCursor(layout, y), keepPlaying: settings.keepPlayingOnMove })
  }

  const onWheel = (event: WheelEvent) => {
    const dy = event.deltaMode === 1 ? event.deltaY * WHEEL_LINE_PX : event.deltaY
    scrubBy(playback.cursor, dy)
  }

  const drag = useRef<{ startY: number; startCursor: number; moved: boolean } | null>(null)
  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    drag.current = { startY: event.clientY, startCursor: playback.cursor, moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent) => {
    showBar()
    const current = drag.current
    if (isNil(current)) return
    const dy = event.clientY - current.startY
    if (!current.moved && Math.abs(dy) < DRAG_THRESHOLD_PX) return
    current.moved = true
    scrubBy(current.startCursor, -dy)
  }

  const onPointerUp = () => {
    drag.current = null
  }

  const windowTop = `${settings.windowPositionPct}%`
  const windowBottom = `calc(${windowTop} + ${settings.windowHeightLines * lineHeightPx}px)`
  const y = cursorToY(layout, playback.cursor) - readingOffset(settings.windowHeightLines, lineHeightPx)
  const overlayStyle = { backgroundColor: settings.bgColor, opacity: settings.overlayOpacity }
  const edgeStyle = { backgroundColor: `color-mix(in srgb, ${settings.textColor} 15%, transparent)` }
  const countdown = playback.mode.kind === 'countdown' ? Math.ceil(playback.mode.remainingMs / 1000) : null

  return (
    <>
      <div
        ref={stageRef}
        className="fixed inset-0 touch-none overflow-hidden select-none"
        style={{ backgroundColor: settings.bgColor, color: settings.textColor, cursor: script ? 'grab' : 'default' }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {script && (
          <div
            className="absolute inset-x-0 overflow-hidden"
            style={{ top: settings.marginTop, bottom: settings.marginBottom }}
          >
            <div
              className="absolute inset-x-0"
              style={{ top: windowTop, transform: settings.mirror ? 'scaleX(-1)' : undefined }}
            >
              <div style={{ transform: `translateY(${-y}px)`, willChange: 'transform' }}>
                <ScriptText ref={textRef} tokens={tokens} style={textStyle} />
              </div>
            </div>
            <div
              className="pointer-events-none absolute inset-x-0 top-0"
              style={{ ...overlayStyle, height: windowTop }}
            />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0"
              style={{ ...overlayStyle, top: windowBottom }}
            />
            <div className="pointer-events-none absolute inset-x-0 h-px" style={{ top: windowTop, ...edgeStyle }} />
            <div
              className="pointer-events-none absolute inset-x-0 h-px"
              style={{ top: `calc(${windowBottom} - 1px)`, ...edgeStyle }}
            />
          </div>
        )}

        {countdown !== null && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-9xl font-bold opacity-80">
            {countdown}
          </div>
        )}

        {script && tokens.words.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center" onPointerDown={(e) => e.stopPropagation()}>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Nothing to read aloud</EmptyTitle>
                <EmptyDescription>Spoken-only hides every word of this Script.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => updateSetting('spokenOnly', false)}>Turn off Spoken-only</Button>
              </EmptyContent>
            </Empty>
          </div>
        )}

        {isNil(script) && (
          <div className="absolute inset-0 flex items-center justify-center" onPointerDown={(e) => e.stopPropagation()}>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No Script yet</EmptyTitle>
                <EmptyDescription>Write or paste your Script in the Editor, or send one with tp send.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={openEditor}>
                  <SquarePen data-icon="inline-start" />
                  Open the Editor
                </Button>
              </EmptyContent>
            </Empty>
          </div>
        )}

        <FollowStatusLine status={follow} />

        {connected === false && (
          <p role="status" className="pointer-events-none absolute left-3 top-3 text-xs opacity-60">
            Not connected to server
          </p>
        )}

        <div onPointerDown={(e) => e.stopPropagation()}>
          <ControlBar
            visible={!playing || recentMouse}
            playing={playing || playback.mode.kind === 'countdown'}
            scrollMode={settings.scrollMode}
            speedWpm={settings.speedWpm}
            fontSize={settings.fontSize}
            hasScript={script !== null}
            onCommand={run}
          />
        </div>
      </div>
      <NudgeHud readout={readout} />
      <HelpOverlay open={helpOpen} onOpenChange={setHelpOpen} />
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} onChange={updateSetting} />
      <UndoToast notice={replaced} onUndo={undoReplace} />
    </>
  )
}

interface FollowStatusLineProps {
  status: FollowStatus
}

const FollowStatusLine = ({ status }: FollowStatusLineProps) => {
  if (status.kind === 'off') return null
  const text = status.kind === 'error' ? status.message : status.kind === 'starting' ? 'Opening the microphone…' : 'Following your voice'
  return (
    <p role="status" className="pointer-events-none absolute right-3 top-3 max-w-md text-right text-xs opacity-60">
      {text}
    </p>
  )
}
