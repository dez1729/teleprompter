export const PROMPTER_WINDOW = 'teleprompter-prompter'
export const EDITOR_WINDOW = 'teleprompter-editor'

/**
 * Brings the window with this name to the front, opening it at `path` if there is none.
 * Opening a URL in a named window reloads it, which would cost an open Editor its undo
 * history and an open Prompter its place, so a window that is already there is left as it is.
 */
export function openNamedWindow(path: string, name: string): void {
  const target = window.open('', name)
  if (!target) return
  let isNew: boolean
  try {
    isNew = target.location.href === 'about:blank'
  } catch {
    // The window has gone to another site, so it is ours to take back.
    isNew = true
  }
  if (isNew) target.location.replace(path)
  target.focus()
}
