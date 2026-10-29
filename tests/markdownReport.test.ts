import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { markdownReportHtml, parseMarkdownReport } from '../electron/services/markdownReport'

let root: string
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-md-report-'))
  await fs.copy('electron/templates/dl-assignment-markdown', root)
})
afterEach(async () => {
  await fs.remove(root)
})
describe('Markdown report renderer', () => {
  it('builds a self-contained A4 report with cover, TOC, numbered headings, figures and tables', async () => {
    const html = await markdownReportHtml(root, await fs.readFile(path.join(root, 'main.md'), 'utf8'))
    expect(html).toContain('Contents')
    expect(html).toContain('List of Figures')
    expect(html).toContain('List of Tables')
    expect(html).toContain('<b>Table 1:</b>')
    expect(html).toContain('<b>Figure 1:</b>')
    expect(html).toContain('<span>1.1.1.</span>')
    expect(html).toContain('data:image/png;base64,')
    expect(html).not.toContain('<script')
    expect(html).toContain("script-src 'none'")
  })
  it('renders math locally and escapes source HTML and metadata', async () => {
    const source = '---\ntitle: "<script>alert(1)</script>"\n---\n# Report\n\n$x^2$\n\n<script>alert(2)</script>\n'
    const html = await markdownReportHtml(root, source)
    expect(html).toContain('katex')
    expect(html).toContain('data:font/woff2;base64,')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
  it('rejects image traversal and external images instead of reading/fetching them', async () => {
    for (const image of ['../private.png', 'https://example.com/private.png'])
      await expect(markdownReportHtml(root, `---\ntitle: Test\n---\n![Image](${image})`)).rejects.toThrow(/Ảnh báo cáo/)
  })
  it('rejects malformed report metadata while preserving plain text with colons', () => {
    expect(() => parseMarkdownReport('---\ntitle: [\n---\n')).toThrow()
    expect(parseMarkdownReport('---\ntitle: Report\n---\nNote: normal prose').body).toContain('Note: normal prose')
  })
  it('keeps captions attached to wide tables and renders caption math', async () => {
    const html = await markdownReportHtml(
      root,
      '---\ntitle: Report\n---\nTable: Scores $x^2$\n\n| A | B | C | D | E |\n| --- | --- | --- | --- | --- |\n| 1 | 2 | 3 | 4 | 5 |\n\n![Shape $x^2$](image/hcmut.png)'
    )
    expect(html).toMatch(/<table class="wide-table"><caption id="table-1">/)
    expect(html).toMatch(/<figcaption><b>Figure 1:<\/b> Shape <span class="katex">/)
  })
})
