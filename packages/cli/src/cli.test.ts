import { describe, expect, it, vi } from 'vitest'
import { run, type Io } from './cli.ts'

const script = { text: 'hi', format: 'text', source: null, revision: 4 }

function setup(overrides: Partial<Io> = {}) {
  const out: string[] = []
  const err: string[] = []
  const fetchMock = vi.fn<typeof fetch>(async () => Response.json(script))
  const io: Io = {
    env: {},
    stdinIsTty: true,
    readStdin: async () => '',
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    fetch: fetchMock,
    serve: async () => {},
    ...overrides,
  }
  const body = () => JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
  return { io, out, err, fetchMock, body }
}

describe('tp send', () => {
  it('posts a Replace with the text argument to the default server', async () => {
    const { io, out, fetchMock, body } = setup()
    expect(await run(['send', '--replace', 'hello', 'world'], io)).toBe(0)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toBe('http://127.0.0.1:4747/api/script')
    expect(init?.method).toBe('POST')
    expect(body()).toEqual({ kind: 'replace', text: 'hello world' })
    expect(out).toEqual(['Replaced the Script (revision 4).'])
  })

  it('sends markdown format and the source label', async () => {
    const { io, body } = setup()
    await run(['send', '--append', '--markdown', '--source', 'My note', '# T'], io)
    expect(body()).toEqual({ kind: 'append', text: '# T', format: 'markdown', source: 'My note' })
  })

  it('reads stdin when no text is given', async () => {
    const { io, body } = setup({ stdinIsTty: false, readStdin: async () => 'from stdin\n' })
    await run(['send', '--replace'], io)
    expect(body().text).toBe('from stdin\n')
  })

  it('uses TELEPROMPTER_URL', async () => {
    const { io, fetchMock } = setup({ env: { TELEPROMPTER_URL: 'http://127.0.0.1:9000' } })
    await run(['send', '--replace', 'x'], io)
    expect(String(fetchMock.mock.calls[0]![0])).toBe('http://127.0.0.1:9000/api/script')
  })

  it('exits non-zero with a hint to run tp serve when the server is down', async () => {
    const { io, err } = setup({ fetch: async () => Promise.reject(new TypeError('fetch failed')) })
    expect(await run(['send', '--replace', 'x'], io)).toBe(1)
    expect(err.join('\n')).toContain('tp serve')
    expect(err.join('\n')).toContain('http://127.0.0.1:4747')
  })

  it('reports a rejection from the server', async () => {
    const { io, err } = setup({ fetch: async () => Response.json({ error: 'Forbidden host' }, { status: 403 }) })
    expect(await run(['send', '--replace', 'x'], io)).toBe(1)
    expect(err.join('\n')).toContain('403')
  })

  it.each([
    ['neither flag', ['send', 'x']],
    ['both flags', ['send', '--replace', '--append', 'x']],
    ['an unknown flag', ['send', '--replace', '--nope', 'x']],
    ['no text on a terminal', ['send', '--replace']],
  ])('refuses %s without calling the server', async (_name, argv) => {
    const { io, err, fetchMock } = setup()
    expect(await run(argv, io)).toBe(1)
    expect(err).not.toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('refuses blank piped text', async () => {
    const { io, fetchMock } = setup({ stdinIsTty: false, readStdin: async () => ' \n' })
    expect(await run(['send', '--replace'], io)).toBe(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('tp', () => {
  it('starts the server for serve', async () => {
    const serve = vi.fn(async () => {})
    expect(await run(['serve'], setup({ serve }).io)).toBe(0)
    expect(serve).toHaveBeenCalled()
  })

  it('rejects an unknown command', async () => {
    const { io, err } = setup()
    expect(await run(['bogus'], io)).toBe(1)
    expect(err[0]).toContain('Unknown command')
  })
})
