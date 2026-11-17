// How the voice's pace in words per minute relates to the speed the Narrator is asked for.
export interface VoicePace {
  // Words per minute at speed 1, measured from what the voice has said so far.
  wpmAtSpeedOne: number;
}

// Kokoro's default voice, measured on plain prose.
export const INITIAL_PACE: VoicePace = { wpmAtSpeedOne: 190 };

// Beyond these the voice slurs or drags.
const MIN_SPEED = 0.5;
const MAX_SPEED = 2;
// How much one passage moves the measured pace. Passages vary, so one alone is not trusted.
const LEARN = 0.5;
// A passage this short is mostly the silence around it, so it says little about the pace.
const MIN_MEASURED_WORDS = 4;

export const speedFor = (pace: VoicePace, wpm: number): number => Math.min(MAX_SPEED, Math.max(MIN_SPEED, wpm / pace.wpmAtSpeedOne));

// The pace after the voice spoke `words` words at `speed` in `seconds`.
export const measured = (pace: VoicePace, words: number, seconds: number, speed: number): VoicePace => {
  if (words < MIN_MEASURED_WORDS || seconds <= 0) return pace;
  const wpmAtSpeedOne = ((words / seconds) * 60) / speed;
  return { wpmAtSpeedOne: pace.wpmAtSpeedOne + (wpmAtSpeedOne - pace.wpmAtSpeedOne) * LEARN };
};
