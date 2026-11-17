import { fittedWpm, type Heard } from "@teleprompter/protocol";
import { isNil } from "es-toolkit";

// Faster than anyone reads aloud, in words per ms. A larger jump between matches is a skip, not speech.
export const MAX_PACE = 8 / 1000;
// The rate counts the matches in this much recent speech: long enough to even out one clip's edges.
const WINDOW_MS = 10_000;
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
  if (stretch.quietSince === null) return { ...stretch, quietSince: now };
  const ended = stretch.heard.length > 0 && now - stretch.quietSince >= STRETCH_GAP_MS;
  return ended ? { ...stretch, heard: [] } : stretch;
};

// Words per minute across the stretch's matches, where the voice was matched and when the clip it was heard in
// ended, or null until they span enough time.
export const speakingWpm = ({ heard }: Stretch): number | null => fittedWpm(heard);
