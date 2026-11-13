import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { streamSSE } from 'hono/streaming'
import { serveStatic } from '@hono/node-server/serve-static'
import { relative } from 'node:path'
import { PushRequestSchema, type ScriptChange } from '@teleprompter/protocol'
import { DEV_PORT, hostGuard, originGuard } from './guards.ts'
import { summarize } from './history.ts'
import type { ScriptStore } from './store.ts'

export const MAX_BODY_BYTES = 2 * 1024 * 1024
const HEARTBEAT_MS = 15_000

export interface AppOptions {
  store: ScriptStore
  /** Ports the app is reached on. A function because port 0 is only known once listening. */
  port: () => number
  /** Built web app to serve. Without it only the API is served. */
  webDir?: string
  heartbeatMs?: number
}

export function createApp({ store, port, webDir, heartbeatMs = HEARTBEAT_MS }: AppOptions): Hono {
  const ports = () => [port(), DEV_PORT]
  const app = new Hono()

  app.use('*', hostGuard(ports), originGuard(ports))

  const api = new Hono()
  api.get('/script', (c) => c.json(store.get()))

  api.post(
    '/script',
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: 'Request body too large' }, 413),
    }),
    async (c) => {
      const body = await c.req.json().catch(() => undefined)
      const parsed = PushRequestSchema.safeParse(body)
      if (!parsed.success) {
        const issues = parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
        return c.json({ error: 'Invalid request', issues }, 400)
      }
      return c.json(store.change(parsed.data).script)
    },
  )

  api.get('/history', (c) => c.json(store.versions().map(summarize)))

  api.get('/history/:id', (c) => {
    const version = store.version(c.req.param('id'))
    return version ? c.json(version) : c.json({ error: 'No such Version' }, 404)
  })

  api.post('/history/:id/restore', (c) => {
    const change = store.restore(c.req.param('id'))
    return change ? c.json(change.script) : c.json({ error: 'No such Version' }, 404)
  })

  api.get('/events', (c) =>
    streamSSE(c, async (stream) => {
      const send = (event: string, value: unknown) =>
        stream.writeSSE({ event, data: JSON.stringify(value) }).catch(() => {})
      // Subscribe in the same tick as the snapshot so no change falls between them.
      const unsubscribe = store.subscribe((change: ScriptChange) => void send('change', change))
      const heartbeat = setInterval(() => void stream.write(': keep-alive\n\n').catch(() => {}), heartbeatMs)
      const closed = new Promise<void>((resolve) => stream.onAbort(resolve))
      void send('script', store.get())
      await closed
      clearInterval(heartbeat)
      unsubscribe()
    }),
  )

  api.all('*', (c) => c.json({ error: 'Not found' }, 404))
  app.route('/api', api)

  if (webDir) {
    // serveStatic resolves its root against the working directory.
    const root = relative(process.cwd(), webDir) || '.'
    app.use('*', serveStatic({ root }))
    app.get('*', serveStatic({ root, rewriteRequestPath: () => '/index.html' }))
  }

  return app
}
