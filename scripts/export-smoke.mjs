import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { launchFixture } from './desktop-fixture.mjs'
const f = await launchFixture({ offline: true }),
  results = []
try {
  await f.page.getByRole('heading', { name: 'slides-30', exact: true }).click()
  for (const format of ['pdf', 'pptx', 'build']) {
    const started = performance.now()
    const options = {
      outputDir: path.resolve('reports/exports', format),
      outputName: `smoke-${format}`,
      range: '1-3',
      timeout: 60000
    }
    try {
      const result = await f.page.evaluate(
        ({ root, format, options }) => window.api.export.run(root, 'slides.md', format, options),
        { root: f.projects[0].path, format, options }
      )
      const stat = await fs.stat(format === 'build' ? path.join(result.outputPath, 'index.html') : result.outputPath)
      if (!stat.size) throw new Error('Empty exported file')
      if (format === 'pdf') {
        const { PDFDocument } = createRequire(path.resolve('.cache/slidev-fixture/package.json'))('pdf-lib')
        const pdf = await PDFDocument.load(await fs.readFile(result.outputPath))
        if (pdf.getPageCount() !== 3) throw new Error(`Expected 3 selected PDF pages, got ${pdf.getPageCount()}`)
        result.pages = pdf.getPageCount()
      }
      results.push({ format, ...result, bytes: stat.size, durationMs: performance.now() - started })
    } catch (e) {
      results.push({ format, success: false, error: String(e), durationMs: performance.now() - started })
    }
    console.log(results.at(-1))
  }
} finally {
  await f.close()
}
await fs.mkdir('reports', { recursive: true })
await fs.writeFile('reports/export-smoke.json', JSON.stringify(results, null, 2))
process.exit(results.every((r) => r.success) ? 0 : 1)
