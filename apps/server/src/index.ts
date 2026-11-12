import { serve } from '@hono/node-server'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_PORT } from '@teleprompter/protocol'
import { createApp } from './app.ts'
import { ScriptStore } from './store.ts'

export interface ServerOptions {
  host?: string
  port?: number
  dataDir?: string
  webDir?: string
}

export interface RunningServer {
  url: string
  port: number
  close: () => Promise<void>
}

export function defaultDataDir(env: NodeJS.ProcessEnv = process.env): string {
  if (env.TELEPROMPTER_DATA_DIR) return env.TELEPROMPTER_DATA_DIR
  return join(env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'teleprompter')
}

const BUILT_WEB_DIR = fileURLToPath(new URL('../../web/dist', import.meta.url))

export function optionsFromEnv(env: NodeJS.ProcessEnv = process.env): ServerOptions {
  return {
    host: env.HOST || '127.0.0.1',
    port: env.PORT ? Number(env.PORT) : DEFAULT_PORT,
    dataDir: defaultDataDir(env),
  }
}

export function startServer(options: ServerOptions = {}): Promise<RunningServer> {
  const { host = '127.0.0.1', port = DEFAULT_PORT, dataDir = defaultDataDir(), webDir = BUILT_WEB_DIR } = options
  const store = new ScriptStore(dataDir)
  const hasWeb = existsSync(join(webDir, 'index.html'))
  let boundPort = port
  const app = createApp({ store, port: () => boundPort, webDir: hasWeb ? webDir : undefined })

  return new Promise((resolve, reject) => {
    const server = serve({ fetch: app.fetch, hostname: host, port }, (info) => {
      boundPort = info.port
      server.off('error', reject)
      resolve({
        url: `http://${host}:${info.port}`,
        port: info.port,
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done())
            if ('closeAllConnections' in server) server.closeAllConnections()
          }),
      })
    })
    server.once('error', reject)
    if (!hasWeb) console.warn(`The web app is not built (${webDir}). Run "pnpm build" to serve it; the API still works.`)
  })
}
