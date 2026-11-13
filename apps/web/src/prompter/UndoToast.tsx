import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ReplaceNotice } from './usePrompter'

const TOAST_VISIBLE_MS = 10_000

export function UndoToast({ notice, onUndo }: { notice: ReplaceNotice | null; onUndo: (notice: ReplaceNotice) => void }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    setVisible(notice !== null)
    if (!notice) return
    const timer = setTimeout(() => setVisible(false), TOAST_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  return (
    <div
      role="status"
      className={cn(
        'fixed inset-x-0 top-4 z-20 flex justify-center transition-opacity duration-300',
        visible ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
    >
      {notice && (
        <div className="flex items-center gap-2 rounded-lg border bg-popover/90 py-1.5 pr-1.5 pl-3 text-sm text-popover-foreground shadow-lg backdrop-blur">
          <span className="max-w-[60vw] truncate">{notice.text}</span>
          <Button size="sm" variant="outline" tabIndex={visible ? 0 : -1} onClick={() => onUndo(notice)}>
            Undo
          </Button>
        </div>
      )}
    </div>
  )
}
