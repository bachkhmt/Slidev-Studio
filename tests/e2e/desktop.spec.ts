import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
// @ts-expect-error test harness is an ordinary ESM script
import { launchFixture } from '../../scripts/desktop-fixture.mjs'
test('offline Monaco loads, edits, undoes and persists the final revision on close', async () => {
  const f = await launchFixture({ offline: true })
  try {
    await f.page.getByRole('heading', { name: 'slides-30', exact: true }).click()
    const input = f.page.locator('.monaco-editor textarea').first()
    await expect(input).toBeVisible({ timeout: 15000 })
    await f.page
      .locator('.monaco-editor')
      .first()
      .click({ position: { x: 160, y: 100 } })
    await f.page.keyboard.press('Control+End')
    await f.page.keyboard.type('\nUnique final draft')
    await f.page.keyboard.press('Control+z')
    await f.page.keyboard.press('Control+y')
    await f.page.evaluate(() => window.api.settings.update({ editor: { autoSaveDelayMs: 10000 } }))
    await f.page.keyboard.type(' before-close')
    const exit = f.app.waitForEvent('close')
    await f.app.evaluate(({ BrowserWindow }: any) => BrowserWindow.getAllWindows()[0].close())
    await exit
    expect(await fs.readFile(`${f.projects[0].path}/slides.md`, 'utf8')).toContain('Unique final draft before-close')
  } finally {
    await f.close()
  }
})

async function openProject(f: any, name: string) {
  const home = f.page.getByTitle('Về màn hình chính (Home Dashboard)')
  if (await home.isVisible()) await home.click()
  await f.page.getByRole('heading', { name, exact: true }).click()
  await expect(f.page.locator('.monaco-editor .view-lines').first()).toBeVisible()
}
async function typeAtEnd(f: any, text: string) {
  await f.page
    .locator('.monaco-editor')
    .first()
    .click({ position: { x: 160, y: 100 } })
  await f.page.keyboard.press('Control+End')
  await f.page.keyboard.type(text)
}
async function guestValue(f: any, script: string) {
  return f.app.evaluate(async ({ webContents }: any, script: string) => {
    const guest = webContents.getAllWebContents().find((w: any) => w.getType() === 'webview')
    return guest ? guest.executeJavaScript(script).catch(() => null) : null
  }, script)
}
test('preview renders three navigation modes and restores its slide after restart/recompile', async () => {
  const f = await launchFixture({ offline: true })
  try {
    await openProject(f, 'slides-30')
    await expect
      .poll(() => guestValue(f, "document.querySelectorAll('.slidev-page,.slidev-slide').length"), { timeout: 30000 })
      .toBeGreaterThan(0)
    await f.page.getByTitle('Slide sau (→)').click()
    await expect.poll(() => guestValue(f, 'location.pathname')).toBe('/2')
    await f.page.getByTitle('Khởi động lại Slidev Server', { exact: true }).click()
    await expect.poll(() => guestValue(f, 'location.pathname'), { timeout: 30000 }).toBe('/2')
    await f.page
      .getByTitle('Khác Restart: buộc Vite bỏ cache và đóng gói dependency lại (--force)', { exact: true })
      .click()
    await expect.poll(() => guestValue(f, 'location.pathname'), { timeout: 30000 }).toBe('/2')
    await f.page.getByTitle('Cuộn dọc', { exact: true }).click()
    await expect.poll(() => guestValue(f, 'location.pathname')).toBe('/overview')
    await expect.poll(() => guestValue(f, "document.querySelector('main')?.style.overflowY")).toBe('auto')
    await f.page.getByTitle('Cuộn ngang', { exact: true }).click()
    await expect.poll(() => guestValue(f, "document.querySelector('main')?.style.overflowX")).toBe('auto')
    await f.page.getByTitle('Theo trang', { exact: true }).click()
    await expect.poll(() => guestValue(f, 'location.pathname')).toMatch(/^\/\d+$/)
  } finally {
    await f.close()
  }
})
test('draft, undo and view survive file/project switches while previews remain bounded', async () => {
  const f = await launchFixture({ offline: true })
  try {
    await openProject(f, 'slides-30')
    await f.page.evaluate(() => window.api.settings.update({ editor: { autoSave: 'off' } }))
    await typeAtEnd(f, '\nCached draft marker')
    await f.page.getByRole('button', { name: 'other.md', exact: true }).click()
    await expect(f.page.locator('.monaco-editor .view-lines')).toContainText('Another file')
    await f.page.getByRole('button', { name: 'slides.md', exact: true }).click()
    await expect(f.page.locator('.monaco-editor .view-lines')).toContainText('Cached draft marker')
    await f.page
      .locator('.monaco-editor')
      .first()
      .click({ position: { x: 160, y: 100 } })
    await f.page.keyboard.press('Control+z')
    await expect(f.page.locator('.monaco-editor .view-lines')).not.toContainText('Cached draft marker')
    await f.page.keyboard.press('Control+y')
    await openProject(f, 'slides-100')
    await openProject(f, 'slides-300')
    await expect.poll(() => f.page.locator('webview').count()).toBe(2)
    await f.page.getByRole('tab', { name: 'slides-30', exact: true }).click()
    await expect(f.page.locator('.monaco-editor .view-lines')).toContainText('Cached draft marker')
    expect(await fs.readFile(`${f.projects[0].path}/slides.md`, 'utf8')).not.toContain('Cached draft marker')
    await f.app.evaluate(({ dialog }: any) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
    })
  } finally {
    await f.close()
  }
})
test('cancel keeps a dirty window alive and explicit discard preserves the original file', async () => {
  const f = await launchFixture({ offline: true })
  try {
    await openProject(f, 'slides-30')
    await f.page.evaluate(() => window.api.settings.update({ editor: { autoSave: 'off' } }))
    await typeAtEnd(f, '\nDo not persist this draft')
    await f.app.evaluate(({ dialog }: any) => {
      dialog.showMessageBox = async () => ({ response: 2, checkboxChecked: false })
    })
    await f.app.evaluate(({ BrowserWindow }: any) => BrowserWindow.getAllWindows()[0].close())
    await expect(f.page.locator('.monaco-editor .view-lines')).toContainText('Do not persist this draft')
    await f.app.evaluate(({ dialog }: any) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
    })
    const closed = f.app.waitForEvent('close')
    await f.app.evaluate(({ BrowserWindow }: any) => BrowserWindow.getAllWindows()[0].close())
    await closed
    expect(await fs.readFile(`${f.projects[0].path}/slides.md`, 'utf8')).not.toContain('Do not persist this draft')
  } finally {
    await f.close()
  }
})
test('JSON and TypeScript workers load from local application files', async () => {
  const f = await launchFixture({ offline: true })
  try {
    await openProject(f, 'slides-30')
    await f.page.getByRole('button', { name: 'data.json', exact: true }).click()
    await expect.poll(() => f.page.workers().some((w: any) => w.url().includes('json.worker'))).toBe(true)
    await f.page.getByRole('button', { name: 'example.ts', exact: true }).click()
    await expect.poll(() => f.page.workers().some((w: any) => w.url().includes('ts.worker'))).toBe(true)
    expect(f.page.workers().every((w: any) => w.url().startsWith('file:') || w.url().startsWith('blob:file:'))).toBe(
      true
    )
  } finally {
    await f.close()
  }
})
test('twenty open/close cycles leave no Slidev process or preview behind', async () => {
  const f = await launchFixture({ offline: true })
  try {
    for (let i = 0; i < 20; i++) {
      await openProject(f, 'slides-30')
      await expect
        .poll(() => f.page.evaluate(() => window.api.process.getStatus('fixture-30').then((s) => s?.status)))
        .toBe('running')
      const serverPid = await f.page.evaluate(() =>
        window.api.process.getStatus('fixture-30').then((s) => (s as any)?.pid)
      )
      await f.page.getByTitle('Đóng tab này').click()
      await expect(f.page.getByRole('heading', { name: 'Slidev Studio', exact: true })).toBeVisible()
      expect(await f.page.evaluate(() => window.api.process.getStatus('fixture-30'))).toBeNull()
      expect(
        await f.app.evaluate(
          ({ webContents }: any) => webContents.getAllWebContents().filter((w: any) => w.getType() === 'webview').length
        )
      ).toBe(0)
      expect(
        await f.app.evaluate((_electron: any, pid: number) => {
          try {
            process.kill(pid, 0)
            return false
          } catch (e: any) {
            return e.code === 'ESRCH'
          }
        }, serverPid)
      ).toBe(true)
      await expect
        .poll(() =>
          f.page.evaluate(async () => {
            const module = await import((document.querySelector('script[type="module"]') as HTMLScriptElement).src)
            const values = Object.values(module) as any[]
            const cache = values.find((v) => v && typeof v.touch === 'function' && typeof v.prune === 'function')
            const store = values.find(
              (v) => v && typeof v.getSnapshot === 'function' && typeof v.appendLogs === 'function'
            )
            return { models: cache.size, subscriptions: store.listeners.size }
          })
        )
        .toEqual({ models: 0, subscriptions: 0 })
    }
  } finally {
    await f.close()
  }
})
test('large directories are lazy, virtualized and cannot follow a junction outside the project', async () => {
  const f = await launchFixture({ offline: true })
  try {
    const dir = `${f.projects[0].path}/assets`,
      outside = `${f.root}/outside`
    await fs.mkdir(dir)
    await fs.mkdir(outside)
    for (let start = 0; start < 5000; start += 100)
      await Promise.all(
        Array.from({ length: 100 }, (_, i) =>
          fs.writeFile(`${dir}/file-${String(start + i).padStart(5, '0')}.txt`, 'fixture')
        )
      )
    await fs.symlink(outside, `${f.projects[0].path}/escape`, process.platform === 'win32' ? 'junction' : 'dir')
    await openProject(f, 'slides-30')
    expect(await f.page.getByRole('button', { name: /file-\d+/ }).count()).toBe(0)
    await f.page.getByRole('button', { name: 'assets', exact: true }).click()
    await expect(f.page.getByRole('button', { name: 'file-00000.txt', exact: true })).toBeVisible()
    expect(await f.page.getByRole('button', { name: /file-\d+/ }).count()).toBeLessThan(100)
    expect(await f.page.evaluate((dir) => window.api.fs.listDirectory(dir).then((items) => items.length), dir)).toBe(
      5000
    )
    const rejected = await f.page.evaluate(
      (p) =>
        window.api.fs.listDirectory(p).then(
          () => false,
          () => true
        ),
      `${f.projects[0].path}/escape`
    )
    expect(rejected).toBe(true)
    await fs.unlink(`${f.projects[0].path}/escape`)
  } finally {
    await f.close()
  }
})
