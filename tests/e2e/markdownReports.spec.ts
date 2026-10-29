import { test, expect } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs/promises'
// @ts-expect-error shared ESM fixture
import { launchFixture } from '../../scripts/desktop-fixture.mjs'

test('Markdown report creates and exports PDF offline without Node, npm or Tectonic', async () => {
  const f = await launchFixture({ offline: true, environment: { PATH: '' } })
  try {
    await f.page.getByRole('heading', { name: 'Tạo dự án mới', exact: true }).click()
    await f.page.getByRole('radio', { name: 'Báo cáo Markdown' }).check()
    await f.page.locator('input[type="text"]').nth(0).fill('markdown-report')
    await f.page.locator('input[type="text"]').nth(1).fill(f.root)
    await f.page.getByRole('button', { name: 'Tiếp tục', exact: true }).click()
    await f.page.getByRole('button', { name: 'Tiếp tục', exact: true }).click()
    await f.page.locator('input[type="text"]').nth(0).fill('Báo cáo Deep Learning')
    await f.page.locator('input[type="text"]').nth(1).fill('Nguyễn Văn A')
    await f.page.getByRole('button', { name: 'Tạo dự án & Mở ngay', exact: true }).click()
    await expect(f.page.getByText('PDF từ Markdown', { exact: true })).toBeVisible({ timeout: 30000 })
    await expect(f.page.getByText('Trang 1 / 4', { exact: true })).toBeVisible()
    await expect(f.page.getByRole('button', { name: 'Cài bộ biên dịch', exact: true })).toHaveCount(0)
    const project = await f.page.evaluate(() =>
      window.api.projects.list().then((all) => all.find((project) => project.name === 'markdown-report')!)
    )
    expect(project.kind).toBe('markdown-report')
    expect(await f.page.evaluate((id) => window.api.process.getStatus(id), project.id)).toBeNull()
    const before = await f.page.evaluate((id) => window.api.reports.status(id), project.id)
    await f.page.locator('.monaco-editor').click({ position: { x: 160, y: 100 } })
    await f.page.keyboard.press('Control+End')
    await f.page.keyboard.type('\n\nNote: saved directly from Markdown.\n')
    await expect
      .poll(
        () => f.page.evaluate((id) => window.api.reports.status(id).then((state) => state.compiledAt || 0), project.id),
        { timeout: 30000 }
      )
      .toBeGreaterThan(before.compiledAt!)
    expect(await fs.readFile(path.join(project.path, 'main.md'), 'utf8')).toContain(
      'Note: saved directly from Markdown.'
    )
    const output = path.join(f.root, 'markdown-report.pdf')
    await f.app.evaluate(({ dialog }: any, file: string) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: file })
    }, output)
    await f.page.getByRole('button', { name: 'Xuất PDF', exact: true }).click()
    await expect(f.page.getByText(`Đã lưu PDF: ${output}`, { exact: true })).toBeVisible({ timeout: 30000 })
    await fs.mkdir('reports/exports/markdown', { recursive: true })
    const good = await fs.readFile(output)
    await fs.writeFile('reports/exports/markdown/report.pdf', good)
    await expect
      .poll(() =>
        f.page.getByLabel('Xem trước báo cáo PDF').evaluate((canvas: HTMLCanvasElement) => {
          const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
          let ink = 0
          for (let index = 0; index < pixels.length; index += 68) if (pixels[index + 3] && pixels[index] < 200) ink++
          return ink
        })
      )
      .toBeGreaterThan(20)
    await f.page.screenshot({ path: 'reports/exports/markdown/workspace.png' })
    await f.page.evaluate(() => window.api.settings.update({ editor: { autoSave: 'off' } }))
    const source = await fs.readFile(path.join(project.path, 'main.md'), 'utf8')
    await f.page.locator('.monaco-editor').click({ position: { x: 160, y: 100 } })
    await f.page.keyboard.press('Control+a')
    await f.page.keyboard.insertText(source.replace(/^title:.*$/m, 'title: ['))
    await f.page.getByRole('button', { name: 'Lưu & cập nhật PDF', exact: true }).click()
    await expect(f.page.getByRole('alert').filter({ hasText: 'chưa hợp lệ' })).toBeVisible({ timeout: 30000 })
    expect((await fs.readFile(path.join(project.path, '.studio-report/main.pdf'))).equals(good)).toBe(true)
  } finally {
    await f.close()
  }
})

test('long reports paginate contents, lists, long list items and numbered equations without clipping', async () => {
  const f = await launchFixture({ offline: true, environment: { PATH: '' } })
  try {
    await f.app.evaluate(({ app }: any) => {
      app.on('web-contents-created', (_: unknown, contents: any) => {
        const print = contents.printToPDF.bind(contents)
        contents.printToPDF = async (options: unknown) => {
          if (contents.getURL().includes('report.html')) {
            ;(globalThis as any).__reportLayout = await contents.executeJavaScript(`(() => {
              const areas = [...document.querySelectorAll('.page-content')];
              const cover = [...document.querySelector('.cover').children].filter(e => !e.classList.contains('cover-frame'));
              return {
                contentsPages: document.querySelectorAll('.contents').length,
                listPages: document.querySelectorAll('.lists').length,
                headings: document.querySelectorAll('.body-page h2').length,
                figures: document.querySelectorAll('.body-page figure').length,
                errors: document.querySelectorAll('.katex-error').length,
                overlappingEquationTags: [...document.querySelectorAll('.katex-display')].filter(e => {
                  const tag=e.querySelector('.katex-tag,.tag');
                  return tag && [...e.querySelectorAll('.katex-html>.katex-base')].some(base => base.getBoundingClientRect().right > tag.getBoundingClientRect().left - 4);
                }).length,
                overflow: areas.filter(e => e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1).length,
                coverOverlap: cover.slice(1).some((e,i) => e.getBoundingClientRect().top < cover[i].getBoundingClientRect().bottom - 1),
                targets: [...document.querySelectorAll('[data-page-target]')].every(e => e.textContent === document.getElementById(e.dataset.pageTarget)?.closest('.sheet')?.dataset.number),
                text: document.querySelector('.body-page').parentElement.innerText
              };
            })()`)
          }
          return print(options)
        }
      })
    })
    const project = await f.page.evaluate(
      (targetDir) =>
        window.api.scaffold.create({
          name: 'long-markdown',
          targetDir,
          templateId: 'dl-assignment-markdown',
          title: 'From Linear Models to Modern Sequence Models: A Comparative Study for Image Classification',
          author: 'Nguyễn Văn A'
        }),
      f.root
    )
    const metadata = (await fs.readFile(path.join(project.path, 'main.md'), 'utf8')).split('\n---')[0] + '\n---\n'
    const source =
      metadata +
      Array.from({ length: 100 }, (_, i) => `\n## Topic ${i + 1}\n\nShort paragraph ${i + 1}.\n`).join('') +
      Array.from({ length: 30 }, (_, i) => `\n![Figure caption ${i + 1}](image/figure-placeholder.svg)\n`).join('') +
      '\n- Long item with several blocks.\n\n    ' +
      Array(900).fill('LONG_ITEM').join(' ') +
      '\n\n    Continued paragraph in the same item.\n\n- Following item.\n\n' +
      '$$\n\\mathcal{D}=\\{(\\mathbf{x}_i,y_i)\\mid i=1,\\ldots,N\\},\\qquad \\mathbf{x}_i\\in\\mathcal{X}\\subseteq\\mathbb{R}^{1\\times28\\times28},\\qquad y_i\\in\\mathcal{Y}=\\{0,1,\\ldots,9\\}.\\tag{5}\n$$\n\n' +
      'Table: Long results table\n\n| A | B | C | D | E |\n| --- | --- | --- | --- | --- |\n' +
      Array.from({ length: 80 }, (_, i) => `| Row ${i + 1} | Value | 3 | 4 | 5 |`).join('\n') +
      '\n\nEND_OF_REPORT\n'
    await fs.writeFile(path.join(project.path, 'main.md'), source)
    const state = await f.page.evaluate((id) => window.api.reports.compile(id, 'main.md'), project.id)
    expect(state.state, state.error).toBe('ready')
    const qa = await f.app.evaluate(() => (globalThis as any).__reportLayout)
    expect(qa.contentsPages).toBeGreaterThan(1)
    expect(qa.listPages).toBeGreaterThan(1)
    expect(qa.headings).toBe(100)
    expect(qa.figures).toBe(30)
    expect(qa.errors).toBe(0)
    expect(qa.overlappingEquationTags).toBe(0)
    expect(qa.overflow).toBe(0)
    expect(qa.coverOverlap).toBe(false)
    expect(qa.targets).toBe(true)
    expect(qa.text.match(/LONG_ITEM/g)).toHaveLength(900)
    expect(qa.text).toContain('Row 80')
    expect(qa.text).toContain('Continued paragraph in the same item.')
    expect(qa.text).toContain('Following item.')
    expect(qa.text).toContain('END_OF_REPORT')
  } finally {
    await f.close()
  }
})
