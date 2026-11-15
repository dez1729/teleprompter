import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ReplaceNotice } from './usePrompter'
import { useShownFor } from './useShownFor'

const TOAST_VISIBLE_MS = 10_000

interface UndoToastProps {
  notice: ReplaceNotice | null
  onUndo: (notice: ReplaceNotice) => void
}

export const UndoToast = ({ notice, onUndo }: UndoToastProps) => {
  const visible = useShownFor(notice, TOAST_VISIBLE_MS)

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
