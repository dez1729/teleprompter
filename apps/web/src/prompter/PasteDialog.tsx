import { useState } from 'react'
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
import type { PushMode } from './usePrompter'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  hasScript: boolean
  onPush: (text: string, mode: PushMode) => void
}

export function PasteDialog({ open, onOpenChange, hasScript, onPush }: Props) {
  const [text, setText] = useState('')

  const submit = (mode: PushMode) => {
    onPush(text, mode)
    setText('')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[85vh] w-[90vw] max-w-[1100px] flex-col sm:max-w-[1100px]">
        <DialogHeader>
          <DialogTitle>Paste a Script</DialogTitle>
          <DialogDescription>
            Replace starts over from the top, paused. Append adds to the end and keeps your place.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Paste your Script here"
          className="min-h-0 flex-1 resize-none font-mono text-base leading-relaxed md:text-base"
        />
        <DialogFooter>
          {hasScript && (
            <Button variant="outline" disabled={text.trim() === ''} onClick={() => submit('append')}>
              Append
            </Button>
          )}
          <Button disabled={text.trim() === ''} onClick={() => submit('replace')}>
            Replace
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
