import { z } from 'zod'

export const DEFAULT_PORT = 4747

export const ScriptFormatSchema = z.enum(['markdown', 'text'])
export type ScriptFormat = z.infer<typeof ScriptFormatSchema>

export const ScriptSchema = z.object({
  text: z.string(),
  format: ScriptFormatSchema,
  /** Where the text came from, such as a note title or "Claude Code". */
  source: z.string().nullable(),
  /** Increments on every change. 0 means no Script has ever been set. */
  revision: z.number().int().nonnegative(),
})
export type Script = z.infer<typeof ScriptSchema>

export const EMPTY_SCRIPT: Script = { text: '', format: 'text', source: null, revision: 0 }

/**
 * replace: Push Replace, every Prompter resets to the top, paused.
 * append: Push Append, every Prompter keeps its place.
 * apply: an in-app Apply, each Prompter keeps its place if the words it has read are unchanged.
 */
export const ChangeKindSchema = z.enum(['replace', 'append', 'apply'])
export type ChangeKind = z.infer<typeof ChangeKindSchema>

export const ScriptChangeSchema = z.object({ kind: ChangeKindSchema, script: ScriptSchema })
export type ScriptChange = z.infer<typeof ScriptChangeSchema>

export const PushRequestSchema = z
  .object({
    kind: ChangeKindSchema,
    text: z.string().refine((text) => text.trim() !== '', 'text must not be empty'),
    format: ScriptFormatSchema.optional(),
    source: z.string().trim().min(1).max(200).optional(),
  })
  .strict()
export type PushRequest = z.infer<typeof PushRequestSchema>

const MARKDOWN_HINT = /^(#{1,6}\s|\s*[-*+]\s|>\s|```|---\s*$)|\*\*|\[[^\]]+\]\([^)]+\)/m

export function guessFormat(text: string): ScriptFormat {
  return MARKDOWN_HINT.test(text) ? 'markdown' : 'text'
}

/** Joins with a blank line. */
export function appendText(text: string, addition: string): string {
  return text.trim() === '' ? addition : `${text.replace(/\s+$/, '')}\n\n${addition}`
}
