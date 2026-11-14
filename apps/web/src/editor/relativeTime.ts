const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** How long ago a Version was saved, in the fewest words that tell Versions apart. */
export function relativeTime(savedAt: string, nowMs: number): string {
  const then = Date.parse(savedAt)
  const elapsed = nowMs - then
  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return `${Math.floor(elapsed / MINUTE)} min ago`
  if (elapsed < DAY) return `${Math.floor(elapsed / HOUR)} h ago`
  return new Date(then).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
