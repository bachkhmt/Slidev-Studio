import type { Theme } from './types'

export const themes: Theme[] = [
  { id: 'studio-dark', name: 'Studio Dark', kind: 'dark', bg: '#020617', surface: '#0f172a', border: '#1e293b', fg: '#f1f5f9', fgMuted: '#94a3b8', accent: '#3b82f6', monacoBase: 'vs-dark' },
  { id: 'academic-overleaf', name: 'Academic (kiểu Overleaf)', kind: 'light', bg: '#ffffff', surface: '#f4f5f6', border: '#d0d5dd', fg: '#1b222c', fgMuted: '#667085', accent: '#138a07', chromeBg: '#1b222c', chromeFg: '#f1f5f9', monacoBase: 'vs' },
  { id: 'github-light', name: 'GitHub Light', kind: 'light', bg: '#ffffff', surface: '#f6f8fa', border: '#d0d7de', fg: '#1f2328', fgMuted: '#656d76', accent: '#0969da', monacoBase: 'vs' },
  { id: 'dracula', name: 'Dracula', kind: 'dark', bg: '#282a36', surface: '#21222c', border: '#44475a', fg: '#f8f8f2', fgMuted: '#bd93f9', accent: '#bd93f9', monacoBase: 'vs-dark' },
  { id: 'nord', name: 'Nord', kind: 'dark', bg: '#2e3440', surface: '#3b4252', border: '#4c566a', fg: '#eceff4', fgMuted: '#d8dee9', accent: '#88c0d0', monacoBase: 'vs-dark' },
  { id: 'catppuccin-mocha', name: 'Catppuccin Mocha', kind: 'dark', bg: '#1e1e2e', surface: '#181825', border: '#313244', fg: '#cdd6f4', fgMuted: '#a6adc8', accent: '#cba6f7', monacoBase: 'vs-dark' }
]

export function getTheme(id: string): Theme {
  return themes.find((theme) => theme.id === id) || themes[0]
}
