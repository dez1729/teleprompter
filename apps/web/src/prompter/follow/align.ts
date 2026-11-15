import { normalizeWord } from "@teleprompter/protocol";

/** How far behind the reader's position a match may land, in words, for when they go back and read a line again. */
export const BEHIND = 12;
/** The Lookahead window: how far ahead of the reader's position Follow searches, in words. */
export const LOOKAHEAD = 60;
/** Only the most recent heard words matter; older ones were matched by earlier clips. */
const HEARD_LIMIT = 16;

const MATCH = 2;
const MISMATCH = -1;
const GAP = -1;
/** About three matching words. One common word such as "the" must not move the reader. */
export const MIN_SCORE = 5;
/** Two words in a row, enough just after the reader's position, where they are expected to go on. */
const NEAR_MIN_SCORE = 4;
/** How far after the reader's position a match counts as near. */
const NEAR_WORDS = 4;
/** About five words in a row: enough to believe a match anywhere in the Script, far from the reader. */
export const FAR_MIN_SCORE = 9;
/** Breaks ties between equally good matches in favor of the one nearest the reader. */
const DISTANCE_COST = 0.01;

export const heardWords = (text: string): string[] => {
  return text.split(/\s+/).map(normalizeWord).filter(Boolean);
};

/** One letter wrong, missing or extra, in a word long enough that it is still that word. */
const similar = (a: string, b: string): boolean => {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return Math.max(a.length, b.length) - i - j <= 1;
};

/**
 * Where the reader is after saying `heard`: the index just past the last Script word that the heard words match.
 * It searches from BEHIND words before `from` to LOOKAHEAD words after it, then, for a reader who jumped further,
 * the whole Script with a stricter bar. Null when nothing matches well enough. `script` and `heard` are normalized.
 */
export const align = (script: readonly string[], heard: readonly string[], from: number): number | null => {
  const said = heard.slice(-HEARD_LIMIT);
  const near = { lo: Math.max(0, Math.floor(from) - BEHIND), hi: Math.min(script.length, Math.ceil(from) + LOOKAHEAD) };
  return (
    bestEnd(script, said, from, near, (end) => (end >= from && end - from <= NEAR_WORDS ? NEAR_MIN_SCORE : MIN_SCORE)) ??
    bestEnd(script, said, from, { lo: 0, hi: script.length }, () => FAR_MIN_SCORE)
  );
};

interface Span {
  lo: number;
  hi: number;
}

/** The best local alignment of `said` against script[lo, hi) scoring at least `needed(end)`, by its end. */
const bestEnd = (
  script: readonly string[],
  said: readonly string[],
  from: number,
  { lo, hi }: Span,
  needed: (end: number) => number
): number | null => {
  if (said.length === 0 || hi <= lo) return null;
  // previous[j] and current[j] score the best match ending at the current heard word and Script word lo + j - 1.
  const width = hi - lo + 1;
  // Two rows, swapped after each heard word: each pass rewrites every entry but the first, which stays 0.
  let previous = Array.from({ length: width }, () => 0);
  let current = Array.from({ length: width }, () => 0);
  let best: { score: number; end: number } | null = null;
  for (const word of said) {
    for (let j = 1; j < width; j++) {
      const diagonal = previous.at(j - 1)! + (similar(word, script.at(lo + j - 1)!) ? MATCH : MISMATCH);
      current[j] = Math.max(0, diagonal, previous.at(j)! + GAP, current.at(j - 1)! + GAP);
      const end = lo + j;
      // Going back is rarer than reading on, so a match behind the reader counts as farther away.
      const distance = end >= from ? end - from : (from - end) * 3;
      const score = current.at(j)! - DISTANCE_COST * distance;
      if (current.at(j)! >= needed(end) && (best === null || score > best.score)) best = { score, end };
    }

    [previous, current] = [current, previous];
  }

  return best?.end ?? null;
};
