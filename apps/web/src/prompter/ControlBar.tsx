import { Minus, Pause, Play, Plus, RotateCcw, ClipboardPaste, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Command } from './keymap'

interface Props {
  visible: boolean
  playing: boolean
  speedWpm: number
  fontSize: number
  hasScript: boolean
  onCommand: (command: Command) => void
  onOpenSettings: () => void
  onOpenPaste: () => void
}

export function ControlBar({
  visible,
  playing,
  speedWpm,
  fontSize,
  hasScript,
  onCommand,
  onOpenSettings,
  onOpenPaste,
}: Props) {
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-4 z-10 flex justify-center transition-opacity duration-300',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      <div className="flex items-center gap-1 rounded-xl border bg-popover/90 p-1.5 text-popover-foreground shadow-lg backdrop-blur">
        <Button
          size="icon"
          disabled={!hasScript}
          aria-label={playing ? 'Pause' : 'Play'}
          onClick={() => onCommand({ type: 'toggle' })}
        >
          {playing ? <Pause /> : <Play />}
        </Button>
        <Button size="icon" variant="ghost" aria-label="Restart" onClick={() => onCommand({ type: 'restart' })}>
          <RotateCcw />
        </Button>
        <Stepper
          label="Speed"
          value={`${speedWpm} wpm`}
          onDown={() => onCommand({ type: 'nudge', setting: 'speedWpm', direction: -1 })}
          onUp={() => onCommand({ type: 'nudge', setting: 'speedWpm', direction: 1 })}
        />
        <Stepper
          label="Text size"
          value={`${fontSize}px`}
          onDown={() => onCommand({ type: 'nudge', setting: 'fontSize', direction: -1 })}
          onUp={() => onCommand({ type: 'nudge', setting: 'fontSize', direction: 1 })}
        />
        <Button size="icon" variant="ghost" aria-label="Paste a Script" onClick={onOpenPaste}>
          <ClipboardPaste />
        </Button>
        <Button size="icon" variant="ghost" aria-label="Display settings" onClick={onOpenSettings}>
          <Settings />
        </Button>
      </div>
    </div>
  )
}

function Stepper({
  label,
  value,
  onDown,
  onUp,
}: {
  label: string
  value: string
  onDown: () => void
  onUp: () => void
}) {
  return (
    <div className="flex items-center">
      <Button size="icon-sm" variant="ghost" aria-label={`${label} down`} onClick={onDown}>
        <Minus />
      </Button>
      <span className="min-w-16 text-center text-xs tabular-nums" title={label}>
        {value}
      </span>
      <Button size="icon-sm" variant="ghost" aria-label={`${label} up`} onClick={onUp}>
        <Plus />
      </Button>
    </div>
  )
}
