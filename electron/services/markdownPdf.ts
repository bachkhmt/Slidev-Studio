import { BrowserWindow } from 'electron'
import fs from 'fs-extra'
import path from 'path'
import { pathToFileURL } from 'url'
import { randomUUID } from 'crypto'
import { markdownReportHtml } from './markdownReport'
import { paginateMarkdownReport } from './markdownPagination'

export async function markdownPdf(root: string, input: string, output: string, signal: AbortSignal): Promise<Buffer> {
  const html = await markdownReportHtml(root, await fs.readFile(input, 'utf8'))
  if (signal.aborted) throw new Error('Đã hủy cập nhật PDF.')
  const file = path.join(output, 'report.html')
  await fs.writeFile(file, html, 'utf8')
  const url = pathToFileURL(file).href
  const window = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      partition: `report-print-${randomUUID()}`
    }
  })
  const cancel = () => {
    if (!window.isDestroyed()) window.destroy()
  }
  signal.addEventListener('abort', cancel, { once: true })
  const timer = setTimeout(cancel, 30000)
  try {
    window.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
    window.webContents.session.webRequest.onBeforeRequest((request, callback) =>
      callback({ cancel: request.url !== url && !request.url.startsWith('data:') })
    )
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => event.preventDefault())
    await window.loadFile(file)
    await window.webContents.executeJavaScript(`(${paginateMarkdownReport.toString()})()`)
    if (signal.aborted) throw new Error('Đã hủy cập nhật PDF.')
    return await window.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize: 'A4',
      margins: { top: 0, bottom: 0, left: 0, right: 0 }
    })
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', cancel)
    cancel()
  }
}
