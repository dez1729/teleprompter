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

test('Apply in the Script dialog reaches the Prompter through the server', async ({ page }) => {
  await page.goto(url)
  await expect(page.getByText('No Script yet')).toBeVisible()
  await page.keyboard.press('p')
  await page.getByPlaceholder('Paste your Script here').fill('typed in the dialog')
  await page.keyboard.press('Control+Enter')

  await expect(page.getByText('typed in the dialog')).toBeVisible()
  expect(await (await fetch(`${url}/api/script`)).json()).toMatchObject({ text: 'typed in the dialog', revision: 1 })
})
