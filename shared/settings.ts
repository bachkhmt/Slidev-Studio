export type ExportFormat = 'pdf' | 'png' | 'pptx' | 'pptx-editable' | 'md' | 'build'

export interface ExportOptions {
  range?: string
  dark?: boolean
  withClicks?: boolean
  omitBackground?: boolean
  timeout?: number
  outputName?: string
  outputDir?: string
}

export interface AppSettings {
  settingsVersion: 2
  appearance: {
    themeId: string
    followSystem: boolean
    themeIdLight: string
    themeIdDark: string
    uiZoom: number
    uiFontFamily: 'system' | 'inter' | 'source-sans'
  }
  editor: {
    fontSize: number
    fontFamily: string
    fontLigatures: boolean
    lineNumbers: boolean
    minimap: boolean
    wordWrap: 'on' | 'off'
    tabSize: 2 | 4
    renderWhitespace: 'none' | 'selection' | 'all'
    autoSave: 'off' | 'afterDelay' | 'onBlur'
    autoSaveDelayMs: number
    autoSaveGuard: boolean
    monacoTheme: 'follow-app' | string
  }
  preview: {
    navMode: 'paged' | 'scroll-vertical' | 'scroll-horizontal'
    wheelAxis: 'horizontal' | 'vertical' | 'both'
    scrollSnap: boolean
    slideGapPx: number
    fitMode: 'fit-width' | 'fit-height' | 'manual'
    colorScheme: 'follow-app' | 'light' | 'dark' | 'slide-default'
    restoreSlideAfterRestart: boolean
    sourceJump: {
      enabled: boolean
      trigger: 'alt-click' | 'ctrl-click' | 'double-click' | 'click'
      flashMs: number
      syncEditorToPreview: boolean
    }
  }
  server: {
    defaultPort: number
    portScanRange: number
    strictPort: boolean
    bindMode: 'localhost' | 'lan'
    remotePassword: string
    openExternalBrowser: boolean
    startupTimeoutMs: number
    extraArgs: string
    autoInstallDeps: boolean
    packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun'
    registry: string
    stopServerOnTabClose: boolean
    keepServersOnQuit: boolean
  }
  export: {
    defaultFormat: ExportFormat
    outputDir: string
    defaultOptions: ExportOptions
    openFolderAfterExport: boolean
  }
  projects: {
    defaultWorkspaceDir: string
    defaultAuthor: string
    defaultCliRange: string
    gitInitOnCreate: boolean
    restoreTabsOnLaunch: boolean
    confirmBeforeCloseTab: boolean
  }
  system: {
    nodePathOverride: string
    logLevel: 'error' | 'info' | 'debug'
  }
}

export type SettingsGroup = keyof Omit<AppSettings, 'settingsVersion'>
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] }

export const DEFAULT_SETTINGS: AppSettings = {
  settingsVersion: 2,
  appearance: {
    themeId: 'studio-dark',
    followSystem: false,
    themeIdLight: 'academic-overleaf',
    themeIdDark: 'studio-dark',
    uiZoom: 1,
    uiFontFamily: 'system'
  },
  editor: {
    fontSize: 14,
    fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
    fontLigatures: false,
    lineNumbers: true,
    minimap: true,
    wordWrap: 'on',
    tabSize: 2,
    renderWhitespace: 'selection',
    autoSave: 'afterDelay',
    autoSaveDelayMs: 1200,
    autoSaveGuard: true,
    monacoTheme: 'follow-app'
  },
  preview: {
    navMode: 'paged',
    wheelAxis: 'both',
    scrollSnap: true,
    slideGapPx: 24,
    fitMode: 'fit-width',
    colorScheme: 'follow-app',
    restoreSlideAfterRestart: true,
    sourceJump: {
      enabled: true,
      trigger: 'alt-click',
      flashMs: 1000,
      syncEditorToPreview: false
    }
  },
  server: {
    defaultPort: 3030,
    portScanRange: 300,
    strictPort: false,
    bindMode: 'localhost',
    remotePassword: '',
    openExternalBrowser: false,
    startupTimeoutMs: 120000,
    extraArgs: '',
    autoInstallDeps: true,
    packageManager: 'npm',
    registry: '',
    stopServerOnTabClose: true,
    keepServersOnQuit: false
  },
  export: {
    defaultFormat: 'pdf',
    outputDir: 'project/export',
    defaultOptions: { dark: false, withClicks: false, omitBackground: false },
    openFolderAfterExport: false
  },
  projects: {
    defaultWorkspaceDir: '',
    defaultAuthor: '',
    defaultCliRange: '^53.0.0',
    gitInitOnCreate: false,
    restoreTabsOnLaunch: false,
    confirmBeforeCloseTab: true
  },
  system: {
    nodePathOverride: '',
    logLevel: 'info'
  }
}
