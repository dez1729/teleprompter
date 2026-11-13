import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { helpRows, type HelpRow } from './keymap'

const MOUSE_ROWS: HelpRow[] = [{ keys: 'Wheel / drag', description: 'Scrub the Script (pauses)' }]

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function HelpOverlay({ open, onOpenChange }: Props) {
  const groups = [...helpRows(), { group: 'Mouse', rows: MOUSE_ROWS }]
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 items-center justify-center overflow-y-auto rounded-none bg-black/90 p-6 text-white ring-0 sm:max-w-none"
        onClick={(event) => {
          if (event.target === event.currentTarget) onOpenChange(false)
        }}
      >
        <div className="max-h-full w-full max-w-4xl">
          <DialogTitle className="text-2xl">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="mt-1 text-white/60">Press ? or Esc to close.</DialogDescription>
          <div className="mt-8 grid gap-x-16 gap-y-8 md:grid-cols-2">
            {groups.map(({ group, rows }) => (
              <section key={group}>
                <h3 className="mb-3 text-xs font-medium tracking-wider text-white/50 uppercase">{group}</h3>
                <ul className="flex flex-col gap-2">
                  {rows.map((row) => (
                    <li key={row.keys} className="flex items-center gap-3 text-sm">
                      <kbd className="min-w-14 shrink-0 rounded-md border border-white/20 bg-white/10 px-2 py-1 text-center font-mono text-xs">
                        {row.keys}
                      </kbd>
                      <span>{row.description}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
