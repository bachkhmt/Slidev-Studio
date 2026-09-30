import { BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import fs from 'fs-extra'
import path from 'path'
import { pathToFileURL } from 'url'
import { projectStore } from '../services/projectStore'
import { getSettingsBackgroundColor } from '../services/themeColors'
import type { DeepPartial, SettingsGroup } from '../../shared/settings'

function applySettingsToElectron(): void {
  const settings = projectStore.getSettings()
  nativeTheme.themeSource = settings.appearance.followSystem
    ? 'system'
    : settings.appearance.themeId === 'academic-overleaf' || settings.appearance.themeId === 'github-light'
      ? 'light'
      : 'dark'
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.setBackgroundColor(getSettingsBackgroundColor(settings, nativeTheme.shouldUseDarkColors))
  }
}

function broadcastSettings(): void {
  const settings = projectStore.getSettings()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('settings:changed', settings)
  }
  applySettingsToElectron()
}

export function registerSettingsIpc(): void {
  ipcMain.handle('settings:get', () => projectStore.getSettings())
  ipcMain.handle('settings:update', (_event, partial: DeepPartial<ReturnType<typeof projectStore.getSettings>>) => {
    const result = projectStore.updateSettings(partial)
    broadcastSettings()
    return result
  })
  ipcMain.handle('settings:reset', (_event, group?: SettingsGroup) => {
    const result = projectStore.resetSettings(group)
    broadcastSettings()
    return result
  })
  ipcMain.handle('settings:export', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
    const result = await dialog.showSaveDialog(win!, {
      title: 'Xuất cài đặt Slidev Studio',
      defaultPath: path.join(projectStore.getConfigDir(), 'settings.json'),
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return null
    await fs.writeJson(result.filePath, projectStore.getSettings(), { spaces: 2 })
    return result.filePath
  })
  ipcMain.handle('settings:import', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(win!, {
      title: 'Nhập cài đặt Slidev Studio',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    const imported = await fs.readJson(result.filePaths[0])
    const preview = projectStore.prepareSettingsImport(imported)
    if (preview.changedSensitive) {
      const confirmation = await dialog.showMessageBox(win!, {
        type: 'warning',
        title: 'Xác nhận cài đặt nhạy cảm',
        message: 'File cài đặt thay đổi đường dẫn Node, registry, tham số CLI hoặc thư mục xuất.',
        detail: 'Chỉ tiếp tục nếu bạn tin cậy file cài đặt này.',
        buttons: ['Áp dụng', 'Huỷ'],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      })
      if (confirmation.response !== 0) {
        event.sender.send('settings:import-warnings', [...preview.warnings, 'Đã huỷ nhập cài đặt.'])
        return null
      }
    }
    const settings = projectStore.applySettingsImport(preview)
    event.sender.send('settings:import-warnings', preview.warnings)
    broadcastSettings()
    return settings
  })
  ipcMain.handle('settings:openConfigDir', () => shell.openPath(projectStore.getConfigDir()))
  ipcMain.handle('preview:getPreloadPath', () => {
    const cjsPath = path.join(__dirname, '../preload/webview.cjs')
    const mjsPath = path.join(__dirname, '../preload/webview.mjs')
    const preloadPath = fs.existsSync(cjsPath)
      ? cjsPath
      : fs.existsSync(mjsPath) ? mjsPath : path.join(__dirname, '../preload/webview.js')
    return pathToFileURL(preloadPath).toString()
  })
  ipcMain.handle('settings:apply', () => applySettingsToElectron())

  nativeTheme.on('updated', () => {
    if (!projectStore.getSettings().appearance.followSystem) return
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed()) continue
      win.setBackgroundColor(getSettingsBackgroundColor(projectStore.getSettings(), nativeTheme.shouldUseDarkColors))
      win.webContents.send('settings:system-theme', nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
    }
  })
  applySettingsToElectron()
}
