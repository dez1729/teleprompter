import { parseArgs } from 'node:util'
import { CliError, defaultUrl, send } from './send.ts'

export interface Io {
  env: Record<string, string | undefined>
  stdinIsTty: boolean
  readStdin: () => Promise<string>
  out: (line: string) => void
  err: (line: string) => void
  fetch?: typeof fetch
  serve: () => Promise<void>
}

const USAGE = `Usage:
  tp serve                      Start the server.
  tp send --replace|--append [--markdown] [--source <label>] [text]
                                Push text to the Prompter. Reads stdin when no text is given.

Environment:
  TELEPROMPTER_URL   Server to send to (default ${defaultUrl}).`

const SEND_OPTIONS = {
  replace: { type: 'boolean' },
  append: { type: 'boolean' },
  markdown: { type: 'boolean' },
  source: { type: 'string' },
} as const

export async function run(argv: string[], io: Io): Promise<number> {
  const [command, ...rest] = argv
  try {
    switch (command) {
      case 'serve':
        await io.serve()
        return 0
      case 'send':
        return await runSend(rest, io)
      case undefined:
      case 'help':
      case '--help':
      case '-h':
        io.out(USAGE)
        return command === undefined ? 1 : 0
      default:
        throw new CliError(`Unknown command "${command}".\n${USAGE}`)
    }
  } catch (error) {
    if (!(error instanceof CliError)) throw error
    io.err(error.message)
    return 1
  }
}

async function runSend(args: string[], io: Io): Promise<number> {
  let parsed
  try {
    parsed = parseArgs({ args, options: SEND_OPTIONS, allowPositionals: true })
  } catch (error) {
    throw new CliError(`${(error as Error).message}\n${USAGE}`)
  }
  const { values, positionals } = parsed
  if (values.replace === values.append) throw new CliError('Pass exactly one of --replace or --append.')

  let text = positionals.join(' ')
  if (text === '') {
    if (io.stdinIsTty) throw new CliError('No text given. Pass it as an argument or pipe it in.')
    text = await io.readStdin()
  }
  if (text.trim() === '') throw new CliError('The text is empty.')

  const kind = values.replace ? 'replace' : 'append'
  const script = await send(
    { kind, text, markdown: values.markdown ?? false, source: values.source },
    { url: io.env.TELEPROMPTER_URL || defaultUrl, fetch: io.fetch },
  )
  io.out(`${kind === 'replace' ? 'Replaced' : 'Appended to'} the Script (revision ${script.revision}).`)
  return 0
}
