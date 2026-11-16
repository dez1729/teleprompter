import { isNil } from "es-toolkit";
import { Pause, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { PopoverDescription, PopoverHeader, PopoverTitle } from "@/components/ui/popover";
import { SettingField } from "./SettingField";
import { keysOnPage, type DisplaySettings, type SettingKey } from "./settings";
import { formatDuration, remainingMs } from "./timer";

const TIMER_KEYS = keysOnPage("timer");

interface Props {
  elapsedMs: number;
  running: boolean;
  // Null when there is no Script to estimate.
  remainingWords: number | null;
  settings: DisplaySettings;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onChange: <K extends SettingKey>(key: K, value: DisplaySettings[K]) => void;
}

export const TimerPanel = ({ elapsedMs, running, remainingWords, settings, onStart, onPause, onReset, onChange }: Props) => {
  return (
    <>
      <PopoverHeader>
        <PopoverTitle>Timer</PopoverTitle>
        <PopoverDescription>
          {isNil(remainingWords)
            ? "No Script to estimate."
            : `About ${formatDuration(remainingMs(remainingWords, settings.speedWpm))} left at ${settings.speedWpm} wpm`}
        </PopoverDescription>
      </PopoverHeader>
      <p className="text-center text-4xl font-semibold tabular-nums">{formatDuration(elapsedMs)}</p>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={running ? onPause : onStart}
        >
          {running ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
          {running ? "Pause" : "Start"}
        </Button>
        <Button
          className="flex-1"
          variant="outline"
          onClick={onReset}
        >
          <RotateCcw data-icon="inline-start" />
          Reset
        </Button>
      </div>
      <FieldGroup className="pt-1">
        {TIMER_KEYS.map((key) => (
          <SettingField
            key={key}
            setting={key}
            settings={settings}
            onChange={onChange}
          />
        ))}
      </FieldGroup>
    </>
  );
};
