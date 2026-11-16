import { isNil } from "es-toolkit";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SETTING_DEFS, type DisplaySettings, type SettingKey } from "./settings";

interface Props {
  setting: SettingKey;
  settings: DisplaySettings;
  onChange: <K extends SettingKey>(key: K, value: DisplaySettings[K]) => void;
}

// One setting as its control, label and description.
export const SettingField = ({ setting, settings, onChange }: Props) => {
  const def = SETTING_DEFS[setting];
  const value: unknown = settings[setting];
  const set = (next: unknown) => onChange(setting, next as never);
  const id = `setting-${setting}`;
  const description = <FieldDescription id={`${id}-description`}>{def.description}</FieldDescription>;
  const describedBy = `${id}-description`;
  switch (def.kind) {
    case "number":
      return (
        <Field>
          <div className="flex items-baseline justify-between">
            <FieldLabel htmlFor={id}>{def.label}</FieldLabel>
            <span className="text-sm text-muted-foreground tabular-nums">
              {value as number}
              {isNil(def.unit) ? "" : ` ${def.unit}`}
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
            onValueChange={(next) => set(Array.isArray(next) ? next.at(0) : next)}
          />
        </Field>
      );
    case "choice":
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
            onValueChange={(next) => !isNil(next.at(0)) && set(next.at(0))}
          >
            {def.options.map((option) => (
              <ToggleGroupItem
                key={option.value}
                value={option.value}
              >
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </Field>
      );
    case "color":
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
            onChange={(event) => set(event.target.value)}
            className="h-8 w-12 cursor-pointer rounded-md border border-input bg-transparent"
          />
        </Field>
      );
    case "bool":
      return (
        <Field orientation="horizontal">
          <FieldContent>
            <FieldLabel htmlFor={id}>{def.label}</FieldLabel>
            {description}
          </FieldContent>
          <Switch
            id={id}
            aria-describedby={describedBy}
            checked={value as boolean}
            onCheckedChange={(next) => set(next)}
          />
        </Field>
      );
  }
};
