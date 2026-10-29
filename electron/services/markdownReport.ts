import fs from 'fs-extra'
import path from 'path'
import { createRequire } from 'module'
import { parseDocument } from 'yaml'
import MarkdownIt from 'markdown-it'
import katex from 'katex'
import { canonicalPath } from '../utils/path'

const require = createRequire(import.meta.url)
const escape = (value: unknown): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!
  )

export interface MarkdownReportMetadata {
  title?: string
  assignment?: string
  course?: string
  courseCode?: string
  topic?: string
  class?: string
  supervisor?: string
  major?: string
  date?: string
  logo?: string
  students?: Array<{ name: string; id?: string }>
}

export function parseMarkdownReport(source: string): { metadata: MarkdownReportMetadata; body: string } {
  const match = source.replace(/^\uFEFF/, '').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) throw new Error('Báo cáo cần phần thông tin YAML ở đầu file, nằm giữa hai dòng ---.')
  const document = parseDocument(match[1])
  if (document.errors.length) throw new Error(`Thông tin báo cáo chưa hợp lệ: ${document.errors[0].message}`)
  const metadata = document.toJS({ maxAliasCount: 20 })
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    throw new Error('Thông tin báo cáo phải là một đối tượng YAML.')
  return { metadata, body: source.replace(/^\uFEFF/, '').slice(match[0].length) }
}

async function imageData(root: string, source: string): Promise<string> {
  if (typeof source !== 'string' || !source || /^(?:[a-z][a-z0-9+.-]*:|[\\/])/i.test(source))
    throw new Error('Ảnh báo cáo phải là đường dẫn tương đối trong dự án.')
  const file = canonicalPath(path.resolve(root, source))
  const relative = path.relative(canonicalPath(root), file)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Ảnh báo cáo nằm ngoài dự án.')
  const mime: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml'
  }
  const type = mime[path.extname(file).toLowerCase()]
  if (!type) throw new Error('Ảnh báo cáo cần có định dạng PNG, JPG, WebP, GIF hoặc SVG.')
  const stat = await fs.stat(file)
  if (!stat.isFile() || stat.size > 5 * 1024 * 1024) throw new Error('Mỗi ảnh báo cáo phải nhỏ hơn 5 MB.')
  return `data:${type};base64,${(await fs.readFile(file)).toString('base64')}`
}

function addMath(md: ReturnType<typeof MarkdownIt>) {
  md.inline.ruler.after('escape', 'report_math', (state, silent) => {
    if (state.src[state.pos] !== '$' || state.src[state.pos + 1] === '$') return false
    let end = state.pos + 1
    while ((end = state.src.indexOf('$', end)) >= 0 && state.src[end - 1] === '\\') end++
    if (end < 0 || end === state.pos + 1) return false
    if (!silent) {
      const token = state.push('report_math', 'math', 0)
      token.content = state.src.slice(state.pos + 1, end)
    }
    state.pos = end + 1
    return true
  })
  md.block.ruler.before('fence', 'report_math_block', (state, start, end, silent) => {
    const line = state.src.slice(state.bMarks[start] + state.tShift[start], state.eMarks[start]).trim()
    if (line !== '$$') return false
    let close = start + 1
    while (close < end && state.src.slice(state.bMarks[close], state.eMarks[close]).trim() !== '$$') close++
    if (close === end) throw new Error(`Khối công thức ở dòng ${start + 1} chưa đóng bằng $$.`)
    if (silent) return true
    const token = state.push('report_math_block', 'math', 0)
    token.content = state.getLines(start + 1, close, state.blkIndent, false)
    token.block = true
    state.line = close + 1
    return true
  })
  for (const type of ['report_math', 'report_math_block'])
    md.renderer.rules[type] = (tokens, index) =>
      katex.renderToString(tokens[index].content, {
        displayMode: type === 'report_math_block',
        throwOnError: false,
        trust: false,
        maxExpand: 1000,
        strict: false
      })
}

let mathStyle: string | undefined
async function katexStyle(): Promise<string> {
  if (mathStyle) return mathStyle
  const cssPath = require.resolve('katex/dist/katex.min.css')
  let css = await fs.readFile(cssPath, 'utf8')
  const fonts = [...new Set(css.match(/fonts\/[A-Za-z0-9_-]+\.woff2/g) || [])]
  for (const font of fonts)
    css = css
      .split(font)
      .join(`data:font/woff2;base64,${(await fs.readFile(path.join(path.dirname(cssPath), font))).toString('base64')}`)
  mathStyle = css
  return css
}

export async function markdownReportHtml(root: string, source: string): Promise<string> {
  if (source.length > 2 * 1024 * 1024) throw new Error('Nội dung báo cáo vượt giới hạn 2 MB.')
  const { metadata: info, body } = parseMarkdownReport(source)
  const md = new MarkdownIt({ html: false, linkify: true, typographer: true })
  addMath(md)
  md.renderer.rules.table_open = (tokens, index) => {
    let columns = 0
    for (let pos = index + 1; pos < tokens.length && tokens[pos].type !== 'tr_close'; pos++)
      if (tokens[pos].type === 'th_open') columns++
    return `<table${columns >= 5 ? ' class="wide-table"' : ''}>`
  }
  const headings: Array<{ id: string; title: string; level: number; number: string }> = []
  const figures: Array<{ id: string; title: string }> = [],
    tables: Array<{ id: string; title: string }> = []
  const numbers = [0, 0, 0, 0]
  md.renderer.rules.heading_open = (tokens, index) => {
    const level = Math.min(4, Number(tokens[index].tag.slice(1)))
    numbers[level - 1]++
    for (let pos = level; pos < numbers.length; pos++) numbers[pos] = 0
    const number = numbers.slice(0, level).filter(Boolean).join('.')
    const title = tokens[index + 1]?.content || ''
    const id = `section-${headings.length + 1}`
    headings.push({ id, title, level, number })
    return `<${tokens[index].tag} id="${id}"><span>${number}.</span> `
  }
  const tokens = md.parse(body, {})
  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]
    if (token.type === 'paragraph_open' && tokens[index + 1]?.type === 'inline') {
      const inline = tokens[index + 1]
      if (/^Table:\s*/i.test(inline.content)) {
        const title = inline.content.replace(/^Table:\s*/i, '')
        const id = `table-${tables.length + 1}`
        tables.push({ id, title })
        token.type = 'report_table_caption'
        token.content = `<p class="caption" id="${id}"><b>Table ${tables.length}:</b> ${md.renderInline(title)}</p>`
        tokens.splice(index + 1, 2)
      } else if (inline.children?.length === 1 && inline.children[0].type === 'image') {
        const image = inline.children[0]
        const title = image.content
        const id = `figure-${figures.length + 1}`
        figures.push({ id, title })
        const data = await imageData(root, String(image.attrGet('src') || ''))
        token.type = 'report_figure'
        token.content = `<figure id="${id}"><img src="${data}" alt="${escape(title)}"><figcaption><b>Figure ${figures.length}:</b> ${md.renderInline(title)}</figcaption></figure>`
        tokens.splice(index + 1, 2)
      }
    }
    for (const child of token.children || [])
      if (child.type === 'image') child.attrSet('src', await imageData(root, String(child.attrGet('src') || '')))
  }
  md.renderer.rules.report_table_caption = (items, index) => items[index].content
  md.renderer.rules.report_figure = (items, index) => items[index].content
  const content = md.renderer
    .render(tokens, md.options, {})
    .replace(
      /<p class="caption" id="([^"]+)">([\s\S]*?)<\/p>\s*<table([^>]*)>/g,
      '<table$3><caption id="$1">$2</caption>'
    )
  const logo = await imageData(root, typeof info.logo === 'string' ? info.logo : 'image/hcmut.png')
  const students = Array.isArray(info.students) ? info.students.slice(0, 20) : []
  const list = (items: Array<{ id: string; title: string; level?: number; number?: string }>, numbered: boolean) =>
    items
      .map(
        (item, index) =>
          `<div class="toc-row" style="padding-left:${Math.min(item.level || 1, 4) * 5 - 5}mm"><span>${numbered ? `${escape(item.number)} ` : `${index + 1} `}${md.renderInline(item.title)}</span><i></i><span data-page-target="${item.id}">1</span></div>`
      )
      .join('')
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'none'"><title>${escape(info.title || 'Report')}</title><style>${REPORT_CSS}${/report_math/.test(JSON.stringify(tokens)) ? await katexStyle() : ''}</style></head><body>
    <section class="sheet cover"><div class="cover-frame"></div><div class="cover-frame inner"></div>
      <div class="institution">VIETNAM NATIONAL UNIVERSITY, HO CHI MINH CITY<br>HO CHI MINH CITY UNIVERSITY OF TECHNOLOGY<br>FACULTY OF COMPUTER SCIENCE AND ENGINEERING</div>
      <img class="logo" src="${logo}" alt="HCMUT">
      <div class="assignment">ASSIGNMENT ${escape(info.assignment || '[N]')}</div>
      <div class="course">${escape(info.course || '[Course Name]')} — ${escape(info.courseCode || '[Course Code]')}</div>
      <div class="topic">${escape(info.topic || '[Assignment Topic]')}</div>
      <div class="report-title">${escape(info.title || '[Report Title: Subtitle]')}</div>
      <div class="major">MAJOR: ${escape(info.major || 'COMPUTER SCIENCE')}</div>
      <table class="cover-details"><tbody><tr><th>CLASS:</th><td>${escape(info.class || '[Class]')}</td></tr><tr><th>SUPERVISOR:</th><td>${escape(info.supervisor || '[Supervisor Name]')}</td></tr><tr><td colspan="2" class="separator">— o0o —</td></tr>${students.map((student, index) => `<tr><th>${index === 0 ? 'STUDENT:' : ''}</th><td>${escape(student.name)} <span class="student-id">${escape(student.id || '[ID]')}</span></td></tr>`).join('')}</tbody></table>
      <div class="city">HO CHI MINH CITY, ${escape(info.date || '[Month Year]')}</div>
    </section>
    <section class="sheet contents" data-number="i"><div class="page-content"><h1>Contents</h1>${list(
      headings.filter((heading) => heading.level <= 3),
      true
    )}</div><footer>Page i/<span data-total>1</span></footer></section>
    <section class="sheet lists" data-number="ii"><div class="page-content"><h1>List of Figures</h1>${list(figures, false)}<h1>List of Tables</h1>${list(tables, false)}</div><footer>Page ii/<span data-total>1</span></footer></section>
    <div id="report-source">${content}</div></body></html>`
}

const REPORT_CSS = `
@page{size:A4;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0;background:white;color:black;font-family:"Times New Roman","Liberation Serif",serif;font-size:11pt;line-height:1.5}
.sheet{width:210mm;height:297mm;position:relative;overflow:hidden;break-after:page}.sheet:last-child{break-after:auto}.page-content{position:absolute;left:30mm;right:20mm;top:20mm;bottom:30mm;overflow:hidden}
footer{position:absolute;bottom:18mm;left:30mm;right:20mm;border-top:.3pt solid black;text-align:right;font-size:8pt;padding-top:3mm}h1{font-size:14pt;border-bottom:.4pt solid #ccc;margin:0 0 5mm;padding-bottom:2mm}h2{font-size:11pt;margin:6mm 0 2mm}h3{font-size:11pt;font-style:italic;margin:5mm 0 2mm}h4{font-size:11pt;margin:4mm 0 2mm}h1,h2,h3,h4{break-after:avoid}p{margin:0 0 3mm}table{border-collapse:collapse;margin:1mm auto 3mm;font-size:11pt;max-width:100%}th,td{padding:1mm 2mm;text-align:left}thead{border-top:1.2pt solid black;border-bottom:.6pt solid black}tbody{border-bottom:1.2pt solid black}tr{break-inside:avoid}.caption{text-align:center;margin:2mm 0 2mm}figure{margin:3mm 0 2mm;text-align:center;break-inside:avoid}figure img{max-width:100%;max-height:220mm;display:block;margin:0 auto}figcaption{margin-top:2mm}img{max-width:100%;max-height:220mm}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f8f8f8;border-left:2pt solid #ccc;padding:3mm;font-size:9pt;line-height:1.3}code{font-family:Consolas,monospace;font-size:.9em}blockquote{border-left:2pt solid #ccc;margin:3mm 0;padding-left:4mm}a{color:#005faa;text-decoration:none}ul,ol{margin-top:2mm;margin-bottom:3mm}li{margin:1mm 0}hr{border:0;border-top:.4pt solid #bbb}.katex-display{margin:3mm 0;overflow:hidden}
.cover-frame{position:absolute;left:30mm;right:20mm;top:15mm;bottom:15mm;border:4pt solid black}.cover-frame.inner{left:32mm;right:22mm;top:17mm;bottom:17mm;border-width:1.5pt}
.institution{position:absolute;top:34mm;left:32mm;right:22mm;text-align:center;font-size:13pt;font-weight:bold;line-height:1.35}.logo{position:absolute;top:50mm;left:72.5mm;width:80mm;height:65mm;object-fit:contain}
.assignment,.course,.topic,.report-title,.major,.city{position:absolute;left:35mm;right:25mm;text-align:center}.assignment{top:121mm;font-size:14pt;font-weight:bold}.course{top:130mm;font-size:16pt;font-weight:bold;text-transform:uppercase}.topic{top:140mm;font-size:14pt;font-weight:bold;text-transform:uppercase}
.report-title{top:151mm;left:42mm;right:32mm;border-block:1.1pt solid black;padding:4mm 0;font-size:16pt;font-weight:bold;line-height:1.3}.major{top:179mm;font-size:12pt;font-weight:bold}.cover-details{position:absolute;top:193mm;left:44mm;width:136mm;margin:0;font-size:11pt;line-height:1.5}.cover-details tbody{border:0}.cover-details th{width:36mm;text-align:right;vertical-align:top}.cover-details td{padding-left:2mm}.cover-details .separator{text-align:center;font-weight:bold;padding-block:2mm}.student-id{margin-left:5mm}.city{bottom:19mm;font-size:11pt}
.toc-row{display:flex;gap:2mm;align-items:baseline;margin:1.5mm 0;line-height:1.7}.toc-row i{flex:1;border-bottom:1px dotted #666}.lists h1{margin-top:5mm}.lists h1:first-child{margin-top:0}.lists h1:nth-of-type(2){margin-top:10mm}
#report-source{position:absolute;left:-10000px;top:0;width:160mm;visibility:hidden}.body-page h1:not(:first-child){margin-top:6mm}.body-page .page-content>table{max-width:100%}
.cover{display:flex;flex-direction:column;padding:32mm 28mm 23mm 38mm;gap:0;text-align:center}.cover .institution,.cover .logo,.cover .assignment,.cover .course,.cover .topic,.cover .report-title,.cover .major,.cover .cover-details,.cover .city{position:static;width:auto;height:auto;margin:0;flex-shrink:0}.cover .institution{font-size:12pt;line-height:1.35}.cover .logo{height:48mm;width:70mm;object-fit:contain;align-self:center;margin:4mm 0}.cover .assignment{font-size:14pt;margin:1mm 0}.cover .course{font-size:14pt;line-height:1.25;margin:1mm 0}.cover .topic{font-size:12pt;line-height:1.3;margin:1mm 0}.cover .report-title{font-size:16pt;line-height:1.25;padding:3mm 0;margin:3mm 3mm}.cover .major{font-size:11pt;margin:2mm 0}.cover .cover-details{font-size:10.5pt;line-height:1.4;align-self:center;margin:2mm 0}.cover .cover-details th{width:29mm}.cover .cover-details td{white-space:nowrap}.cover .city{margin-top:auto;padding-top:3mm;font-size:10pt}
.toc-row>span:first-child{min-width:0;flex-shrink:1}.toc-row>span:last-child{flex-shrink:0}.toc-row i{min-width:4mm}.page-content table{width:100%;table-layout:fixed;overflow-wrap:anywhere}.page-content table.wide-table{font-size:9pt;line-height:1.4}.page-content table.wide-table th,.page-content table.wide-table td{padding:1mm}.page-content table .katex{font-size:1em}.page-content caption{font-size:11pt;line-height:1.5;margin-bottom:2mm}.page-content .katex-display{overflow:visible}
.continued-item::marker{content:""}
.page-content p,.page-content li{overflow-wrap:anywhere}.page-content table:not(.wide-table) th:first-child:nth-last-child(2){width:35%}
`
