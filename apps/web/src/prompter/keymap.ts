import type { NumberSettingKey } from './settings'

export type PlaybackCommand =
  | { type: 'toggle' }
  | { type: 'restart' }
  | { type: 'nudge'; setting: NumberSettingKey; direction: 1 | -1 }
  | { type: 'stepLine'; delta: 1 | -1 }
  | { type: 'stepParagraph'; delta: 1 | -1 }
  | { type: 'follow' }

/** Opens or closes UI. The Prompter owns that state, so these never reach the playback reducer. */
export type UiCommand = { type: 'openSettings' } | { type: 'openPaste' } | { type: 'toggleHelp' }

export type Command = PlaybackCommand | UiCommand

export const HELP_GROUPS = ['Playback', 'Navigation', 'Display', 'Panels'] as const
export type HelpGroup = (typeof HELP_GROUPS)[number]

interface Binding {
  key: string
  /** How the key reads in tooltips and the help overlay. */
  label: string
  /** true requires Shift, false requires it released, undefined ignores it. */
  shift?: boolean
  command: Command
  description: string
  group: HelpGroup
  /** Left out of the help overlay. */
  hidden?: boolean
}

export const KEYMAP: readonly Binding[] = [
  { key: ' ', label: 'Space', command: { type: 'toggle' }, description: 'Play / pause', group: 'Playback' },
  { key: 'Home', label: 'Home', command: { type: 'restart' }, description: 'Restart from the top', group: 'Playback' },
  { key: 'ArrowUp', label: '↑', command: { type: 'nudge', setting: 'speedWpm', direction: 1 }, description: 'Speed up', group: 'Playback' },
  { key: 'ArrowDown', label: '↓', command: { type: 'nudge', setting: 'speedWpm', direction: -1 }, description: 'Slow down', group: 'Playback' },
  { key: 'ArrowLeft', label: '←', shift: false, command: { type: 'stepLine', delta: -1 }, description: 'Back one line', group: 'Navigation' },
  { key: 'ArrowRight', label: '→', shift: false, command: { type: 'stepLine', delta: 1 }, description: 'Forward one line', group: 'Navigation' },
  { key: 'ArrowLeft', label: 'Shift ←', shift: true, command: { type: 'stepParagraph', delta: -1 }, description: 'Back one paragraph', group: 'Navigation' },
  { key: 'ArrowRight', label: 'Shift →', shift: true, command: { type: 'stepParagraph', delta: 1 }, description: 'Forward one paragraph', group: 'Navigation' },
  { key: '+', label: '+', command: { type: 'nudge', setting: 'fontSize', direction: 1 }, description: 'Larger text', group: 'Display' },
  { key: '=', label: '=', command: { type: 'nudge', setting: 'fontSize', direction: 1 }, description: 'Larger text', group: 'Display' },
  { key: '-', label: '-', command: { type: 'nudge', setting: 'fontSize', direction: -1 }, description: 'Smaller text', group: 'Display' },
  { key: ']', label: ']', command: { type: 'nudge', setting: 'windowHeightLines', direction: 1 }, description: 'Taller Reading window', group: 'Display' },
  { key: '[', label: '[', command: { type: 'nudge', setting: 'windowHeightLines', direction: -1 }, description: 'Shorter Reading window', group: 'Display' },
  { key: 'f', label: 'F', command: { type: 'follow' }, description: 'Follow', group: 'Playback', hidden: true },
  { key: ',', label: ',', command: { type: 'openSettings' }, description: 'Display settings', group: 'Panels' },
  { key: 'p', label: 'P', command: { type: 'openPaste' }, description: 'Paste a Script', group: 'Panels' },
  { key: '?', label: '?', shift: true, command: { type: 'toggleHelp' }, description: 'Keyboard shortcuts', group: 'Panels' },
]

export function commandForKey(event: { key: string; shiftKey: boolean }): Command | null {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
  const binding = KEYMAP.find((b) => b.key === key && (b.shift === undefined || b.shift === event.shiftKey))
  return binding?.command ?? null
}

const sameCommand = (a: Command, b: Command) => JSON.stringify(a) === JSON.stringify(b)

/** The keys bound to a command, as one display string such as "+ / =". */
export function shortcutFor(command: Command): string | null {
  const labels = KEYMAP.filter((b) => sameCommand(b.command, command)).map((b) => b.label)
  return labels.length > 0 ? labels.join(' / ') : null
}

/** Tooltip text for a control that runs a command, e.g. "Play / pause (Space)". */
export function tooltipFor(command: Command): string {
  const description = KEYMAP.find((b) => sameCommand(b.command, command))?.description ?? ''
  const shortcut = shortcutFor(command)
  return shortcut ? `${description} (${shortcut})` : description
}

export interface HelpRow {
  keys: string
  description: string
}

/** The help overlay's content: one row per command, in KEYMAP order, within each group. */
export function helpRows(): { group: HelpGroup; rows: HelpRow[] }[] {
  const byCommand = new Map<string, HelpRow & { group: HelpGroup }>()
  for (const binding of KEYMAP) {
    if (binding.hidden) continue
    const id = JSON.stringify(binding.command)
    const existing = byCommand.get(id)
    if (existing) existing.keys += ` / ${binding.label}`
    else byCommand.set(id, { keys: binding.label, description: binding.description, group: binding.group })
  }
  return HELP_GROUPS.map((group) => ({
    group,
    rows: [...byCommand.values()].filter((row) => row.group === group).map(({ keys, description }) => ({ keys, description })),
  }))
}
