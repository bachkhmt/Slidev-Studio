import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import { launchFixture } from './desktop-fixture.mjs'

const executablePath = path.resolve(process.argv[2] || 'dist/report-preview/win-unpacked/Slidev Studio.exe')
const f = await launchFixture({ executablePath })
try {
  const packaged = await f.app.evaluate(({ app }) => app.isPackaged)
  assert.equal(packaged, true)
  const profiles = await f.page.evaluate(() => window.api.projects.list())
  assert.ok(
    profiles.every((project) => project.path.startsWith(f.root)),
    'Must use temporary project registry'
  )
  const managed = path.join(f.home, '.slidev-studio/runtimes/tectonic/0.17.0')
  await fs.mkdir(managed, { recursive: true })
  await fs.copyFile('.cache/report-runtime/tectonic.exe', path.join(managed, 'tectonic.exe'))
  await fs.cp('.cache/report-runtime/tex-cache', path.join(f.home, '.slidev-studio/latex-cache'), { recursive: true })
  await f.app.evaluate(({ session }) =>
    session.defaultSession.webRequest.onBeforeRequest((request, done) => {
      const url = new URL(request.url)
      done({
        cancel:
          ['http:', 'https:'].includes(url.protocol) && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      })
    })
  )
  const project = await f.page.evaluate(
    (targetDir) =>
      window.api.scaffold.create({
        name: 'packaged-report',
        templateId: 'dl-assignment-report',
        targetDir,
        title: 'Báo cáo Deep Learning',
        author: 'Nguyễn Văn A'
      }),
    f.root
  )
  assert.equal(project.kind, 'latex')
  await f.page.reload()
  await f.page.getByRole('heading', { name: 'packaged-report', exact: true }).click()
  await expect(f.page.getByText('Trang 1 / 4', { exact: true })).toBeVisible()
  await expect(f.page.getByRole('button', { name: 'Lưu & biên dịch', exact: true })).toBeEnabled()
  await f.page.exposeFunction('__packagedReportLog', (state) => {
    if (state.state === 'error' || state.state === 'ready') console.log(JSON.stringify(state))
  })
  await f.page.evaluate(() => window.api.reports.onChange((state) => window.__packagedReportLog(state)))
  await f.page.getByRole('button', { name: 'Lưu & biên dịch', exact: true }).click()
  await expect
    .poll(async () => (await f.page.evaluate((id) => window.api.reports.status(id), project.id)).state, {
      timeout: 60000
    })
    .toMatch(/ready|error/)
  const compiled = await f.page.evaluate((id) => window.api.reports.status(id), project.id)
  assert.equal(compiled.state, 'ready', compiled.error || compiled.logs.join('\n'))
  await expect(f.page.getByText('PDF đã biên dịch', { exact: true })).toBeVisible()
  await expect
    .poll(() => f.page.getByLabel('Xem trước báo cáo PDF').evaluate((canvas) => canvas.width))
    .toBeGreaterThan(200)
  await expect
    .poll(() =>
      f.page.getByLabel('Xem trước báo cáo PDF').evaluate((canvas) => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
        let ink = 0
        for (let index = 0; index < pixels.length; index += 68)
          if (pixels[index + 3] > 0 && pixels[index] < 200 && pixels[index + 1] < 200 && pixels[index + 2] < 200) ink++
        return ink
      })
    )
    .toBeGreaterThan(20)
  assert.equal(await f.page.evaluate((id) => window.api.process.getStatus(id), project.id), null)
  await fs.mkdir('reports/exports/latex', { recursive: true })
  await fs.copyFile(path.join(project.path, '.studio-latex/main.pdf'), 'reports/exports/latex/packaged-report.pdf')
  await f.page.screenshot({ path: 'reports/exports/latex/packaged-workspace.png' })
  console.log(
    JSON.stringify({
      success: true,
      packaged,
      projectKind: project.kind,
      reportCompiled: true,
      slidevServerStarted: false
    })
  )
} catch (error) {
  await fs.mkdir('reports/exports/latex', { recursive: true })
  await fs.writeFile('reports/exports/latex/packaged-failure.txt', await f.page.locator('body').innerText())
  await f.page.screenshot({ path: 'reports/exports/latex/packaged-failure.png' })
  throw error
} finally {
  await f.close()
}
