import { createContext, useContext, useState, type ReactElement } from 'react'
import { Keyboard, Mic, MicOff, Minus, Pause, Play, Plus, RotateCcw, Settings, SquarePen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { tooltipFor, type Command } from './keymap'

const TOOLTIP_DELAY_MS = 300

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
  playing: boolean
  following: boolean
  speedWpm: number
  fontSize: number
  hasScript: boolean
  onCommand: (command: Command) => void
}

export function ControlBar({
  visible,
  playing,
  following,
  speedWpm,
  fontSize,
  hasScript,
  onCommand,
}: Props) {
  const toggle: Command = { type: 'toggle' }
  const follow: Command = { type: 'follow' }
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
          <div className="flex items-center gap-1 rounded-xl border bg-popover/90 p-1.5 text-popover-foreground shadow-lg backdrop-blur">
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
            <Hint command={follow}>
              <Button
                size="icon"
                variant={following ? 'default' : 'ghost'}
                disabled={!hasScript}
                aria-label={following ? 'Stop following' : 'Follow your voice'}
                aria-pressed={following}
                onClick={() => onCommand(follow)}
              >
                {following ? <Mic /> : <MicOff />}
              </Button>
            </Hint>
            <Hint command={restart}>
              <Button size="icon" variant="ghost" aria-label="Restart" onClick={() => onCommand(restart)}>
                <RotateCcw />
              </Button>
            </Hint>
            <Stepper label="Speed" value={`${speedWpm} wpm`} setting="speedWpm" onCommand={onCommand} />
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
  onCommand,
}: {
  label: string
  value: string
  setting: 'speedWpm' | 'fontSize'
  onCommand: (command: Command) => void
}) {
  const down: Command = { type: 'nudge', setting, direction: -1 }
  const up: Command = { type: 'nudge', setting, direction: 1 }
  return (
    <div className="flex items-center">
      <Hint command={down}>
        <Button size="icon-sm" variant="ghost" aria-label={`${label} down`} onClick={() => onCommand(down)}>
          <Minus />
        </Button>
      </Hint>
      <span className="min-w-16 text-center text-xs tabular-nums" title={label}>
        {value}
      </span>
      <Hint command={up}>
        <Button size="icon-sm" variant="ghost" aria-label={`${label} up`} onClick={() => onCommand(up)}>
          <Plus />
        </Button>
      </Hint>
    </div>
  )
}
