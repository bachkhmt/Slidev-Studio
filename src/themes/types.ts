export interface Theme {
  id: string
  name: string
  kind: 'light' | 'dark'
  bg: string
  surface: string
  border: string
  fg: string
  fgMuted: string
  accent: string
  chromeBg?: string
  chromeFg?: string
  monacoBase: 'vs' | 'vs-dark' | 'hc-black'
}

export type ColorScale = Record<number, string>
