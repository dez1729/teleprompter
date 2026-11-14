export interface NumberField {
  kind: 'number'
  label: string
  default: number
  min: number
  max: number
  step: number
  unit?: string
}
export interface ChoiceField<T extends string = string> {
  kind: 'choice'
  label: string
  default: T
  options: readonly { value: T; label: string }[]
}
export interface ColorField {
  kind: 'color'
  label: string
  default: string
}
export interface BoolField {
  kind: 'bool'
  label: string
  default: boolean
}
/** Shown on the Advanced settings page instead of the main one. */
interface Placement {
  advanced?: true
}
/** What the setting does, shown under its label. Every setting has one. */
interface Described {
  description: string
}
export type Field = (NumberField | ChoiceField | ColorField | BoolField) & Placement & Described

const advanced = <F extends Field>(field: F): F & { advanced: true } => ({ ...field, advanced: true })
const about = <F extends NumberField | ChoiceField | ColorField | BoolField>(description: string, field: F): F & Described => ({
  ...field,
  description,
})

const num = (label: string, def: number, min: number, max: number, step: number, unit?: string): NumberField => ({
  kind: 'number',
  label,
  default: def,
  min,
  max,
  step,
  unit,
})
const choice = <const T extends string>(
  label: string,
  def: NoInfer<T>,
  options: readonly { value: T; label: string }[],
): ChoiceField<T> => ({ kind: 'choice', label, default: def, options })
const color = (label: string, def: string): ColorField => ({ kind: 'color', label, default: def })
const bool = (label: string, def: boolean): BoolField => ({ kind: 'bool', label, default: def })

export const FONT_STACKS = {
  sans: 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  serif: 'Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "Cascadia Mono", Menlo, Consolas, monospace',
  system: 'system-ui, sans-serif',
} as const

export const SETTING_DEFS = {
  scrollMode: about(
    'Auto scrolls at the set Speed. Follow listens and scrolls as you read aloud.',
    choice('Scroll mode', 'auto', [
      { value: 'auto', label: 'Auto' },
      { value: 'follow', label: 'Follow' },
    ]),
  ),
  spokenOnly: about(
    "Hides what you don't say in a markdown Script: headings, italic stage directions, code, tables, comments and frontmatter.",
    bool('Spoken-only', true),
  ),
  fontFamily: about(
    'The typeface of the Script.',
    choice('Font', 'sans', [
      { value: 'sans', label: 'Sans' },
      { value: 'serif', label: 'Serif' },
      { value: 'mono', label: 'Monospace' },
      { value: 'system', label: 'System' },
    ]),
  ),
  fontSize: about("The size of the Script's text.", num('Text size', 56, 16, 160, 2, 'px')),
  lineHeight: about('The space between lines, as a multiple of the text size.', num('Line spacing', 1.4, 1, 2.2, 0.05)),
  textColor: about("The color of the Script's text.", color('Text color', '#ffffff')),
  bgColor: about('The color behind the text.', color('Background', '#000000')),
  readWords: about('Colors the words you have already read, karaoke style.', bool('Read words', true)),
  readWordsColor: about('The color of the words you have already read.', color('Read words color', '#facc15')),
  overlayOpacity: advanced(
    about('How dark the text outside the Reading window is. At 1 it is hidden.', num('Dimming', 0.85, 0, 1, 0.05)),
  ),
  windowHeightLines: about('How many lines the Reading window keeps bright.', num('Highlighted lines', 3, 1, 10, 1)),
  windowPositionPct: about(
    'How far down the screen the Reading window sits.',
    num('Reading window position', 40, 0, 90, 1, '%'),
  ),
  columnMode: about(
    'Column keeps lines short and centered. Full width uses the whole screen.',
    choice('Width', 'column', [
      { value: 'column', label: 'Column' },
      { value: 'full', label: 'Full width' },
    ]),
  ),
  columnWidthCh: advanced(about('How wide the column is, in characters.', num('Column width', 40, 15, 120, 1, 'ch'))),
  marginX: advanced(about('Blank space on the left and right.', num('Side margins', 32, 0, 400, 8, 'px'))),
  marginTop: advanced(about('Blank space at the top of the screen.', num('Top margin', 0, 0, 600, 8, 'px'))),
  marginBottom: advanced(about('Blank space at the bottom of the screen.', num('Bottom margin', 0, 0, 600, 8, 'px'))),
  mirror: about('Flips the text left to right, for beam-splitter glass.', bool('Mirror', false)),
  speedWpm: about('How fast Auto scrolls, in words per minute. Follow ignores it.', num('Speed', 140, 40, 400, 5, 'wpm')),
  minLineSec: advanced(
    about(
      'The least time each line stays up, so a line of one or two words does not pass before you can read it.',
      num('Minimum time per line', 1.5, 0, 5, 0.25, 's'),
    ),
  ),
  paragraphPause: advanced(
    about(
      'How long the space between paragraphs takes to scroll by. Long leaves more time to breathe.',
      choice('Paragraph pause', 'normal', [
        { value: 'short', label: 'Short' },
        { value: 'normal', label: 'Normal' },
        { value: 'long', label: 'Long' },
      ]),
    ),
  ),
  countdown: about(
    'Counts down before Auto scrolls: at the start of the Script, before every play, or never.',
    choice('Countdown', 'start', [
      { value: 'start', label: 'At start' },
      { value: 'every', label: 'Every play' },
      { value: 'off', label: 'Off' },
    ]),
  ),
  countdownSec: advanced(about('How many seconds the countdown lasts.', num('Countdown length', 3, 1, 10, 1, 's'))),
} as const satisfies Record<string, Field>

/** How many times faster than a line the gap below it scrolls by, for each Paragraph pause. */
export const GAP_PACES = { short: 5, normal: 3, long: 1.5 } as const satisfies Record<DisplaySettings['paragraphPause'], number>

export type SettingKey = keyof typeof SETTING_DEFS
export type DisplaySettings = { -readonly [K in SettingKey]: (typeof SETTING_DEFS)[K]['default'] }
export type NumberSettingKey = {
  [K in SettingKey]: (typeof SETTING_DEFS)[K] extends NumberField ? K : never
}[SettingKey]

export type BoolSettingKey = {
  [K in SettingKey]: (typeof SETTING_DEFS)[K] extends BoolField ? K : never
}[SettingKey]

export const DEFAULT_SETTINGS = Object.fromEntries(
  Object.entries(SETTING_DEFS).map(([key, def]) => [key, def.default]),
) as DisplaySettings

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function snap(value: number, def: NumberField): number {
  const snapped = def.min + Math.round((value - def.min) / def.step) * def.step
  return Number(clamp(snapped, def.min, def.max).toFixed(6))
}

function parseField(def: Field, raw: unknown): unknown {
  switch (def.kind) {
    case 'number':
      return typeof raw === 'number' && Number.isFinite(raw) ? snap(raw, def) : def.default
    case 'choice':
      return def.options.some((o) => o.value === raw) ? raw : def.default
    case 'color':
      return typeof raw === 'string' && /^#[0-9a-f]{6}$/i.test(raw) ? raw : def.default
    case 'bool':
      return typeof raw === 'boolean' ? raw : def.default
  }
}

/** Settings saved before the Countdown choice turned it off with a 0 s countdown and chose Every play with a switch. */
function migrateCountdown(record: Record<string, unknown>): Record<string, unknown> {
  if ('countdown' in record) return record
  const { countdownSec, countdownAtStartOnly, ...rest } = record
  if (countdownSec === 0) return { ...rest, countdown: 'off' }
  return { ...rest, countdownSec, countdown: countdownAtStartOnly === false ? 'every' : 'start' }
}

/** Validates untrusted persisted values: bad fields fall back to defaults, numbers are clamped. */
export function parseSettings(raw: unknown): DisplaySettings {
  const record = migrateCountdown(typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {})
  return Object.fromEntries(
    Object.entries(SETTING_DEFS).map(([key, def]) => [key, parseField(def, record[key])]),
  ) as DisplaySettings
}

export function nudgeSetting(settings: DisplaySettings, key: NumberSettingKey, direction: 1 | -1): DisplaySettings {
  const def: NumberField = SETTING_DEFS[key]
  return { ...settings, [key]: snap(settings[key] + direction * def.step, def) }
}

export function formatSettingValue(key: NumberSettingKey, value: number): string {
  const def: NumberField = SETTING_DEFS[key]
  return def.unit ? `${value} ${def.unit}` : `${value}`
}
