import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { SETTING_DEFS, type DisplaySettings, type Field as FieldDef, type SettingKey } from './settings'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: DisplaySettings
  onChange: <K extends SettingKey>(key: K, value: DisplaySettings[K]) => void
}

type Page = 'main' | 'advanced'

const ENTRIES = Object.entries(SETTING_DEFS) as [SettingKey, FieldDef][]

interface FieldProps {
  setting: SettingKey
  def: FieldDef
  value: unknown
  set: (key: SettingKey, value: unknown) => void
}

const SettingField = ({ setting, def, value, set }: FieldProps) => {
  const id = `setting-${setting}`
  const description = <FieldDescription id={`${id}-description`}>{def.description}</FieldDescription>
  const describedBy = `${id}-description`
  switch (def.kind) {
    case 'number':
      return (
        <Field>
          <div className="flex items-baseline justify-between">
            <FieldLabel htmlFor={id}>{def.label}</FieldLabel>
            <span className="text-sm text-muted-foreground tabular-nums">
              {value as number}
              {def.unit ? ` ${def.unit}` : ''}
            </span>
          </div>
          {description}
          <Slider
            id={id}
            aria-describedby={describedBy}
            min={def.min}
            max={def.max}
            step={def.step}
            value={[value as number]}
            onValueChange={(next) => set(setting, Array.isArray(next) ? next.at(0) : next)}
          />
        </Field>
      )
    case 'choice':
      return (
        <Field>
          <FieldLabel>{def.label}</FieldLabel>
          {description}
          <ToggleGroup
            aria-label={def.label}
            aria-describedby={describedBy}
            variant="outline"
            spacing={0}
            value={[value as string]}
            onValueChange={(next) => next.at(0) !== undefined && set(setting, next.at(0))}
          >
            {def.options.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value}>
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      )
    case 'color':
      return (
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={id}>{def.label}</FieldLabel>
            {description}
          </FieldContent>
          <input
            id={id}
            aria-describedby={describedBy}
            type="color"
            value={value as string}
            onChange={(event) => set(setting, event.target.value)}
            className="h-8 w-12 cursor-pointer rounded-md border border-input bg-transparent"
          />
        </Field>
      )
    case 'bool':
      return (
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={id}>{def.label}</FieldLabel>
            {description}
          </FieldContent>
          <Switch id={id} aria-describedby={describedBy} checked={value as boolean} onCheckedChange={(next) => set(setting, next)} />
        </Field>
      )
  }
}

/** The main page holds the everyday settings; Advanced settings replaces it in the same panel, with Back to return. */
export const SettingsSheet = ({ open, onOpenChange, settings, onChange }: Props) => {
  const [page, setPage] = useState<Page>('main')
  const set = (key: SettingKey, value: unknown) => onChange(key, value as never)
  const advanced = page === 'advanced'
  const changeOpen = (next: boolean) => {
    if (!next) setPage('main')
    onOpenChange(next)
  }

  return (
    <Sheet open={open} onOpenChange={changeOpen}>
      <SheetContent className="overflow-y-auto sm:max-w-sm">
        <SheetHeader>
          {advanced && (
            <Button variant="ghost" size="sm" className="-ml-2 self-start" onClick={() => setPage('main')}>
              <ChevronLeft data-icon="inline-start" />
              Back
            </Button>
          )}
          <SheetTitle>{advanced ? 'Advanced settings' : 'Display settings'}</SheetTitle>
          <SheetDescription>{advanced ? 'Fine-tune pacing, margins and dimming.' : 'Saved in this browser.'}</SheetDescription>
        </SheetHeader>
        <FieldGroup className="px-4 pb-6">
          {ENTRIES.filter(([, def]) => (def.advanced ?? false) === advanced).map(([key, def]) => (
            <SettingField key={key} setting={key} def={def} value={settings[key]} set={set} />
          ))}
          {!advanced && (
            <Button variant="ghost" className="-mx-2.5 mt-3 justify-between" onClick={() => setPage('advanced')}>
              Advanced settings
              <ChevronRight data-icon="inline-end" />
            </Button>
          )}
        </FieldGroup>
      </SheetContent>
    </Sheet>
  )
}
