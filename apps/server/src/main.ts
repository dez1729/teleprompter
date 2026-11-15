import { optionsFromEnv, startServer } from './index.ts'

try {
  const server = await startServer(optionsFromEnv())
  console.log(`Teleprompter listening on ${server.url}`)
} catch (error) {
  const code = (error as NodeJS.ErrnoException).code
  console.error(code === 'EADDRINUSE' ? 'That port is already in use. Set PORT to use another.' : String(error))
  process.exit(1)
}
