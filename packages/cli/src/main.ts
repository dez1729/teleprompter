import { optionsFromEnv, startServer } from '@teleprompter/server'
import { run } from './cli.ts'
import { CliError } from './send.ts'

const code = await run(process.argv.slice(2), {
  env: process.env,
  stdinIsTty: process.stdin.isTTY === true,
  readStdin: async () => {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
    return Buffer.concat(chunks).toString('utf8')
  },
  out: (line) => console.log(line),
  err: (line) => console.error(line),
  serve: async () => {
    try {
      const server = await startServer(optionsFromEnv())
      console.log(`Teleprompter listening on ${server.url}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        throw new CliError('That port is already in use. Set PORT to use another.')
      }
      throw error
    }
  },
})
// `tp serve` returns once listening; the open server keeps the process alive.
if (code !== 0) process.exitCode = code
