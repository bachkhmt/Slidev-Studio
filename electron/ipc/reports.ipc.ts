import { ipcMain, BrowserWindow, dialog } from 'electron'
import fs from 'fs-extra'
import path from 'path'
import { projectStore } from '../services/projectStore'
import { reportManager, readReportPdf } from '../services/reportManager'
import { compilerRuntime } from '../services/compilerRuntime'
import { samePath } from '../utils/path'

function rootFor(id: string, entry?: string) {
  const project = projectStore.getProject(id)
  if (!project || (project.kind !== 'latex' && project.kind !== 'markdown-report')) throw new Error('Dự án báo cáo chưa được đăng ký.')
  if (entry && !project.entryFiles.includes(entry)) throw new Error('File chính chưa được đăng ký trong báo cáo.')
  return project.path
}

export function registerReportsIpc() {
  // The report API grants native access only to the application window's main frame.
  const handle = (channel: string, action: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown) => {
    ipcMain.handle(channel, (event, ...args) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win || event.senderFrame !== win.webContents.mainFrame) throw new Error('Nguồn yêu cầu không hợp lệ.')
      return action(event, ...args)
    })
  }
  handle('reports:compiler', () => compilerRuntime.info())
  handle('reports:installCompiler', () => compilerRuntime.install())
  handle('reports:status', (_event, id: string) => {
    rootFor(id)
    return reportManager.status(id)
  })
  handle('reports:compile', (_event, id: string, entry: string) => reportManager.compile(id, rootFor(id, entry), entry))
  handle('reports:cancel', (_event, id: string) => {
    rootFor(id)
    return reportManager.cancel(id)
  })
  handle('reports:readPdf', async (_event, id: string, entry: string, reference = false) => {
    return readReportPdf(rootFor(id, entry), entry, reference)
  })
  handle('reports:exportPdf', async (event, id: string, entry: string) => {
    const root = rootFor(id, entry)
    if (reportManager.status(id).state !== 'ready')
      throw new Error('Hãy biên dịch báo cáo thành công trước khi xuất PDF.')
    const source = await reportManager.pdfPath(root, entry)
    const bytes = await readReportPdf(root, entry)
    if (!bytes) throw new Error('Không tìm thấy PDF đã biên dịch.')
    const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender)!, {
      title: 'Lưu báo cáo PDF',
      defaultPath: path.join(root, `${path.basename(entry, path.extname(entry))}.pdf`),
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    })
    if (canceled || !filePath) return null
    // A save dialog authorizes this destination, but may never overwrite report source/assets.
    if (!filePath.toLowerCase().endsWith('.pdf') || (await fs.lstat(filePath).catch(() => undefined))?.isSymbolicLink())
      throw new Error('Hãy chọn tên file PDF để bảo vệ file nguồn báo cáo.')
    if (!samePath(source, filePath)) await fs.writeFile(filePath, bytes)
    return filePath
  })
  reportManager.subscribe((snapshot) => {
    for (const win of BrowserWindow.getAllWindows())
      if (!win.isDestroyed()) win.webContents.send('reports:changed', snapshot)
  })
}
