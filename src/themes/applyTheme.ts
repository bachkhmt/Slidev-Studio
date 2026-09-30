import type { Theme } from './types'
import { buildScale, toRgbChannels } from './buildScale'

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const { slate, accent } = buildScale(theme)
  Object.entries(slate).forEach(([step, color]) => root.style.setProperty(`--slate-${step}`, toRgbChannels(color)))
  Object.entries(accent).forEach(([step, color]) => root.style.setProperty(`--accent-${step}`, toRgbChannels(color)))
  root.style.setProperty('--app-bg', theme.bg)
  root.style.setProperty('--app-surface', theme.surface)
  root.style.setProperty('--app-border', theme.border)
  root.style.setProperty('--app-fg', theme.fg)
  root.style.setProperty('--chrome-bg', theme.chromeBg || theme.surface)
  root.style.setProperty('--chrome-fg', theme.chromeFg || theme.fg)
  root.setAttribute('data-theme', theme.id)
  root.style.colorScheme = theme.kind
  try {
    const vars = Object.fromEntries([
      ...Object.entries(slate).map(([step, color]) => [`--slate-${step}`, toRgbChannels(color)]),
      ...Object.entries(accent).map(([step, color]) => [`--accent-${step}`, toRgbChannels(color)]),
      ['--app-bg', theme.bg],
      ['--app-surface', theme.surface],
      ['--app-border', theme.border],
      ['--app-fg', theme.fg],
      ['--chrome-bg', theme.chromeBg || theme.surface],
      ['--chrome-fg', theme.chromeFg || theme.fg]
    ])
    localStorage.setItem('studio-theme-cache', JSON.stringify({ id: theme.id, kind: theme.kind, vars }))
  } catch {
    // localStorage can be unavailable in restricted browser contexts.
  }
}
