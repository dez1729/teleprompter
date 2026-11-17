import { isNil } from "es-toolkit";

// Where the voice was matched in the Script, and when the clip it was heard in ended.
export interface Heard {
  position: number;
  at: number;
}

/** The rate counts the matches in this much recent speech: long enough to even out one clip's edges. */
const WINDOW_MS = 10_000;
/** Matches closer together than this say too little about the rate. */
const MIN_SPAN_MS = 2000;
/** Faster than anyone reads aloud; a larger jump between matches is a skip, not speech. */
const MAX_WPM = 480;
/** A match within this many words of where the last one puts the reader is the same speech, heard early or late. */
const NEAR_WORDS = 6;

const wpmBetween = (from: Heard, to: Heard): number => ((to.position - from.position) / (to.at - from.at)) * 60_000;

// The matches to measure over once `match` is heard. Going back to reread or skipping ahead starts over.
export const withMatch = (recent: readonly Heard[], match: Heard): Heard[] => {
  const last = recent.at(-1);
  if (isNil(last)) return [match];
  const back = last.position - match.position;
  if (back > 0 && back < NEAR_WORDS) return [...recent];
  const furthest = last.position + (MAX_WPM / 60_000) * Math.max(0, match.at - last.at) + NEAR_WORDS;
  const startsOver = back > 0 || match.position > furthest;
  const kept = startsOver ? [] : recent.filter((heard) => heard.at > match.at - WINDOW_MS);
  return [...kept, match];
};

// Words per minute across the matches, rounded, or null until they span enough time.
export const speakingWpm = (recent: readonly Heard[]): number | null => {
  const first = recent.at(0);
  const last = recent.at(-1);
  if (isNil(first) || isNil(last) || last.at - first.at < MIN_SPAN_MS) return null;
  return Math.round(wpmBetween(first, last));
};
