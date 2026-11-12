import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
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

export function SettingsSheet({ open, onOpenChange, settings, onChange }: Props) {
  const set = (key: SettingKey, value: unknown) => onChange(key, value as never)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-sm">
        <SheetHeader>
          <SheetTitle>Display settings</SheetTitle>
          <SheetDescription>Saved in this browser.</SheetDescription>
        </SheetHeader>
        <FieldGroup className="px-4 pb-6">
          {(Object.entries(SETTING_DEFS) as [SettingKey, FieldDef][]).map(([key, def]) => {
            const id = `setting-${key}`
            const value = settings[key]
            switch (def.kind) {
              case 'number':
                return (
                  <Field key={key}>
                    <div className="flex items-baseline justify-between">
                      <FieldLabel htmlFor={id}>{def.label}</FieldLabel>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {value as number}
                        {def.unit ? ` ${def.unit}` : ''}
                      </span>
                    </div>
                    <Slider
                      id={id}
                      min={def.min}
                      max={def.max}
                      step={def.step}
                      value={[value as number]}
                      onValueChange={(next) => set(key, Array.isArray(next) ? next[0] : next)}
                    />
                  </Field>
                )
              case 'choice':
                return (
                  <Field key={key}>
                    <FieldLabel>{def.label}</FieldLabel>
                    <ToggleGroup
                      variant="outline"
                      spacing={0}
                      value={[value as string]}
                      onValueChange={(next) => next[0] !== undefined && set(key, next[0])}
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
                  <Field key={key} orientation="horizontal">
                    <FieldLabel htmlFor={id}>{def.label}</FieldLabel>
                    <input
                      id={id}
                      type="color"
                      value={value as string}
                      onChange={(event) => set(key, event.target.value)}
                      className="h-8 w-12 cursor-pointer rounded-md border border-input bg-transparent"
                    />
                  </Field>
                )
              case 'bool':
                return (
                  <Field key={key} orientation="horizontal">
                    <FieldLabel htmlFor={id}>{def.label}</FieldLabel>
                    <Switch id={id} checked={value as boolean} onCheckedChange={(next) => set(key, next)} />
                  </Field>
                )
            }
          })}
        </FieldGroup>
      </SheetContent>
    </Sheet>
  )
}
