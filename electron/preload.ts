import { contextBridge, ipcRenderer, webFrame } from 'electron'

const api = {
  lifecycle: {
    onPrepareClose: (callback: (request: import('../shared/documents').PrepareCloseRequest) => void) => {
      const listener = (_event: unknown, request: import('../shared/documents').PrepareCloseRequest) =>
        callback(request)
      ipcRenderer.on('lifecycle:prepareClose', listener)
      return () => {
        ipcRenderer.removeListener('lifecycle:prepareClose', listener)
      }
    },
    prepared: (reply: import('../shared/documents').PrepareCloseReply) => ipcRenderer.send('lifecycle:prepared', reply),
    confirmUnsaved: (files: string[], reason: string) => ipcRenderer.invoke('lifecycle:confirmUnsaved', files, reason)
  },
  collab: {
    inspect: (id: string) => ipcRenderer.invoke('collab:inspect', id),
    selectSection: (id: string, section: string) => ipcRenderer.invoke('collab:selectSection', id, section),
    saveDraft: (id: string) => ipcRenderer.invoke('collab:saveDraft', id),
    sync: (id: string) => ipcRenderer.invoke('collab:sync', id),
    submit: (id: string) => ipcRenderer.invoke('collab:submit', id),
    previewEntry: (id: string, mode: string) => ipcRenderer.invoke('collab:previewEntry', id, mode),
    resolveConflict: (id: string, file: string, choice: string) =>
      ipcRenderer.invoke('collab:resolveConflict', id, file, choice),
    finishMerge: (id: string) => ipcRenderer.invoke('collab:finishMerge', id),
    abortMerge: (id: string) => ipcRenderer.invoke('collab:abortMerge', id),
    exportMain: (id: string, format: string, options: any) =>
      ipcRenderer.invoke('collab:exportMain', id, format, options),
    account: () => ipcRenderer.invoke('collab:account'),
    beginLogin: (clientId: string) => ipcRenderer.invoke('collab:beginLogin', clientId),
    pollLogin: () => ipcRenderer.invoke('collab:pollLogin'),
    logout: () => ipcRenderer.invoke('collab:logout'),
    openPr: (url: string) => ipcRenderer.invoke('collab:openPr', url)
  },
  projects: {
    list: () => ipcRenderer.invoke('projects:list'),
    addFolder: (folderPath?: string) => ipcRenderer.invoke('projects:addFolder', folderPath),
    remove: (id: string) => ipcRenderer.invoke('projects:remove', id),
    cloneFromGit: (url: string, targetDir: string) => ipcRenderer.invoke('projects:cloneFromGit', url, targetDir),
    cloneProject: (id: string, targetDir: string) => ipcRenderer.invoke('projects:cloneProject', id, targetDir),
    updateProject: (id: string, partial: any) => ipcRenderer.invoke('projects:updateProject', id, partial),
    getSettings: () => ipcRenderer.invoke('projects:getSettings'),
    updateSettings: (settings: any) => ipcRenderer.invoke('projects:updateSettings', settings),
    selectDirectory: (title?: string) => ipcRenderer.invoke('projects:selectDirectory', title)
  },
  process: {
    release: (id: string) => ipcRenderer.invoke('process:release', id),
    prioritize: (id: string) => ipcRenderer.invoke('process:prioritize', id),
    start: (projectId: string, projectPath: string, entryFile: string) =>
      ipcRenderer.invoke('process:start', projectId, projectPath, entryFile),
    stop: (projectId: string) => ipcRenderer.invoke('process:stop', projectId),
    restart: (projectId: string, projectPath: string, entryFile: string) =>
      ipcRenderer.invoke('process:restart', projectId, projectPath, entryFile),
    recompile: (projectId: string, projectPath: string, entryFile: string) =>
      ipcRenderer.invoke('process:recompile', projectId, projectPath, entryFile),
    getStatus: (projectId: string) => ipcRenderer.invoke('process:getStatus', projectId),
    getLogs: (projectId: string) => ipcRenderer.invoke('process:getLogs', projectId),
    onStatusChange: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('process:status-changed', listener)
      return () => {
        ipcRenderer.removeListener('process:status-changed', listener)
      }
    },
    onLog: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('process:log', listener)
      return () => {
        ipcRenderer.removeListener('process:log', listener)
      }
    },
    onLogBatch: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('process:log-batch', listener)
      return () => ipcRenderer.removeListener('process:log-batch', listener)
    },
    onCompileError: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('process:compile-error', listener)
      return () => {
        ipcRenderer.removeListener('process:compile-error', listener)
      }
    },
    onCompileOk: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('process:compile-ok', listener)
      return () => ipcRenderer.removeListener('process:compile-ok', listener)
    },
    onNeedsTrust: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('process:needs-trust', listener)
      return () => ipcRenderer.removeListener('process:needs-trust', listener)
    },
    confirmTrust: (requestId: string, choice: string, ignoreScripts: boolean) =>
      ipcRenderer.invoke('process:confirmTrust', requestId, choice, ignoreScripts)
  },
  fs: {
    listDirectory: (path: string) => ipcRenderer.invoke('fs:listDirectory', path),
    statFile: (path: string) => ipcRenderer.invoke('fs:statFile', path),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath: string, content: string) => ipcRenderer.invoke('fs:writeFile', filePath, content),
    listTree: (rootPath: string) => ipcRenderer.invoke('fs:listTree', rootPath),
    showInFolder: (fullPath: string) => ipcRenderer.invoke('fs:showInFolder', fullPath)
  },
  scaffold: {
    listTemplates: () => ipcRenderer.invoke('scaffold:listTemplates'),
    create: (options: any) => ipcRenderer.invoke('scaffold:create', options),
    onLog: (callback: (text: string) => void) => {
      const listener = (_event: any, text: string) => callback(text)
      ipcRenderer.on('scaffold:log', listener)
      return () => {
        ipcRenderer.removeListener('scaffold:log', listener)
      }
    }
  },
  export: {
    run: (projectPath: string, entryFile: string, format: string, options?: any) =>
      ipcRenderer.invoke('export:run', projectPath, entryFile, format, options),
    runBatch: (projectPath: string, entryFiles: string[], format: string, options?: any) =>
      ipcRenderer.invoke('export:runBatch', projectPath, entryFiles, format, options),
    checkDeps: (projectPath: string) => ipcRenderer.invoke('export:checkDeps', projectPath),
    installDeps: (projectPath: string) => ipcRenderer.invoke('export:installDeps', projectPath),
    onBatchProgress: (callback: (data: any) => void) => {
      const listener = (_event: any, data: any) => callback(data)
      ipcRenderer.on('export:batch-progress', listener)
      return () => {
        ipcRenderer.removeListener('export:batch-progress', listener)
      }
    },
    onLog: (callback: (text: string) => void) => {
      const listener = (_event: any, text: string) => callback(text)
      ipcRenderer.on('export:log', listener)
      return () => {
        ipcRenderer.removeListener('export:log', listener)
      }
    }
  },
  env: {
    checkNode: () => ipcRenderer.invoke('env:checkNode'),
    checkGit: () => ipcRenderer.invoke('env:checkGit')
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (partial: any) => ipcRenderer.invoke('settings:update', partial),
    reset: (group?: string) => ipcRenderer.invoke('settings:reset', group),
    export: () => ipcRenderer.invoke('settings:export'),
    import: () => ipcRenderer.invoke('settings:import'),
    openConfigDir: () => ipcRenderer.invoke('settings:openConfigDir'),
    onChange: (callback: (settings: any) => void) => {
      const listener = (_event: any, settings: any) => callback(settings)
      ipcRenderer.on('settings:changed', listener)
      return () => ipcRenderer.removeListener('settings:changed', listener)
    },
    onSystemTheme: (callback: (theme: 'light' | 'dark') => void) => {
      const listener = (_event: any, theme: 'light' | 'dark') => callback(theme)
      ipcRenderer.on('settings:system-theme', listener)
      return () => ipcRenderer.removeListener('settings:system-theme', listener)
    },
    onImportWarnings: (callback: (warnings: string[]) => void) => {
      const listener = (_event: any, warnings: string[]) => callback(warnings)
      ipcRenderer.on('settings:import-warnings', listener)
      return () => ipcRenderer.removeListener('settings:import-warnings', listener)
    }
  },
  preview: {
    getPreloadPath: () => ipcRenderer.invoke('preview:getPreloadPath')
  },
  system: {
    setZoom: (factor: number) => webFrame.setZoomFactor(factor)
  }
}

contextBridge.exposeInMainWorld('api', api)
