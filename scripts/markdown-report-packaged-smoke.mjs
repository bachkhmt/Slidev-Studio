import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { expect } from '@playwright/test'
import { launchFixture } from './desktop-fixture.mjs'

const executablePath = path.resolve(process.argv[2] || 'dist/markdown-report-preview/win-unpacked/Slidev Studio.exe')
const f = await launchFixture({ executablePath, environment: { PATH: '' } })
try {
  assert.equal(await f.app.evaluate(({ app }) => app.isPackaged), true)
  const registry = await f.page.evaluate(() => window.api.projects.list())
  assert.ok(registry.every((project) => project.path.startsWith(f.root)))
  await f.app.evaluate(({ session }) =>
    session.defaultSession.webRequest.onBeforeRequest((request, callback) => {
      callback({ cancel: ['http:', 'https:'].includes(new URL(request.url).protocol) })
    })
  )
  const project = await f.page.evaluate(
    (targetDir) =>
      window.api.scaffold.create({
        name: 'markdown-report',
        templateId: 'dl-assignment-markdown',
        targetDir,
        title: 'Báo cáo Deep Learning',
        author: 'Nguyễn Văn A'
      }),
    f.root
  )
  await f.page.reload()
  await f.page.getByRole('heading', { name: 'markdown-report', exact: true }).click()
  await expect(f.page.getByText('PDF từ Markdown', { exact: true })).toBeVisible({ timeout: 30000 })
  await expect(f.page.getByText('Trang 1 / 4', { exact: true })).toBeVisible()
  assert.equal(await f.page.getByRole('button', { name: 'Cài bộ biên dịch', exact: true }).count(), 0)
  assert.equal(await f.page.evaluate((id) => window.api.process.getStatus(id), project.id), null)
  await expect
    .poll(() =>
      f.page.getByLabel('Xem trước báo cáo PDF').evaluate((canvas) => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data
        let ink = 0
        for (let index = 0; index < pixels.length; index += 68) if (pixels[index + 3] && pixels[index] < 200) ink++
        return ink
      })
    )
    .toBeGreaterThan(20)
  await fs.mkdir('reports/exports/markdown', { recursive: true })
  await fs.copyFile(path.join(project.path, '.studio-report/main.pdf'), 'reports/exports/markdown/packaged-report.pdf')
  await f.page.screenshot({ path: 'reports/exports/markdown/packaged-workspace.png' })
  const longReport =
    (await fs.readFile(path.join(project.path, 'main.md'), 'utf8')) +
    '\n\n' +
    Array.from({ length: 2500 }, () => 'Long paragraph content.').join(' ') +
    '\n\nLong paragraph ends here.\n\nTable: Large table\n\n| Row | Value |\n| --- | --- |\n' +
    Array.from({ length: 160 }, (_, i) => `| Row ${i + 1} | Value ${i + 1} |`).join('\n') +
    '\n\n$$\n\\sum_{i=1}^n i = \\frac{n(n+1)}{2}\n$$\n\nEND OF REPORT\n'
  await f.page.evaluate(({ file, content }) => window.api.fs.writeFile(file, content), {
    file: path.join(project.path, 'main.md'),
    content: longReport
  })
  const state = await f.page.evaluate((id) => window.api.reports.compile(id, 'main.md'), project.id)
  assert.equal(state.state, 'ready', state.error)
  await fs.copyFile(path.join(project.path, '.studio-report/main.pdf'), 'reports/exports/markdown/long-report.pdf')
  console.log(
    JSON.stringify({
      success: true,
      packaged: true,
      markdown: true,
      externalCompiler: false,
      externalNode: false,
      network: false
    })
  )
} finally {
  await f.close()
}
