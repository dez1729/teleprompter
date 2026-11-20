import { isNil, maxBy, minBy, sumBy } from "es-toolkit";
import { SETTING_DEFS } from "../settings";

// From `at`, the Speaking rate was `wpm`, or nothing was heard (null), until the next change.
export interface RateChange {
  at: number;
  wpm: number | null;
}

export type RateHistory = readonly RateChange[];

// A stretch of time the Speaking rate held one value.
export interface RateSegment {
  from: number;
  to: number;
  wpm: number;
}

export interface RateStats {
  // Weighted by how long each rate lasted, so a rate heard briefly counts for little.
  average: number;
  min: number;
  max: number;
}

export interface ShownRate {
  wpm: number | null;
  // The voice went quiet and this is the rate it last had.
  held: boolean;
}

export const NO_RATES: RateHistory = [];

// The longest window the Speaking rate panel can show. Older changes are dropped.
export const MAX_WINDOW_MS = SETTING_DEFS.rateWindowSec.max * 1000;
// The last rate stays up this long after the voice goes quiet.
export const HOLD_MS = 5000;

export const withRate = (history: RateHistory, wpm: number | null, at: number): RateHistory => {
  if (history.length > 0 && history.at(-1)!.wpm === wpm) return history;
  // The last change before the cutoff is kept: it says what the rate was when the window starts.
  const inWindow = history.findIndex((change) => change.at > at - MAX_WINDOW_MS);
  const from = inWindow === -1 ? history.length - 1 : inWindow - 1;
  return [...history.slice(Math.max(0, from)), { at, wpm }];
};

// The history wiped at `now`. A rate still being heard carries on from there, so the number does not blank mid-sentence.
export const clearedRates = (history: RateHistory, now: number): RateHistory => {
  const wpm = history.at(-1)?.wpm;
  return isNil(wpm) ? NO_RATES : [{ at: now, wpm }];
};

// The rates heard in the `windowMs` before `now`, cut to that window.
export const segmentsIn = (history: RateHistory, now: number, windowMs: number): RateSegment[] =>
  history.flatMap((change, i) => {
    const from = Math.max(change.at, now - windowMs);
    const next = history.at(i + 1);
    const to = Math.min(next?.at ?? now, now);
    // The rate heard right now counts even before any time has passed on it.
    const empty = isNil(next) ? to < from : to <= from;
    return isNil(change.wpm) || empty ? [] : [{ from, to, wpm: change.wpm }];
  });

export const rateStats = (segments: readonly RateSegment[]): RateStats | null => {
  if (segments.length === 0) return null;
  const heardMs = sumBy(segments, (segment) => segment.to - segment.from);
  const average = heardMs > 0 ? sumBy(segments, (segment) => segment.wpm * (segment.to - segment.from)) / heardMs : segments.at(-1)!.wpm;
  return {
    average: Math.round(average),
    min: minBy(segments, (segment) => segment.wpm)!.wpm,
    max: maxBy(segments, (segment) => segment.wpm)!.wpm,
  };
};

// The rate the voice had when it last went quiet or was last heard.
export const lastWpm = (history: RateHistory): number | null => history.findLast((change) => !isNil(change.wpm))?.wpm ?? null;

export const shownRate = (history: RateHistory, now: number): ShownRate => {
  const latest = history.at(-1);
  if (isNil(latest)) return { wpm: null, held: false };
  if (!isNil(latest.wpm)) return { wpm: latest.wpm, held: false };
  const last = lastWpm(history);
  return !isNil(last) && now - latest.at < HOLD_MS ? { wpm: last, held: true } : { wpm: null, held: false };
};
