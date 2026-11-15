import { History } from 'lucide-react'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { VersionSummary } from '@teleprompter/protocol'
import { isNil } from 'es-toolkit'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { fetchHistory, restoreVersion } from '@/lib/scriptApi'
import { relativeTime } from './relativeTime'

const REASON_LABELS: Record<VersionSummary['reason'], string> = {
  replace: 'Before a Replace',
  append: 'Before an Append',
  edit: 'Before an Edit',
}

interface HistoryMenuProps {
  revision: number
}

/** `revision` is the Script's, so the list reloads when the Script changes while the menu is open. */
export const HistoryMenu = ({ revision }: HistoryMenuProps) => {
  const [open, setOpen] = useState(false)
  // A new revision keeps the old list on screen until the new one arrives.
  const history = useQuery({ queryKey: ['history', revision], queryFn: fetchHistory, enabled: open, placeholderData: keepPreviousData })
  const restore = useMutation({ mutationFn: restoreVersion, onSuccess: () => setOpen(false) })
  const failed = history.isError || restore.isError
  const changeOpen = (next: boolean) => {
    // A failed Restore is forgotten when the menu opens again, like a failed listing.
    if (next) restore.reset()
    setOpen(next)
  }
  const versions = failed ? undefined : history.data

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="sm">
            <History data-icon="inline-start" />
            History
          </Button>
        }
      />
      <PopoverContent align="end" className="w-96">
        <PopoverHeader>
          <PopoverTitle>Script history</PopoverTitle>
          <PopoverDescription>Earlier Versions of the Script. Restoring one saves the current Script first.</PopoverDescription>
        </PopoverHeader>
        {!failed && history.isPending && <p className="text-muted-foreground">Loading…</p>}
        {failed && (
          <p role="alert" className="text-destructive">
            Could not reach the server.
          </p>
        )}
        {versions?.length === 0 && (
          <p className="text-muted-foreground">No Versions yet. One is saved before each Push and after a pause in editing.</p>
        )}
        {!isNil(versions) && versions.length > 0 && (
          <ul className="-mx-1 flex max-h-[60vh] flex-col overflow-y-auto">
            {versions.map((version) => (
              <li key={version.id} className="flex items-center gap-3 rounded-md px-1 py-2 hover:bg-muted/50">
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">
                    <time dateTime={version.savedAt} title={new Date(version.savedAt).toLocaleString()}>
                      {relativeTime(version.savedAt, Date.now())}
                    </time>
                    {` · ${REASON_LABELS[version.reason]} · ${version.wordCount} ${version.wordCount === 1 ? 'word' : 'words'}`}
                    {version.source && ` · ${version.source}`}
                  </p>
                  <p className="truncate">{version.preview}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => restore.mutate(version.id)}>
                  Restore
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
