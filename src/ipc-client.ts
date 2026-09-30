import type { ElectronAPI, ProjectItem, AppSettings, FileNode, TemplateInfo, ProcessStatus } from './env'
import { DEFAULT_SETTINGS } from '../shared/settings'

// Safe fallback for window.api
const api: ElectronAPI = (window as any).api || {
  collab: {
    inspect: async () => null,
    account: async () => null,
    logout: async () => {},
    openPr: async () => {},
    selectSection: async () => { throw new Error('API not available') },
    saveDraft: async () => { throw new Error('API not available') },
    sync: async () => { throw new Error('API not available') },
    submit: async () => { throw new Error('API not available') },
    previewEntry: async () => { throw new Error('API not available') },
    resolveConflict: async () => { throw new Error('API not available') },
    finishMerge: async () => { throw new Error('API not available') },
    abortMerge: async () => { throw new Error('API not available') },
    exportMain: async () => { throw new Error('API not available') },
    beginLogin: async () => { throw new Error('API not available') },
    pollLogin: async () => { throw new Error('API not available') }
  },
  projects: {
    list: async () => [],
    addFolder: async () => { throw new Error('API not available') },
    remove: async () => false,
    cloneFromGit: async () => { throw new Error('API not available') },
    cloneProject: async () => { throw new Error('API not available') },
    updateProject: async () => undefined,
    getSettings: async () => DEFAULT_SETTINGS,
    updateSettings: async () => DEFAULT_SETTINGS,
    selectDirectory: async () => null
  },
  process: {
    start: async () => ({ port: DEFAULT_SETTINGS.server.defaultPort, url: `http://localhost:${DEFAULT_SETTINGS.server.defaultPort}` }),
    stop: async () => true,
    restart: async () => ({ port: DEFAULT_SETTINGS.server.defaultPort, url: `http://localhost:${DEFAULT_SETTINGS.server.defaultPort}` }),
    recompile: async () => ({ port: DEFAULT_SETTINGS.server.defaultPort, url: `http://localhost:${DEFAULT_SETTINGS.server.defaultPort}` }),
    getStatus: async () => null,
    getLogs: async () => [],
    onStatusChange: () => () => {},
    onLog: () => () => {},
    onLogBatch: () => () => {},
    onCompileError: () => () => {},
    onCompileOk: () => () => {},
    onNeedsTrust: () => () => {},
    confirmTrust: async () => false
  },
  fs: {
    readFile: async () => '',
    writeFile: async () => true,
    listTree: async () => [],
    showInFolder: async () => {}
  },
  scaffold: {
    listTemplates: async () => [],
    create: async () => { throw new Error('API not available') },
    onLog: () => () => {}
  },
  export: {
    run: async () => ({ success: true, outputPath: '' }),
    runBatch: async () => [],
    checkDeps: async () => ({ ok: true }),
    installDeps: async () => ({ success: true }),
    onBatchProgress: () => () => {},
    onLog: () => () => {}
  },
  env: {
    checkNode: async () => ({ ok: true, version: 'v22.0.0' }),
    checkGit: async () => ({ ok: true, version: 'git' })
  },
  settings: {
    get: async () => DEFAULT_SETTINGS,
    update: async () => DEFAULT_SETTINGS,
    reset: async () => DEFAULT_SETTINGS,
    export: async () => null,
    import: async () => null,
    onImportWarnings: () => () => {},
    openConfigDir: async () => '',
    onChange: () => () => {},
    onSystemTheme: () => () => {}
  },
  preview: { getPreloadPath: async () => '' },
  system: { setZoom: () => {} }
}

export default api
export type { ProjectItem, AppSettings, FileNode, TemplateInfo, ProcessStatus }
export type ProcessStatusType = ProcessStatus['status']
