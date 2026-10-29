export type ProjectKind = 'slidev' | 'latex' | 'markdown-report'
export function isReportKind(kind?: ProjectKind): boolean {
  return kind === 'latex' || kind === 'markdown-report'
}
