import { isNil } from "es-toolkit";
import { AudioLines, Eraser, Pin } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { PopoverDescription, PopoverHeader, PopoverTitle } from "@/components/ui/popover";
import { Toggle } from "@/components/ui/toggle";
import { lastWpm, rateStats, segmentsIn, shownRate, type RateHistory, type RateSegment } from "./follow/rateHistory";

// Often enough for the graph to scroll smoothly and the held rate to clear on time.
const TICK_MS = 500;
const GRAPH_WIDTH = 200;
const GRAPH_HEIGHT = 48;
// The graph's span is never narrower than this, so a steady voice does not look jagged.
const MIN_SPAN_WPM = 40;

export const speakingRateText = (wpm: number | null): string => `${wpm ?? "--"} wpm`;

// The clock the rate is read at. Listening, it ticks; stopped, it rests on the last change, so the graph and the
// held rate stay as they were when Follow stopped.
const useRateClock = (history: RateHistory, listening: boolean): number => {
  const [tick, setTick] = useState(() => performance.now());

  useEffect(() => {
    if (!listening) return;
    const interval = setInterval(() => setTick(performance.now()), TICK_MS);
    return () => clearInterval(interval);
  }, [listening]);

  const lastChange = history.at(-1)?.at ?? tick;
  return listening ? Math.max(tick, lastChange) : lastChange;
};

interface BadgeProps {
  rates: RateHistory;
  listening: boolean;
}

// The control bar's copy of the number, held after a pause the same way. It opens the panel.
export const SpeakingRateBadge = ({ rates, listening }: BadgeProps) => {
  const shown = shownRate(rates, useRateClock(rates, listening));

  return (
    <>
      <AudioLines className="opacity-60" />
      <span
        data-speaking-rate
        className={`text-xs tabular-nums ${shown.held ? "opacity-60" : ""}`}
      >
        {speakingRateText(shown.wpm)}
      </span>
    </>
  );
};

interface Props {
  rates: RateHistory;
  listening: boolean;
  windowSec: number;
  // Pinned, the panel stays open when you click the Script.
  pinned: boolean;
  onPinnedChange: (pinned: boolean) => void;
  onClear: () => void;
}

export const SpeakingRatePanel = ({ rates, listening, windowSec, pinned, onPinnedChange, onClear }: Props) => {
  const now = useRateClock(rates, listening);
  const windowMs = windowSec * 1000;
  const shown = shownRate(rates, now);
  const segments = segmentsIn(rates, now, windowMs);
  const stats = rateStats(segments);
  const last = lastWpm(rates);

  return (
    <>
      <PopoverHeader>
        <div className="flex items-center justify-between">
          <PopoverTitle>Speaking rate</PopoverTitle>
          <Toggle
            size="sm"
            aria-label="Keep the Speaking rate open"
            title={pinned ? "Pinned: stays open when you click the Script" : "Pin to keep it open"}
            pressed={pinned}
            onPressedChange={onPinnedChange}
          >
            <Pin className={pinned ? "fill-current" : undefined} />
          </Toggle>
        </div>
        <PopoverDescription>{listening ? "As Follow hears you." : "Follow is not listening."}</PopoverDescription>
      </PopoverHeader>
      <p className="flex items-baseline justify-between">
        <span
          data-speaking-rate-now
          data-held={shown.held || undefined}
          className={`text-2xl font-semibold tabular-nums ${shown.held ? "opacity-60" : ""}`}
        >
          {speakingRateText(shown.wpm)}
        </span>
        {shown.held && <span className="text-xs text-muted-foreground">paused</span>}
      </p>
      <RateGraph
        segments={segments}
        now={now}
        windowMs={windowMs}
        average={stats?.average ?? null}
      />
      <dl className="grid grid-cols-4 gap-1 text-center tabular-nums">
        <Stat
          label={`Avg ${windowSec}s`}
          value={stats?.average}
        />
        <Stat
          label="Min"
          value={stats?.min}
        />
        <Stat
          label="Max"
          value={stats?.max}
        />
        <Stat
          label="Last"
          value={last}
        />
      </dl>
      <Button
        variant="outline"
        size="sm"
        disabled={rates.length === 0}
        onClick={onClear}
      >
        <Eraser data-icon="inline-start" />
        Clear
      </Button>
    </>
  );
};

interface StatProps {
  label: string;
  value: number | null | undefined;
}

const Stat = ({ label, value }: StatProps) => (
  <div className="flex flex-col">
    <dt className="text-[10px] text-muted-foreground">{label}</dt>
    <dd className="text-sm font-medium">{value ?? "--"}</dd>
  </div>
);

interface GraphProps {
  segments: readonly RateSegment[];
  now: number;
  windowMs: number;
  average: number | null;
}

// A step line of the rate over the window, newest on the right. Quiet stretches are gaps.
const RateGraph = ({ segments, now, windowMs, average }: GraphProps) => {
  const wpms = segments.map((segment) => segment.wpm);
  const middle = wpms.length > 0 ? (Math.min(...wpms) + Math.max(...wpms)) / 2 : 0;
  const span = Math.max(MIN_SPAN_WPM, wpms.length > 0 ? (Math.max(...wpms) - Math.min(...wpms)) * 1.25 : 0);
  const x = (at: number) => ((at - (now - windowMs)) / windowMs) * GRAPH_WIDTH;
  const y = (wpm: number) => GRAPH_HEIGHT / 2 - ((wpm - middle) / span) * GRAPH_HEIGHT;

  const path = segments
    .map((segment, i) => {
      const joined = i > 0 && segments.at(i - 1)!.to === segment.from;
      return `${joined ? "L" : "M"}${x(segment.from).toFixed(1)},${y(segment.wpm).toFixed(1)} H${x(segment.to).toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${GRAPH_WIDTH} ${GRAPH_HEIGHT}`}
      preserveAspectRatio="none"
      className="h-12 w-full overflow-visible"
      role="img"
      aria-label={isNil(average) ? "Nothing heard yet" : `Graph of the last ${Math.round(windowMs / 1000)} seconds, averaging ${average} wpm`}
    >
      <line
        x1={0}
        x2={GRAPH_WIDTH}
        y1={GRAPH_HEIGHT}
        y2={GRAPH_HEIGHT}
        className="stroke-foreground/15"
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      {!isNil(average) && (
        <line
          x1={0}
          x2={GRAPH_WIDTH}
          y1={y(average)}
          y2={y(average)}
          className="stroke-muted-foreground/60"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
          strokeDasharray="3 3"
        />
      )}
      <path
        d={path}
        fill="none"
        className="stroke-foreground"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};
