import { stripAnsi } from '../utils/stripAnsi'

export type CompileEvent =
  | { type: 'error'; summary: string; raw: string; file?: string; line?: number; column?: number; slideNo?: number }
  | { type: 'ok' }

const ERROR_START = /(\[vite\][^\n]*(error|failed)|Internal server error|Pre-transform error|SyntaxError|Failed to resolve)/i
const SUCCESS = /hmr update|page reload|hmr invalidate|program reload|server restarted/i

export class CompileErrorAggregator {
  private lines: string[] = []
  private byteLength = 0

  push(line: string): CompileEvent[] {
    const clean = stripAnsi(line).replace(/\r/g, '')
    const events: CompileEvent[] = []
    if (SUCCESS.test(clean)) {
      events.push(...this.finish())
      events.push({ type: 'ok' })
      return events
    }

    if (this.lines.length) {
      if (!clean.trim() || (/^\[vite\]/i.test(clean) && !/^\[vite\].*(?:error|failed)/i.test(clean)) || !this.isContinuation(clean)) {
        events.push(...this.finish())
      }
    }

    if (ERROR_START.test(clean)) {
      events.push(...this.finish())
      this.add(clean)
      return events
    }

    if (this.lines.length && this.isContinuation(clean)) {
      this.add(clean)
      if (this.lines.length >= 40 || this.byteLength >= 4096) events.push(...this.finish())
    }
    return events
  }

  flush(): CompileEvent[] {
    return this.finish()
  }

  private isContinuation(line: string): boolean {
    return /^\s/.test(line) || /^(?:Plugin:|File:)/i.test(line) || /^\d+\s*[|│]/.test(line) || /^>\s*\d+\s*[|│]/.test(line)
  }

  private add(line: string): void {
    this.lines.push(line)
    this.byteLength += Buffer.byteLength(line, 'utf8') + 1
  }

  private finish(): CompileEvent[] {
    if (!this.lines.length) return []
    const raw = this.lines.join('\n').slice(0, 4096)
    const first = this.lines[0].trim()
    const summary = first.replace(/^\[vite\]\s*/i, '').slice(0, 500) || 'Lỗi biên dịch Slidev'
    const fileLine = this.lines.map((line) => line.match(/^\s*File:\s*(.+?):(\d+):(\d+)\s*$/i)).find(Boolean)
    let file: string | undefined
    let line: number | undefined
    let column: number | undefined
    let slideNo: number | undefined
    if (fileLine) {
      file = fileLine[1].trim()
      line = Number(fileLine[2])
      column = Number(fileLine[3])
      const slideFile = file.match(/^(.*?\.md)__slidev_(\d+)\.md$/i)
      if (slideFile) {
        file = slideFile[1]
        slideNo = Number(slideFile[2])
      }
    }
    this.lines = []
    this.byteLength = 0
    return [{ type: 'error', summary, raw, ...(file ? { file } : {}), ...(line ? { line } : {}), ...(column ? { column } : {}), ...(slideNo ? { slideNo } : {}) }]
  }
}
