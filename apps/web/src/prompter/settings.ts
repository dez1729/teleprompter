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
export type Field = NumberField | ChoiceField | ColorField | BoolField

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
  fontFamily: choice('Font', 'sans', [
    { value: 'sans', label: 'Sans' },
    { value: 'serif', label: 'Serif' },
    { value: 'mono', label: 'Monospace' },
    { value: 'system', label: 'System' },
  ]),
  fontSize: num('Text size', 56, 16, 160, 2, 'px'),
  lineHeight: num('Line spacing', 1.4, 1, 2.2, 0.05),
  textColor: color('Text color', '#ffffff'),
  bgColor: color('Background', '#000000'),
  overlayOpacity: num('Dimming', 0.85, 0, 1, 0.05),
  windowHeightLines: num('Highlighted lines', 3, 1, 10, 1),
  windowPositionPct: num('Reading window position', 40, 0, 90, 1, '%'),
  columnMode: choice('Width', 'column', [
    { value: 'column', label: 'Column' },
    { value: 'full', label: 'Full width' },
  ]),
  columnWidthCh: num('Column width', 40, 15, 120, 1, 'ch'),
  marginX: num('Side margins', 32, 0, 400, 8, 'px'),
  marginTop: num('Top margin', 0, 0, 600, 8, 'px'),
  marginBottom: num('Bottom margin', 0, 0, 600, 8, 'px'),
  mirror: bool('Mirror', false),
  speedWpm: num('Speed', 140, 40, 400, 5, 'wpm'),
  countdownSec: num('Countdown', 3, 0, 10, 1, 's'),
  countdownAtStartOnly: bool('Countdown only at start', true),
} as const satisfies Record<string, Field>

export type SettingKey = keyof typeof SETTING_DEFS
export type DisplaySettings = { -readonly [K in SettingKey]: (typeof SETTING_DEFS)[K]['default'] }
export type NumberSettingKey = {
  [K in SettingKey]: (typeof SETTING_DEFS)[K] extends NumberField ? K : never
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

/** Validates untrusted persisted values: bad fields fall back to defaults, numbers are clamped. */
export function parseSettings(raw: unknown): DisplaySettings {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
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
