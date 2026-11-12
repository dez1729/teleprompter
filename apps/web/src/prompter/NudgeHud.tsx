import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { NudgeReadout } from './usePrompter'

const HUD_VISIBLE_MS = 1200

export function NudgeHud({ readout }: { readout: NudgeReadout | null }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!readout) return
    setVisible(true)
    const timer = setTimeout(() => setVisible(false), HUD_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [readout])

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-20 z-20 flex justify-center transition-opacity duration-300',
        visible ? 'opacity-100' : 'opacity-0',
      )}
    >
      <span className="rounded-lg border bg-popover/90 px-3 py-1.5 text-sm text-popover-foreground tabular-nums shadow-lg backdrop-blur">
        {readout?.text}
      </span>
    </div>
  )
}
