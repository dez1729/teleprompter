import { createContext, useContext, useState, type ReactElement } from 'react'
import { Gauge, Keyboard, Mic, Minus, Pause, Play, Plus, RotateCcw, Settings, SquarePen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { tooltipFor, type Command } from './keymap'
import type { DisplaySettings } from './settings'

const TOOLTIP_DELAY_MS = 300

/** The bar's background is close to the toggle's own pressed color, so the chosen Scroll mode is filled in instead. */
const SCROLL_MODE_ITEM = 'aria-pressed:bg-primary aria-pressed:text-primary-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground'

/** The bar fades out while playing; a tooltip must not outlive it. */
const BarVisible = createContext(true)

function Hint({ command, children }: { command: Command; children: ReactElement }) {
  const barVisible = useContext(BarVisible)
  const [open, setOpen] = useState(false)
  return (
    <Tooltip open={open && barVisible} onOpenChange={setOpen}>
      <TooltipTrigger render={children} />
      <TooltipContent side="top">{tooltipFor(command)}</TooltipContent>
    </Tooltip>
  )
}

interface Props {
  visible: boolean
  /** Scrolling in either Scroll mode, or counting down to it. */
  playing: boolean
  scrollMode: DisplaySettings['scrollMode']
  speedWpm: number
  fontSize: number
  hasScript: boolean
  onCommand: (command: Command) => void
}

export function ControlBar({
  visible,
  playing,
  scrollMode,
  speedWpm,
  fontSize,
  hasScript,
  onCommand,
}: Props) {
  const toggle: Command = { type: 'toggle' }
  const switchScrollMode: Command = { type: 'switchScrollMode' }
  const follows = scrollMode === 'follow'
  const restart: Command = { type: 'restart' }
  const openEditor: Command = { type: 'openEditor' }
  const openSettings: Command = { type: 'openSettings' }
  const toggleHelp: Command = { type: 'toggleHelp' }
  return (
    <TooltipProvider delay={TOOLTIP_DELAY_MS}>
      <BarVisible.Provider value={visible}>
        <div
          className={cn(
            'fixed inset-x-0 bottom-4 z-10 flex justify-center transition-opacity duration-300',
            visible ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        >
          <div className="flex cursor-default items-center gap-1 rounded-xl border bg-popover/90 p-1.5 text-popover-foreground shadow-lg backdrop-blur">
            <Hint command={toggle}>
              <Button
                size="icon"
                disabled={!hasScript}
                aria-label={playing ? 'Pause' : 'Play'}
                onClick={() => onCommand(toggle)}
              >
                {playing ? <Pause /> : <Play />}
              </Button>
            </Hint>
            <Hint command={switchScrollMode}>
              <ToggleGroup
                variant="outline"
                size="sm"
                spacing={0}
                aria-label="Scroll mode"
                value={[scrollMode]}
                onValueChange={(next) => next[0] !== undefined && next[0] !== scrollMode && onCommand(switchScrollMode)}
              >
                <ToggleGroupItem value="auto" className={SCROLL_MODE_ITEM} aria-label="Auto: scroll at the set speed">
                  <Gauge />
                  Auto
                </ToggleGroupItem>
                <ToggleGroupItem value="follow" className={SCROLL_MODE_ITEM} aria-label="Follow: scroll as you read aloud">
                  <Mic />
                  Follow
                </ToggleGroupItem>
              </ToggleGroup>
            </Hint>
            <Hint command={restart}>
              <Button size="icon" variant="ghost" aria-label="Restart" onClick={() => onCommand(restart)}>
                <RotateCcw />
              </Button>
            </Hint>
            <Stepper label="Speed" value={`${speedWpm} wpm`} setting="speedWpm" disabled={follows} onCommand={onCommand} />
            <Stepper label="Text size" value={`${fontSize}px`} setting="fontSize" onCommand={onCommand} />
            <Hint command={openEditor}>
              <Button size="icon" variant="ghost" aria-label="Open the Editor" onClick={() => onCommand(openEditor)}>
                <SquarePen />
              </Button>
            </Hint>
            <Hint command={openSettings}>
              <Button size="icon" variant="ghost" aria-label="Display settings" onClick={() => onCommand(openSettings)}>
                <Settings />
              </Button>
            </Hint>
            <Hint command={toggleHelp}>
              <Button size="icon" variant="ghost" aria-label="Keyboard shortcuts" onClick={() => onCommand(toggleHelp)}>
                <Keyboard />
              </Button>
            </Hint>
          </div>
        </div>
      </BarVisible.Provider>
    </TooltipProvider>
  )
}

function Stepper({
  label,
  value,
  setting,
  disabled = false,
  onCommand,
}: {
  label: string
  value: string
  setting: 'speedWpm' | 'fontSize'
  /** Shown but inactive, as Speed is while Follow sets the pace. */
  disabled?: boolean
  onCommand: (command: Command) => void
}) {
  const down: Command = { type: 'nudge', setting, direction: -1 }
  const up: Command = { type: 'nudge', setting, direction: 1 }
  return (
    <div className="flex items-center">
      <Hint command={down}>
        <Button size="icon-sm" variant="ghost" disabled={disabled} aria-label={`${label} down`} onClick={() => onCommand(down)}>
          <Minus />
        </Button>
      </Hint>
      <span className={cn('min-w-16 text-center text-xs tabular-nums', disabled && 'opacity-50')} title={label}>
        {value}
      </span>
      <Hint command={up}>
        <Button size="icon-sm" variant="ghost" disabled={disabled} aria-label={`${label} up`} onClick={() => onCommand(up)}>
          <Plus />
        </Button>
      </Hint>
    </div>
  )
}
