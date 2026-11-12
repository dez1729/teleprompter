import type { MiddlewareHandler } from 'hono'

/** The Vite dev server's port. It proxies /api here, so its origin is the app's own in dev. */
export const DEV_PORT = 4748

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const LOOPBACK_NAMES = ['localhost', '127.0.0.1']

function allowed(ports: readonly number[]) {
  const hosts = new Set<string>()
  for (const name of LOOPBACK_NAMES) for (const port of ports) hosts.add(`${name}:${port}`)
  return hosts
}

/** Rejects a Host that is not loopback with our port, which stops DNS rebinding. */
export function hostGuard(ports: () => readonly number[]): MiddlewareHandler {
  return async (c, next) => {
    const host = c.req.header('host')?.toLowerCase()
    if (!host || !allowed(ports()).has(host)) return c.json({ error: 'Forbidden host' }, 403)
    await next()
  }
}

/**
 * Rejects state-changing requests from other web origins. A missing Origin is
 * allowed: browsers always send one on cross-site writes, while the CLI and
 * Obsidian's requestUrl send none.
 */
export function originGuard(ports: () => readonly number[]): MiddlewareHandler {
  return async (c, next) => {
    const origin = c.req.header('origin')
    if (origin !== undefined && !SAFE_METHODS.has(c.req.method)) {
      const origins = new Set([...allowed(ports())].map((host) => `http://${host}`))
      if (!origins.has(origin.toLowerCase())) return c.json({ error: 'Forbidden origin' }, 403)
    }
    await next()
  }
}
