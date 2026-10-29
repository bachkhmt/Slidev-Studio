import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
// @ts-expect-error shared ESM fixture
import { launchFixture } from '../../scripts/desktop-fixture.mjs'

test('legacy LaTeX report opens, compiles, exports and retains its last good PDF', async () => {
  test.setTimeout(180000)
  const runtime = path.resolve('.cache/report-runtime')
  const binary = path.join(runtime, process.platform === 'win32' ? 'tectonic.exe' : 'tectonic')
  if (
    !(await fs.access(binary).then(
      () => true,
      () => false
    ))
  )
    throw new Error(
      'Run npm run test:report:prepare after building the app to install the report runtime and warm its TeX cache.'
    )
  const f = await launchFixture({
    offline: true,
    environment: {
      SLIDEV_STUDIO_TEST_TECTONIC: binary,
      SLIDEV_STUDIO_TEST_TEX_CACHE: path.join(runtime, 'tex-cache')
    }
  })
  try {
    await f.page.evaluate(
      (targetDir) =>
        window.api.scaffold.create({
          name: 'dl-report',
          targetDir,
          templateId: 'dl-assignment-report',
          title: 'Deep Learning Report',
          author: 'Nguyễn Văn A'
        }),
      f.root
    )
    await f.page.reload()
    await f.page.getByRole('heading', { name: 'dl-report', exact: true }).click()
    await expect(f.page.getByRole('button', { name: 'Lưu & biên dịch', exact: true })).toBeEnabled()
    await expect(f.page.getByText('Trang 1 / 4', { exact: true })).toBeVisible()
    await expect(f.page.getByText(/Bản xem trước của template/)).toBeVisible()
    await expect(f.page.locator('canvas[aria-label="Xem trước báo cáo PDF"]')).toBeVisible()
    await expect
      .poll(() =>
        f.page.locator('canvas[aria-label="Xem trước báo cáo PDF"]').evaluate((canvas: HTMLCanvasElement) => {
          const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
          let ink = 0
          for (let index = 0; index < pixels.length; index += 68)
            if (pixels[index + 3] > 0 && pixels[index] < 200 && pixels[index + 1] < 200 && pixels[index + 2] < 200)
              ink++
          return ink
        })
      )
      .toBeGreaterThan(20)
    const project = await f.page.evaluate(() =>
      window.api.projects.list().then((all) => all.find((item) => item.name === 'dl-report')!)
    )
    expect(project.kind).toBe('latex')
    expect(await f.page.evaluate((id) => window.api.process.getStatus(id), project.id)).toBeNull()
    expect(
      await fs.access(path.join(project.path, 'node_modules')).then(
        () => true,
        () => false
      )
    ).toBe(false)
    await f.page.evaluate(() => window.api.settings.update({ editor: { autoSave: 'off' } }))
    await f.page.getByRole('button', { name: '1-Sample Section.tex', exact: true }).click()
    await expect(f.page.locator('.monaco-editor .view-lines')).toContainText('Sample Section')
    await f.page.locator('.monaco-editor').click({ position: { x: 150, y: 100 } })
    await f.page.keyboard.press('Control+End')
    await f.page.keyboard.type('\nSaved from the report editor.\n')
    await f.page.getByRole('button', { name: 'Lưu & biên dịch', exact: true }).click()
    await expect(f.page.getByText('PDF đã biên dịch', { exact: true })).toBeVisible({ timeout: 60000 })
    expect(await fs.readFile(path.join(project.path, '1-Sample Section.tex'), 'utf8')).toContain(
      'Saved from the report editor.'
    )
    await f.page.getByTitle('Trang PDF sau').click()
    await expect(f.page.getByText('Trang 2 / 4', { exact: true })).toBeVisible()
    const destination = path.join(f.root, 'exported-report.pdf')
    await f.app.evaluate(({ dialog }: any, output: string) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: output })
    }, destination)
    await f.page.getByRole('button', { name: 'Xuất PDF', exact: true }).click()
    await expect(f.page.getByRole('status')).toContainText('Đã lưu PDF:', { timeout: 60000 })
    const good = await fs.readFile(path.join(project.path, '.studio-latex/main.pdf'))
    expect((await fs.readFile(destination)).equals(good)).toBe(true)
    await fs.mkdir('reports/exports/latex', { recursive: true })
    await fs.writeFile('reports/exports/latex/report.pdf', good)
    await f.page.getByTitle('Trang PDF trước').click()
    await expect(f.page.getByText('Trang 1 / 4', { exact: true })).toBeVisible()
    await expect
      .poll(() =>
        f.page.locator('canvas[aria-label="Xem trước báo cáo PDF"]').evaluate((canvas: HTMLCanvasElement) => {
          const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
          let ink = 0
          for (let index = 0; index < pixels.length; index += 68)
            if (pixels[index + 3] > 0 && pixels[index] < 200 && pixels[index + 1] < 200 && pixels[index + 2] < 200)
              ink++
          return ink
        })
      )
      .toBeGreaterThan(20)
    await f.page.screenshot({ path: 'reports/exports/latex/workspace.png' })
    await f.page.locator('.monaco-editor').click({ position: { x: 150, y: 100 } })
    await f.page.keyboard.press('Control+End')
    await f.page.keyboard.type('\n\\ThisCommandDoesNotExist\n')
    await f.page.getByRole('button', { name: 'Lưu & biên dịch', exact: true }).click()
    await expect(f.page.getByRole('alert').filter({ hasText: 'Undefined control sequence' })).toBeVisible({
      timeout: 60000
    })
    expect((await fs.readFile(path.join(project.path, '.studio-latex/main.pdf'))).equals(good)).toBe(true)
    await expect(f.page.getByText('PDF của lần biên dịch thành công trước.', { exact: true })).toBeVisible()
  } finally {
    await f.close()
  }
})
