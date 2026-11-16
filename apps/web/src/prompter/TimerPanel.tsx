import { isNil } from "es-toolkit";
import { ChevronDown, Pause, Pin, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FieldGroup } from "@/components/ui/field";
import { PopoverDescription, PopoverHeader, PopoverTitle } from "@/components/ui/popover";
import { Toggle } from "@/components/ui/toggle";
import { SettingField } from "./SettingField";
import { keysOnPage, type DisplaySettings, type SettingKey } from "./settings";
import { formatDuration, remainingMs } from "./timer";
import { useTimerReading, type TimerControls } from "./useTimer";

const TIMER_KEYS = keysOnPage("timer");

interface Props {
  timer: TimerControls;
  // Pinned, the Timer stays open when you click the Script.
  pinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
  // Null when there is no Script to estimate.
  remainingWords: number | null;
  settings: DisplaySettings;
  onChange: <K extends SettingKey>(key: K, value: DisplaySettings[K]) => void;
}

export const TimerPanel = ({ timer, pinned, onPinnedChange, remainingWords, settings, onChange }: Props) => {
  const { elapsedMs, running } = useTimerReading(timer);

  return (
    <>
      <PopoverHeader>
        <div className="flex items-center justify-between">
          <PopoverTitle>Timer</PopoverTitle>
          <Toggle
            size="sm"
            aria-label="Keep the Timer open"
            title={pinned ? "Pinned: stays open when you click the Script" : "Pin to keep it open"}
            pressed={pinned}
            onPressedChange={onPinnedChange}
          >
            <Pin className={pinned ? "fill-current" : undefined} />
          </Toggle>
        </div>
        <PopoverDescription>
          {settings.scrollMode === "follow"
            ? "Follow keeps your pace, so there is no estimate."
            : isNil(remainingWords)
              ? "No Script to estimate."
              : `About ${formatDuration(remainingMs(remainingWords, settings.speedWpm))} left at ${settings.speedWpm} wpm`}
        </PopoverDescription>
      </PopoverHeader>
      <p className="text-center text-4xl font-semibold tabular-nums">{formatDuration(elapsedMs)}</p>
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={running ? timer.pause : timer.start}
        >
          {running ? <Pause data-icon="inline-start" /> : <Play data-icon="inline-start" />}
          {running ? "Pause" : "Start"}
        </Button>
        <Button
          className="flex-1"
          variant="outline"
          onClick={timer.reset}
        >
          <RotateCcw data-icon="inline-start" />
          Reset
        </Button>
      </div>
      <Collapsible>
        <CollapsibleTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              className="group w-full justify-between"
            />
          }
        >
          Settings
          <ChevronDown
            data-icon="inline-end"
            className="transition-transform group-data-[panel-open]:rotate-180"
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <FieldGroup className="pt-3">
            {TIMER_KEYS.map((key) => (
              <SettingField
                key={key}
                setting={key}
                settings={settings}
                onChange={onChange}
              />
            ))}
          </FieldGroup>
        </CollapsibleContent>
      </Collapsible>
    </>
  );
};
