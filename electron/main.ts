import { hasSingleInstanceLock } from './singleInstanceLock'
import { app, BrowserWindow, shell, nativeTheme } from 'electron'
import path from 'path'
import fs from 'fs'
import os from 'os'
import fixPath from 'fix-path'
import { diag } from './utils/diag'
import { registerCloseCoordinator } from './services/closeCoordinator'

// Fix PATH for GUI launch on macOS
fixPath()

if (process.platform === 'win32') app.setAppUserModelId('com.slidev.studio')

let mainWindow: BrowserWindow | null = null
let focusOnReady = false
let appInitialized = false
const closeCoordinator = registerCloseCoordinator(async () => {
  projectStore?.flushSettings()
  await processManager?.stopAll()
  app.exit(0)
})
let projectStore: typeof import('./services/projectStore').projectStore | null = null
let processManager: typeof import('./services/processManager').processManager | null = null
let getSettingsBackgroundColor: typeof import('./services/themeColors').getSettingsBackgroundColor | null = null

function currentLanHost(): string | undefined {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) if (entry.family === 'IPv4' && !entry.internal) return entry.address
  }
  return undefined
}

function isAllowedPreviewUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' || !url.port || !/^\d+$/.test(url.port)) return false
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return true
    return projectStore?.getSettings().server.bindMode === 'lan' && url.hostname === currentLanHost()
  } catch {
    return false
  }
}

function openExternalHttpUrl(value: string): void {
  try {
    const protocol = new URL(value).protocol
    if (protocol === 'http:' || protocol === 'https:') {
      void shell
        .openExternal(value)
        .catch((error) => diag('open-external-error', { url: value, message: error.message }))
    } else {
      diag('blocked-webview-navigation', { url: value, protocol })
    }
  } catch {
    diag('blocked-webview-navigation', { url: value, protocol: 'invalid' })
  }
}

app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    // PreviewPane assigns the initial src after attachment to avoid a duplicate load.
    // Empty src is therefore deferred and will be constrained by will-navigate below.
    if (params.src && !isAllowedPreviewUrl(params.src)) {
      event.preventDefault()
      return
    }
    const preferences = webPreferences as Record<string, unknown>
    delete preferences.preloadURL
    delete preferences.preload
    const cjsPath = path.join(__dirname, '../preload/webview.cjs')
    const mjsPath = path.join(__dirname, '../preload/webview.mjs')
    const jsPath = path.join(__dirname, '../preload/webview.js')
    // WebPreferences.preload expects a filesystem path. The webview element's
    // preload attribute is a file:// URL, but will-attach-webview receives the
    // normalized BrowserWindow preferences where Chromium expects the path itself.
    // Prefer the CommonJS bundle because webview renderers are sandboxed and
    // Electron cannot load ESM preloads in a sandboxed renderer.
    preferences.preload = fs.existsSync(cjsPath) ? cjsPath : fs.existsSync(mjsPath) ? mjsPath : jsPath
    preferences.nodeIntegration = false
    preferences.contextIsolation = true
    preferences.webSecurity = true
    preferences.allowRunningInsecureContent = false
  })

  if (contents.getType() !== 'webview') return
  contents.on('preload-error', (_event, preloadPath, error) => {
    diag('webview-preload-error', {
      preloadPath,
      message: error.message,
      stack: error.stack
    })
  })
  let initialOrigin: string | undefined
  contents.on('will-navigate', (event, navigationUrl) => {
    let target: URL | undefined
    try {
      target = new URL(navigationUrl)
    } catch {
      /* Block malformed destinations. */
    }
    if (!target) {
      event.preventDefault()
      return
    }
    if (!initialOrigin && isAllowedPreviewUrl(navigationUrl)) {
      initialOrigin = target.origin
      return
    }
    if (initialOrigin && target.origin === initialOrigin) return
    event.preventDefault()
    openExternalHttpUrl(navigationUrl)
  })
  contents.setWindowOpenHandler(({ url }) => {
    openExternalHttpUrl(url)
    return { action: 'deny' }
  })
})

function appBackgroundColor(): string {
  if (!projectStore || !getSettingsBackgroundColor) throw new Error('Slidev Studio chưa khởi tạo xong')
  return getSettingsBackgroundColor(projectStore.getSettings(), nativeTheme.shouldUseDarkColors)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'Slidev Studio',
    icon: app.isPackaged ? path.join(process.resourcesPath, 'icon.png') : path.join(__dirname, '../../build/icon.png'),
    backgroundColor: appBackgroundColor(),
    show: false,
    autoHideMenuBar: false,
    webPreferences: {
      preload: fs.existsSync(path.join(__dirname, '../preload/index.cjs'))
        ? path.join(__dirname, '../preload/index.cjs')
        : fs.existsSync(path.join(__dirname, '../preload/index.mjs'))
          ? path.join(__dirname, '../preload/index.mjs')
          : path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true // Required for <webview> Live Preview
    }
  })

  processManager?.registerWindow(mainWindow)
  closeCoordinator.attach(mainWindow)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler((details) => {
    openExternalHttpUrl(details.url)
    return { action: 'deny' }
  })

  // electron-vite dev server url or production index.html
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.on('second-instance', () => {
  if (!app.isReady() || !appInitialized) {
    focusOnReady = true
    return
  }
  if (!mainWindow || mainWindow.isDestroyed()) createWindow()
  if (mainWindow?.isMinimized()) mainWindow.restore()
  mainWindow?.show()
  mainWindow?.focus()
})

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return
  const [
    projectsIpc,
    processIpc,
    fsIpc,
    scaffoldIpc,
    exportIpc,
    settingsIpc,
    processService,
    projectService,
    themeColors,
    pidRegistry
  ] = await Promise.all([
    import('./ipc/projects.ipc'),
    import('./ipc/process.ipc'),
    import('./ipc/fs.ipc'),
    import('./ipc/scaffold.ipc'),
    import('./ipc/export.ipc'),
    import('./ipc/settings.ipc'),
    import('./services/processManager'),
    import('./services/projectStore'),
    import('./services/themeColors'),
    import('./services/pidRegistry')
  ])
  processManager = processService.processManager
  projectStore = projectService.projectStore
  getSettingsBackgroundColor = themeColors.getSettingsBackgroundColor
  projectsIpc.registerProjectsIpc()
  processIpc.registerProcessIpc()
  fsIpc.registerFsIpc()
  scaffoldIpc.registerScaffoldIpc()
  exportIpc.registerExportIpc()
  settingsIpc.registerSettingsIpc()
  const collabIpc = await import('./ipc/collab.ipc')
  collabIpc.registerCollabIpc()
  await pidRegistry.reapOrphans()
  createWindow()
  appInitialized = true
  if (focusOnReady) {
    mainWindow?.show()
    mainWindow?.focus()
    focusOnReady = false
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// Clean up all running Slidev dev servers when app quits
app.on('before-quit', (e) => {
  if (!closeCoordinator.allowed) {
    e.preventDefault()
    void closeCoordinator.quit(mainWindow)
  }
})

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

let signalCleanupStarted = false
const cleanupOnSignal = (signal: NodeJS.Signals) => {
  if (signalCleanupStarted) return
  signalCleanupStarted = true
  diag('signal-cleanup', { signal })
  processManager?.killAllSync()
  app.exit(0)
}
process.on('SIGTERM', () => cleanupOnSignal('SIGTERM'))
process.on('SIGINT', () => cleanupOnSignal('SIGINT'))
process.on('SIGHUP', () => cleanupOnSignal('SIGHUP'))
process.on('exit', () => processManager?.killAllSync())
