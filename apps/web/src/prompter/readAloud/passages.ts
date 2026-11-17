import type { TokenizedScript } from "../script";

// A stretch of the Script the voice speaks in one go: words `start` up to `end`.
export interface Passage {
  start: number;
  end: number;
  text: string;
}

// Short sentences are joined, so the voice keeps its flow and the Narrator is asked less often.
export const MIN_WORDS = 8;
// A sentence longer than this is split, so the first words are heard soon.
const MAX_WORDS = 40;

// The passage that starts at the word at `from`: whole sentences up to at least `minWords`, never past the end of the
// paragraph. Null at the end of the Script.
export const passageAt = (tokens: TokenizedScript, from: number, minWords = MIN_WORDS): Passage | null => {
  const start = Math.max(0, Math.floor(from));
  if (start >= tokens.words.length) return null;
  const paragraphEnd = tokens.paragraphStarts.find((paragraph) => paragraph > start) ?? tokens.words.length;
  const limit = Math.min(paragraphEnd, start + MAX_WORDS);
  const sentenceEnd = tokens.sentenceEnds.find((end) => end >= start + minWords && end <= limit);
  const end = sentenceEnd ?? limit;
  const text = tokens.words
    .slice(start, end)
    .map((word) => word.text)
    .join(" ");
  return { start, end, text };
};
