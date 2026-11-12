import type { NumberSettingKey } from './settings'

export type Command =
  | { type: 'toggle' }
  | { type: 'restart' }
  | { type: 'nudge'; setting: NumberSettingKey; direction: 1 | -1 }
  | { type: 'stepLine'; delta: 1 | -1 }
  | { type: 'stepParagraph'; delta: 1 | -1 }
  | { type: 'follow' }

interface Binding {
  key: string
  /** true requires Shift, false requires it released, undefined ignores it. */
  shift?: boolean
  command: Command
}

export const KEYMAP: readonly Binding[] = [
  { key: ' ', command: { type: 'toggle' } },
  { key: 'ArrowUp', command: { type: 'nudge', setting: 'speedWpm', direction: 1 } },
  { key: 'ArrowDown', command: { type: 'nudge', setting: 'speedWpm', direction: -1 } },
  { key: '+', command: { type: 'nudge', setting: 'fontSize', direction: 1 } },
  { key: '=', command: { type: 'nudge', setting: 'fontSize', direction: 1 } },
  { key: '-', command: { type: 'nudge', setting: 'fontSize', direction: -1 } },
  { key: 'Home', command: { type: 'restart' } },
  { key: ']', command: { type: 'nudge', setting: 'windowHeightLines', direction: 1 } },
  { key: '[', command: { type: 'nudge', setting: 'windowHeightLines', direction: -1 } },
  { key: 'ArrowLeft', shift: false, command: { type: 'stepLine', delta: -1 } },
  { key: 'ArrowRight', shift: false, command: { type: 'stepLine', delta: 1 } },
  { key: 'ArrowLeft', shift: true, command: { type: 'stepParagraph', delta: -1 } },
  { key: 'ArrowRight', shift: true, command: { type: 'stepParagraph', delta: 1 } },
  { key: 'f', command: { type: 'follow' } },
]

export function commandForKey(event: { key: string; shiftKey: boolean }): Command | null {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  const binding = KEYMAP.find((b) => b.key === key && (b.shift === undefined || b.shift === event.shiftKey))
  return binding?.command ?? null
}
