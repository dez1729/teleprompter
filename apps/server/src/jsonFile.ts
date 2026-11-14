import { readFileSync, renameSync, writeFileSync } from 'node:fs'

interface Schema<T> {
  safeParse: (value: unknown) => { success: true; data: T } | { success: false }
}

/** Reads a JSON file. A missing file gives the fallback; an unreadable one is moved aside first. */
export function readJsonFile<T>(file: string, schema: Schema<T>, fallback: T): T {
  let raw: string
  try {
    raw = readFileSync(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw error
  }
  const parsed = schema.safeParse(safeJson(raw))
  if (parsed.success) return parsed.data
  // Keep the unreadable file for the user and start clean rather than refuse to run.
  renameSync(file, `${file}.corrupt-${Date.now()}`)
  console.warn(`Ignoring unreadable ${file}; moved it aside.`)
  return fallback
}

/** Temp file and rename, so a crash never leaves a half-written file. */
export function writeJsonFile(file: string, value: unknown): void {
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, JSON.stringify(value))
  renameSync(temp, file)
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return undefined
  }
}
