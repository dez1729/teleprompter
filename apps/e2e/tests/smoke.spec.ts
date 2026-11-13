import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const TP = join(import.meta.dirname, '../../../packages/cli/bin/tp.js')

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as { port: number }
      probe.close(() => resolve(port))
    })
  })
}

let server: ChildProcess
let dataDir: string
let url: string

test.beforeEach(async () => {
  const port = await freePort()
  url = `http://127.0.0.1:${port}`
  dataDir = mkdtempSync(join(tmpdir(), 'tp-e2e-'))
  server = spawn('node', [TP, 'serve'], {
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', TELEPROMPTER_DATA_DIR: dataDir },
    stdio: 'inherit',
  })
  for (let attempt = 0; attempt < 100; attempt++) {
    if (await fetch(`${url}/api/script`).then((r) => r.ok, () => false)) return
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('The server did not start')
})

test.afterEach(() => {
  server?.kill()
  rmSync(dataDir, { recursive: true, force: true })
})

function tp(args: string[], input: string) {
  const result = spawnSync('node', [TP, ...args], {
    input,
    encoding: 'utf8',
    env: { ...process.env, TELEPROMPTER_URL: url },
  })
  expect(result.status, result.stderr).toBe(0)
}

test('a Pushed Script appears, plays and pauses', async ({ page }) => {
  await page.goto(url)
  await expect(page.getByText('No Script yet')).toBeVisible()

  tp(['send', '--replace'], 'alpha bravo charlie delta echo foxtrot')
  await expect(page.getByText('alpha')).toBeVisible()
  await expect(page.getByText('No Script yet')).toHaveCount(0)

  // Another Push reaches the open Prompter without a reload.
  tp(['send', '--append'], 'golf hotel')
  await expect(page.getByText('hotel')).toBeVisible()

  const play = page.getByRole('button', { name: /^play/i })
  await play.click()
  await expect(page.getByRole('button', { name: /^pause/i })).toBeVisible()
  await page.keyboard.press('Space')
  await expect(page.getByRole('button', { name: /^play/i })).toBeVisible()
})

test('the old browser-stored Script moves to the server once', async ({ page }) => {
  await page.goto(url)
  await expect(page.getByText('No Script yet')).toBeVisible()
  await page.evaluate(() =>
    localStorage.setItem('teleprompter.script', JSON.stringify({ source: 'kept from before', format: 'text' })),
  )
  await page.reload()

  await expect(page.getByText('kept from before')).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('teleprompter.script'))).toBeNull()
  const script = await (await fetch(`${url}/api/script`)).json()
  expect(script).toMatchObject({ text: 'kept from before', revision: 1 })
})

test('the Editor edits the Script, takes a Push, and a Replace can be undone', async ({ page }) => {
  const serverScript = async () => (await (await fetch(`${url}/api/script`)).json()) as { text: string }

  await page.goto(url)
  await expect(page.getByText('No Script yet')).toBeVisible()
  const [editor] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: 'Open the Editor' }).first().click(),
  ])
  await editor.waitForURL('**/editor')
  const document = editor.getByRole('textbox', { name: 'Script' })

  await document.click()
  await editor.keyboard.type('alpha bravo charlie')
  await expect(page.getByText('charlie')).toBeVisible()
  await expect(editor.getByRole('status')).toHaveText('Saved')
  expect(await serverScript()).toMatchObject({ text: 'alpha bravo charlie', revision: 1 })

  // A Push lands in the Editor, and undoing it there takes it out of the Prompter too.
  tp(['send', '--append'], 'delta echo')
  await expect(document).toContainText('delta echo')
  await expect(page.getByText('echo')).toBeVisible()
  await editor.keyboard.press('Control+z')
  await expect(document).not.toContainText('delta echo')
  await expect(page.getByText('echo')).toHaveCount(0)
  await expect.poll(async () => (await serverScript()).text).toBe('alpha bravo charlie')

  tp(['send', '--replace', '--source', 'My note'], 'a whole new script')
  await expect(page.getByText('whole')).toBeVisible()
  await expect(document).toContainText('a whole new script')
  await expect(editor.getByText('Source: My note')).toBeVisible()
  await expect(page.getByText('Script replaced from My note')).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText('charlie')).toBeVisible()
  await expect(page.getByText('Script restored')).toBeVisible()
  await expect(document).toContainText('alpha bravo charlie')

  // The Replace that was undone is the newest Version in Script history.
  await editor.getByRole('button', { name: 'History' }).click()
  const newest = editor.getByRole('listitem').first()
  await expect(newest).toContainText('a whole new script')
  await newest.getByRole('button', { name: 'Restore' }).click()
  await expect(document).toContainText('a whole new script')
  await expect(page.getByText('whole')).toBeVisible()
})

test('opening the Editor again reuses the open one', async ({ page, context }) => {
  await page.goto(url)
  await expect(page.getByText('No Script yet')).toBeVisible()
  const [editor] = await Promise.all([page.waitForEvent('popup'), page.keyboard.press('p')])
  await editor.waitForURL('**/editor')
  const document = editor.getByRole('textbox', { name: 'Script' })
  await document.click()
  await editor.keyboard.type('still here')
  await editor.evaluate(() => Object.assign(window, { keptAcrossOpen: true }))

  await page.bringToFront()
  await page.keyboard.press('p')
  await expect(page.getByText('still here')).toBeVisible()
  expect(context.pages()).toHaveLength(2)
  expect(await editor.evaluate(() => 'keptAcrossOpen' in window)).toBe(true)
})

test('edits left over from the old Script dialog are removed', async ({ page }) => {
  await page.goto(url)
  await page.evaluate(() => localStorage.setItem('teleprompter.draft', JSON.stringify('stale')))
  await page.reload()
  await expect(page.getByText('No Script yet')).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('teleprompter.draft'))).toBeNull()
})
