import { z } from "zod";

export const DEFAULT_PORT = 4747;

export const ScriptFormatSchema = z.enum(["markdown", "text"]);
export type ScriptFormat = z.infer<typeof ScriptFormatSchema>;

export const ScriptSchema = z.object({
  text: z.string(),
  format: ScriptFormatSchema,
  /** Where the text came from, such as a note title or "Claude Code". */
  source: z.string().nullable(),
  /** Increments on every change. 0 means no Script has ever been set. */
  revision: z.number().int().nonnegative(),
});

export type Script = z.infer<typeof ScriptSchema>;

export const EMPTY_SCRIPT: Script = { text: "", format: "text", source: null, revision: 0 };

/**
 * replace: Push Replace, every Prompter resets to the top, paused.
 * append: Push Append, every Prompter keeps its place.
 * edit: an Edit from the Editor, every Prompter keeps its Current line on the same words.
 */
export const ChangeKindSchema = z.enum(["replace", "append", "edit"]);
export type ChangeKind = z.infer<typeof ChangeKindSchema>;

export const ScriptChangeSchema = z.object({
  kind: ChangeKindSchema,
  script: ScriptSchema,
  /** The Version saved just before this change, which restoring undoes it. Null when none was saved. */
  previousVersionId: z.string().nullable(),
});

export type ScriptChange = z.infer<typeof ScriptChangeSchema>;

export const PushRequestSchema = z
  .object({
    kind: ChangeKindSchema,
    text: z.string(),
    format: ScriptFormatSchema.optional(),
    source: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
  // An Edit may clear the Script; a Push with nothing in it is a mistake.
  .refine((request) => request.kind === "edit" || request.text.trim() !== "", {
    path: ["text"],
    message: "text must not be empty",
  });

export type PushRequest = z.infer<typeof PushRequestSchema>;

/** How many Versions Script history keeps. */
export const HISTORY_LIMIT = 20;

/** One saved copy of the Script. `reason` is the kind of change it was saved ahead of. */
export const VersionSchema = z.object({
  id: z.string(),
  revision: z.number().int().nonnegative(),
  savedAt: z.iso.datetime(),
  text: z.string(),
  format: ScriptFormatSchema,
  source: z.string().nullable(),
  reason: ChangeKindSchema,
});

export type Version = z.infer<typeof VersionSchema>;

export const HistorySchema = z.array(VersionSchema);

export const VersionSummarySchema = VersionSchema.omit({ text: true, format: true }).extend({
  wordCount: z.number().int().nonnegative(),
  preview: z.string(),
});

export type VersionSummary = z.infer<typeof VersionSummarySchema>;

const MARKDOWN_HINT = /^(#{1,6}\s|\s*[-*+]\s|>\s|```|---\s*$)|\*\*|\[[^\]]+\]\([^)]+\)/m;

export const guessFormat = (text: string): ScriptFormat => {
  return MARKDOWN_HINT.test(text) ? "markdown" : "text";
};

/** Joins with a blank line. */
export const appendText = (text: string, addition: string): string => {
  return text.trim() === "" ? addition : `${text.replace(/\s+$/, "")}\n\n${addition}`;
};

/** A word as Follow compares it: lowercase letters and digits, so "Delivery," matches "delivery". */
export const normalizeWord = (word: string): string => {
  return word
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]/gu, "");
};

// Where a voice was in the Script, in words, and when, in ms.
export interface Heard {
  position: number;
  at: number;
}

// Points closer together in time than this say too little about the rate.
const MIN_FIT_SPAN_MS = 2000;
// One point can be a word or two off; the rate is fitted through at least this many.
const MIN_FIT_POINTS = 3;

// Words per minute, rounded: the least-squares slope through the points, so no one point decides it. Null until they
// span enough time. Follow's Speaking rate and the bench that checks it both measure with this.
export const fittedWpm = (heard: readonly Heard[]): number | null => {
  const first = heard.at(0);
  const last = heard.at(-1);
  if (first === undefined || last === undefined || heard.length < MIN_FIT_POINTS || last.at - first.at < MIN_FIT_SPAN_MS) return null;
  const meanAt = heard.reduce((sum, h) => sum + h.at, 0) / heard.length;
  const meanPosition = heard.reduce((sum, h) => sum + h.position, 0) / heard.length;
  const covariance = heard.reduce((sum, h) => sum + (h.at - meanAt) * (h.position - meanPosition), 0);
  const variance = heard.reduce((sum, h) => sum + (h.at - meanAt) ** 2, 0);
  return Math.max(0, Math.round((covariance / variance) * 60_000));
};

// The most text Read aloud asks the Narrator to speak at once. It sends a sentence or two at a time.
export const MAX_SPEAK_CHARS = 4000;

// A Kokoro voice name, such as `af_heart`, or a mix such as `af_bella+af_sky`.
export const VoiceNameSchema = z.string().regex(/^[\w.+()-]{1,100}$/);

// Text for the Narrator to speak. `speed` multiplies the voice's natural pace. Without `voice`, the server's default speaks.
export const SpeakRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(MAX_SPEAK_CHARS),
    speed: z.number().min(0.25).max(4),
    voice: VoiceNameSchema.optional(),
  })
  .strict();

export type SpeakRequest = z.infer<typeof SpeakRequestSchema>;

// The voices the Narrator has, and the one it uses when a request names none.
export const VoicesSchema = z.object({
  voices: z.array(z.string()),
  default: z.string(),
});

export type Voices = z.infer<typeof VoicesSchema>;
