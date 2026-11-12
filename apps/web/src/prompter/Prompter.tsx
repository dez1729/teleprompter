import { ClipboardPaste } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty'
import { ControlBar } from './ControlBar'
import { cursorToY, EMPTY_LAYOUT, measureLayout, yToCursor, type Layout } from './layout'
import { PasteDialog } from './PasteDialog'
import { ScriptText } from './ScriptText'
import { SettingsSheet } from './SettingsSheet'
import { FONT_STACKS } from './settings'
import { usePrompter } from './usePrompter'

const BAR_HIDE_DELAY_MS = 2000
const DRAG_THRESHOLD_PX = 3
const WHEEL_LINE_PX = 16

export function Prompter() {
  const { script, tokens, settings, playback, dispatch, updateSetting, push, run } = usePrompter()
  const [layout, setLayout] = useState<Layout>(EMPTY_LAYOUT)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [recentMouse, setRecentMouse] = useState(true)

  const stageRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)

  const lineHeightPx = settings.fontSize * settings.lineHeight
  const textStyle = {
    position: 'relative',
    margin: '0 auto',
    width: settings.columnMode === 'column' ? `${settings.columnWidthCh}ch` : 'calc(100% - 4rem)',
    maxWidth: '100%',
    fontFamily: FONT_STACKS[settings.fontFamily],
    fontSize: settings.fontSize,
    lineHeight: settings.lineHeight,
    textAlign: 'left',
    overflowWrap: 'break-word',
  } as const

  const remeasure = useCallback(() => {
    if (!textRef.current) return
    const next = measureLayout(textRef.current)
    setLayout(next)
    dispatch({ type: 'SET_LAYOUT', lineStarts: next.lines.map((line) => line.firstWord) })
  }, [dispatch])

  useLayoutEffect(remeasure, [
    remeasure,
    tokens,
    settings.fontSize,
    settings.lineHeight,
    settings.fontFamily,
    settings.columnMode,
    settings.columnWidthCh,
  ])

  useEffect(() => {
    const observer = new ResizeObserver(remeasure)
    if (stageRef.current) observer.observe(stageRef.current)
    if (textRef.current) observer.observe(textRef.current)
    return () => observer.disconnect()
  }, [remeasure, script])

  useEffect(() => {
    void document.fonts?.ready.then(remeasure)
  }, [remeasure, settings.fontFamily])

  const playing = playback.mode.kind === 'playing'
  useEffect(() => setRecentMouse(true), [playing])

  const showBar = () => setRecentMouse(true)
  useEffect(() => {
    if (!recentMouse || !playing) return
    const timer = setTimeout(() => setRecentMouse(false), BAR_HIDE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [recentMouse, playing])

  const scrubBy = (startCursor: number, dy: number) => {
    const y = cursorToY(layout, startCursor) + dy
    dispatch({ type: 'SCRUB', cursor: yToCursor(layout, y) })
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
    if (!current) return
    const dy = event.clientY - current.startY
    if (!current.moved && Math.abs(dy) < DRAG_THRESHOLD_PX) return
    current.moved = true
    scrubBy(current.startCursor, -dy)
  }
  const onPointerUp = () => {
    drag.current = null
  }

  const windowTop = `${settings.windowPositionPct}%`
  const windowHeight = settings.windowHeightLines * lineHeightPx
  const y = cursorToY(layout, playback.cursor)
  const overlayStyle = { backgroundColor: settings.bgColor, opacity: settings.overlayOpacity }
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
            className="absolute inset-x-0"
            style={{ top: windowTop, transform: settings.mirror ? 'scaleX(-1)' : undefined }}
          >
            <div style={{ transform: `translateY(${-y}px)`, willChange: 'transform' }}>
              <ScriptText ref={textRef} tokens={tokens} style={textStyle} />
            </div>
          </div>
        )}

        {script && (
          <>
            <div
              className="pointer-events-none absolute inset-x-0 top-0"
              style={{ ...overlayStyle, height: windowTop }}
            />
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0"
              style={{ ...overlayStyle, top: `calc(${windowTop} + ${windowHeight}px)` }}
            />
          </>
        )}

        {countdown !== null && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-9xl font-bold opacity-80">
            {countdown}
          </div>
        )}

        {!script && (
          <div className="absolute inset-0 flex items-center justify-center" onPointerDown={(e) => e.stopPropagation()}>
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No Script yet</EmptyTitle>
                <EmptyDescription>Paste your Script to start prompting.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setPasteOpen(true)}>
                  <ClipboardPaste data-icon="inline-start" />
                  Paste a Script
                </Button>
              </EmptyContent>
            </Empty>
          </div>
        )}

        <div onPointerDown={(e) => e.stopPropagation()}>
          <ControlBar
            visible={!playing || recentMouse}
            playing={playing || playback.mode.kind === 'countdown'}
            speedWpm={settings.speedWpm}
            fontSize={settings.fontSize}
            hasScript={script !== null}
            onCommand={run}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenPaste={() => setPasteOpen(true)}
          />
        </div>
      </div>
      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} settings={settings} onChange={updateSetting} />
      <PasteDialog open={pasteOpen} onOpenChange={setPasteOpen} hasScript={script !== null} onPush={push} />
    </>
  )
}
