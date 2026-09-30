import type { AppSettings } from '../../shared/settings'

const backgroundByTheme: Record<string, string> = {
  'studio-dark': '#020617',
  'academic-overleaf': '#ffffff',
  'github-light': '#ffffff',
  dracula: '#282a36',
  nord: '#2e3440',
  'catppuccin-mocha': '#1e1e2e'
}

export function getSettingsBackgroundColor(settings: AppSettings, systemDark: boolean): string {
  const effectiveTheme = settings.appearance.followSystem
    ? systemDark ? settings.appearance.themeIdDark : settings.appearance.themeIdLight
    : settings.appearance.themeId
  return backgroundByTheme[effectiveTheme] || backgroundByTheme['studio-dark']
}
