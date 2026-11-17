import { isNil } from "es-toolkit";

// Where the voice was matched in the Script, and when the clip it was heard in ended.
export interface Heard {
  position: number;
  at: number;
}

// Faster than anyone reads aloud, in words per ms. A larger jump between matches is a skip, not speech.
export const MAX_PACE = 8 / 1000;
// The rate counts the matches in this much recent speech: long enough to even out one clip's edges.
const WINDOW_MS = 10_000;
// Matches closer together than this say too little about the rate.
const MIN_SPAN_MS = 2000;
// One clip can match a word or two off; the rate is fitted through at least this many matches.
const MIN_MATCHES = 3;
// A match within this many words of the last is the same speech, heard early or late: jitter the fit evens out.
const NEAR_WORDS = 6;
// Quiet this long, after the voice stops, ends a stretch of speech.
const STRETCH_GAP_MS = 1500;

// The current stretch of speech: its matches, and since when the voice has been quiet, if it is.
export interface Stretch {
  heard: readonly Heard[];
  quietSince: number | null;
}

export const NO_STRETCH: Stretch = { heard: [], quietSince: null };

// The stretch once `match` is heard. Going back to reread or skipping ahead starts it over.
export const withMatch = (stretch: Stretch, match: Heard): Stretch => {
  const last = stretch.heard.at(-1);
  if (isNil(last)) return { ...stretch, heard: [match] };
  const furthest = last.position + MAX_PACE * Math.max(0, match.at - last.at) + NEAR_WORDS;
  const startsOver = match.position <= last.position - NEAR_WORDS || match.position > furthest;
  const kept = startsOver ? [] : stretch.heard.filter((heard) => heard.at > match.at - WINDOW_MS);
  return { ...stretch, heard: [...kept, match] };
};

// The stretch after checking, at `now`, whether the voice is speaking. A long enough quiet ends it.
export const withVoice = (stretch: Stretch, speaking: boolean, now: number): Stretch => {
  if (speaking) return stretch.quietSince === null ? stretch : { ...stretch, quietSince: null };
  const quietSince = stretch.quietSince ?? now;
  return now - quietSince >= STRETCH_GAP_MS ? { heard: [], quietSince } : { ...stretch, quietSince };
};

// Words per minute across the stretch, rounded: the least-squares slope through its matches, so no one match decides
// it. Null until the stretch spans enough time.
export const speakingWpm = ({ heard }: Stretch): number | null => {
  const first = heard.at(0);
  const last = heard.at(-1);
  if (isNil(first) || isNil(last) || heard.length < MIN_MATCHES || last.at - first.at < MIN_SPAN_MS) return null;
  const meanAt = heard.reduce((sum, h) => sum + h.at, 0) / heard.length;
  const meanPosition = heard.reduce((sum, h) => sum + h.position, 0) / heard.length;
  const covariance = heard.reduce((sum, h) => sum + (h.at - meanAt) * (h.position - meanPosition), 0);
  const variance = heard.reduce((sum, h) => sum + (h.at - meanAt) ** 2, 0);
  return Math.max(0, Math.round((covariance / variance) * 60_000));
};
