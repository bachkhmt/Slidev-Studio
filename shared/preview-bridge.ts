export type PreviewNavMode = 'paged' | 'scroll-vertical' | 'scroll-horizontal'

export interface PreviewModeConfig {
  navMode: PreviewNavMode
  wheelAxis: 'horizontal' | 'vertical' | 'both'
  scrollSnap: boolean
  slideGapPx: number
  fitMode: 'fit-width' | 'fit-height' | 'manual'
  zoomFactor: number
  colorScheme: 'follow-app' | 'light' | 'dark' | 'slide-default'
  appThemeKind: 'light' | 'dark'
}

export interface SourceClickPayload {
  slideNo: number
  clickedText: string
  context: string
  occurrenceIndex: number
  kind: 'text' | 'heading' | 'list' | 'code' | 'image' | 'table' | 'component'
  codeLine?: number
  codeBlockIndex?: number
  slideMeta?: { start?: number; filepath?: string; no?: number }
  path?: string
}
