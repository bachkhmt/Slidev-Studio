/// <reference types="vite/client" />
import type { AppSettings, DeepPartial, ExportFormat, ExportOptions, SettingsGroup } from '../shared/settings'

export type { AppSettings, ExportFormat, ExportOptions } from '../shared/settings'

export interface ProjectItem {
  kind?: 'slidev' | 'latex' | 'markdown-report'
  id: string
  name: string
  path: string
  entryFiles: string[]
  gitUrl: string | null
  lastOpenedAt: string
  preferredPort?: number
  trusted?: boolean
}

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

export interface TemplateInfo {
  kind?: 'slidev' | 'latex' | 'markdown-report'
  id: string
  name: string
  description: string
  theme: string
  themeRange?: string
}

export interface ProcessStatus {
  projectId: string
  status: 'idle' | 'installing' | 'starting' | 'running' | 'error' | 'stopped'
  port?: number
  url?: string
  error?: string
  lanUrl?: string
}

export interface ProcessLogLine {
  text: string
  type: 'stdout' | 'stderr'
  time: string
  seq: number
}

export interface ExportBatchResult {
  file: string
  success: boolean
  outputPath?: string
  error?: string
}

export interface ElectronAPI {
  reports: import('../shared/reports').ReportsAPI
  lifecycle: {
    onPrepareClose: (callback: (request: import('../shared/documents').PrepareCloseRequest) => void) => () => void
    prepared: (reply: import('../shared/documents').PrepareCloseReply) => void
    confirmUnsaved: (files: string[], reason: string) => Promise<import('../shared/documents').CloseChoice>
  }
  collab: import('../shared/collab').CollaborationAPI
  projects: {
    list: () => Promise<ProjectItem[]>
    addFolder: (folderPath?: string) => Promise<ProjectItem>
    remove: (id: string) => Promise<boolean>
    cloneFromGit: (url: string, targetDir: string) => Promise<ProjectItem>
    cloneProject: (id: string, targetDir: string) => Promise<ProjectItem>
    updateProject: (id: string, partial: Partial<ProjectItem>) => Promise<ProjectItem | undefined>
    getSettings: () => Promise<AppSettings>
    updateSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>
    selectDirectory: (title?: string) => Promise<string | null>
  }
  process: {
    release: (id: string) => Promise<void>
    prioritize: (id: string) => Promise<void>
    start: (
      projectId: string,
      projectPath: string,
      entryFile: string
    ) => Promise<{ port: number; url: string; lanUrl?: string }>
    stop: (projectId: string) => Promise<boolean>
    restart: (
      projectId: string,
      projectPath: string,
      entryFile: string
    ) => Promise<{ port: number; url: string; lanUrl?: string }>
    recompile: (
      projectId: string,
      projectPath: string,
      entryFile: string
    ) => Promise<{ port: number; url: string; lanUrl?: string }>
    getStatus: (projectId: string) => Promise<ProcessStatus | null>
    getLogs: (projectId: string) => Promise<ProcessLogLine[]>
    onStatusChange: (callback: (data: ProcessStatus) => void) => () => void
    onLog: (callback: (data: { projectId: string; text: string; type: 'stdout' | 'stderr' }) => void) => () => void
    onLogBatch: (callback: (data: { projectId: string; lines: ProcessLogLine[] }) => void) => () => void
    onCompileError: (
      callback: (data: {
        projectId: string
        message: string
        summary: string
        raw: string
        file?: string
        line?: number
        column?: number
        slideNo?: number
      }) => void
    ) => () => void
    onCompileOk: (callback: (data: { projectId: string }) => void) => () => void
    onNeedsTrust: (callback: (data: { requestId: string; projectId: string; command: string }) => void) => () => void
    confirmTrust: (
      requestId: string,
      choice: 'once' | 'remember' | 'cancel',
      ignoreScripts: boolean
    ) => Promise<boolean>
  }
  fs: {
    listDirectory: (rootPath: string) => Promise<FileNode[]>
    statFile: (filePath: string) => Promise<import('../shared/documents').FileStamp>
    readFile: (filePath: string) => Promise<string>
    writeFile: (filePath: string, content: string) => Promise<boolean>
    listTree: (rootPath: string) => Promise<FileNode[]>
    showInFolder: (fullPath: string) => Promise<void>
  }
  scaffold: {
    listTemplates: () => Promise<TemplateInfo[]>
    create: (options: {
      name: string
      targetDir: string
      templateId: string
      title: string
      author: string
      customTheme?: string
      collabOwners?: string[]
      collabCoordinator?: string
    }) => Promise<ProjectItem>
    onLog: (callback: (text: string) => void) => () => void
  }
  export: {
    run: (
      projectPath: string,
      entryFile: string,
      format: ExportFormat,
      options?: ExportOptions
    ) => Promise<{ success: boolean; outputPath: string }>
    runBatch: (
      projectPath: string,
      entryFiles: string[],
      format: ExportFormat,
      options?: ExportOptions
    ) => Promise<ExportBatchResult[]>
    checkDeps: (projectPath: string) => Promise<{ ok: boolean }>
    installDeps: (projectPath: string) => Promise<{ success: boolean }>
    onBatchProgress: (callback: (data: { current: number; total: number; file: string }) => void) => () => void
    onLog: (callback: (text: string) => void) => () => void
  }
  env: {
    checkNode: () => Promise<{ ok: boolean; version?: string; path?: string }>
    checkGit: () => Promise<{ ok: boolean; version?: string }>
  }
  settings: {
    get: () => Promise<AppSettings>
    update: (partial: DeepPartial<AppSettings>) => Promise<AppSettings>
    reset: (group?: SettingsGroup) => Promise<AppSettings>
    export: () => Promise<string | null>
    import: () => Promise<AppSettings | null>
    onImportWarnings: (callback: (warnings: string[]) => void) => () => void
    openConfigDir: () => Promise<string>
    onChange: (callback: (settings: AppSettings) => void) => () => void
    onSystemTheme: (callback: (theme: 'light' | 'dark') => void) => () => void
  }
  preview: {
    getPreloadPath: () => Promise<string>
  }
  system: {
    setZoom: (factor: number) => void
  }
}

declare global {
  interface Window {
    api: ElectronAPI
  }
}
