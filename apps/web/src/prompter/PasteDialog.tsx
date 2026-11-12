import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  draft: string
  dirty: boolean
  onEdit: (text: string) => void
  onApply: () => void
  onDiscard: () => void
  onAppend: (text: string) => void
}

export function PasteDialog({ open, onOpenChange, draft, dirty, onEdit, onApply, onDiscard, onAppend }: Props) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const canApply = dirty && draft.trim() !== ''

  const apply = () => {
    if (!canApply) return
    onApply()
    onOpenChange(false)
  }

  const appendClipboard = async () => {
    setMessage(null)
    try {
      const text = await navigator.clipboard.readText()
      if (text.trim() === '') return setMessage('The clipboard is empty.')
      onAppend(text)
    } catch {
      setMessage('Could not read the clipboard. Allow clipboard access and try again.')
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setMessage(null)
        onOpenChange(next)
      }}
    >
      <DialogContent
        className="flex h-[85vh] w-[90vw] max-w-[1100px] flex-col sm:max-w-[1100px]"
        initialFocus={() => {
          textarea.current?.select()
          return textarea.current
        }}
      >
        <DialogHeader>
          <DialogTitle>Script</DialogTitle>
          <DialogDescription>
            Paste over the selection or edit, then Apply. Applying keeps your place if the words already read are
            unchanged, otherwise starts over from the top, paused.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          ref={textarea}
          value={draft}
          onChange={(event) => onEdit(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
              event.preventDefault()
              apply()
            }
          }}
          placeholder="Paste your Script here"
          className="min-h-0 flex-1 resize-none font-mono text-base leading-relaxed md:text-base"
        />
        {message && (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
        <DialogFooter className="items-center sm:justify-between">
          <span className="flex items-center gap-2 text-sm text-muted-foreground">
            {dirty && (
              <>
                <span className="size-2 rounded-full bg-amber-500" />
                Unapplied changes
              </>
            )}
          </span>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            {dirty && (
              <Button variant="ghost" onClick={onDiscard}>
                Discard
              </Button>
            )}
            <Button variant="outline" onClick={appendClipboard}>
              Append clipboard
            </Button>
            <Button disabled={!canApply} onClick={apply}>
              Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
