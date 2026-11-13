import { History } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { VersionSummary } from '@teleprompter/protocol'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover'
import { fetchHistory, restoreVersion } from '@/lib/scriptApi'
import { relativeTime } from './relativeTime'

const REASON_LABELS: Record<VersionSummary['reason'], string> = {
  replace: 'Before a Replace',
  append: 'Before an Append',
  edit: 'Before an Edit',
}

type Listing = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; versions: VersionSummary[] }

/** `revision` is the Script's, so the list reloads when the Script changes while the menu is open. */
export function HistoryMenu({ revision }: { revision: number }) {
  const [open, setOpen] = useState(false)
  const [listing, setListing] = useState<Listing>({ state: 'loading' })

  useEffect(() => {
    if (!open) return
    let current = true
    fetchHistory().then(
      (versions) => current && setListing({ state: 'ready', versions }),
      () => current && setListing({ state: 'failed' }),
    )
    return () => {
      current = false
    }
  }, [open, revision])

  const restore = (id: string) =>
    restoreVersion(id).then(
      () => setOpen(false),
      () => setListing({ state: 'failed' }),
    )

  return (
    <Popover open={open} onOpenChange={setOpen}>
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
        {listing.state === 'loading' && <p className="text-muted-foreground">Loading…</p>}
        {listing.state === 'failed' && (
          <p role="alert" className="text-destructive">
            Could not reach the server.
          </p>
        )}
        {listing.state === 'ready' && listing.versions.length === 0 && (
          <p className="text-muted-foreground">No Versions yet. One is saved before each Push and after a pause in editing.</p>
        )}
        {listing.state === 'ready' && listing.versions.length > 0 && (
          <ul className="-mx-1 flex max-h-[60vh] flex-col overflow-y-auto">
            {listing.versions.map((version) => (
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
                <Button variant="outline" size="sm" onClick={() => restore(version.id)}>
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
