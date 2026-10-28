import { randomUUID } from 'crypto'
import { BrowserWindow, dialog, ipcMain } from 'electron'
import type { PrepareCloseReply } from '../../shared/documents'

export function registerCloseCoordinator(onQuit: () => Promise<void>) {
  let pending:
    { id: string; sender: number; timer: ReturnType<typeof setTimeout>; resolve: (ok: boolean) => void } | undefined
  let task: Promise<boolean> | undefined
  let allowed = false
  ipcMain.on('lifecycle:prepared', (event, reply: PrepareCloseReply) => {
    if (!pending || reply?.requestId !== pending.id || event.sender.id !== pending.sender) return
    clearTimeout(pending.timer)
    pending.resolve(reply.status === 'complete')
    pending = undefined
  })
  ipcMain.handle('lifecycle:confirmUnsaved', async (event, files: string[], reason: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return 'cancel'
    if (pending?.sender === event.sender.id) clearTimeout(pending.timer)
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Nội dung chưa lưu',
      message: 'Bạn muốn xử lý các thay đổi trước khi đóng?',
      detail: `${files.join('\n')}\n\n${reason}`,
      buttons: ['Lưu', 'Bỏ thay đổi', 'Hủy đóng'],
      defaultId: 2,
      cancelId: 2,
      noLink: true
    })
    if (pending?.sender === event.sender.id)
      pending.timer = setTimeout(() => {
        pending?.resolve(false)
        pending = undefined
      }, 10000)
    return ['save', 'discard', 'cancel'][response] || 'cancel'
  })
  const request = (win: BrowserWindow, action: 'window' | 'quit') => {
    if (task) return task
    task = new Promise<boolean>((resolve) => {
      const id = randomUUID()
      pending = {
        id,
        sender: win.webContents.id,
        resolve,
        timer: setTimeout(() => {
          pending = undefined
          resolve(false)
          if (!win.isDestroyed())
            void dialog.showMessageBox(win, {
              type: 'error',
              title: 'Chưa thể đóng',
              message: 'Trình soạn thảo không phản hồi trong 10 giây. Ứng dụng vẫn mở để bảo vệ bản nháp.'
            })
        }, 10000)
      }
      win.webContents.send('lifecycle:prepareClose', { requestId: id, action })
    }).finally(() => {
      task = undefined
    })
    return task
  }
  return {
    attach(win: BrowserWindow) {
      let windowAllowed = false
      win.on('close', (event) => {
        if (allowed || windowAllowed) return
        event.preventDefault()
        void request(win, 'window')
          .then(async (ok) => {
            if (!ok || allowed || windowAllowed) return
            if (process.platform === 'darwin') {
              windowAllowed = true
              win.close()
            } else {
              allowed = true
              await onQuit()
            }
          })
          .catch(() => {
            allowed = false
          })
      })
    },
    async quit(win: BrowserWindow | null) {
      if (allowed) return
      if (win && !win.isDestroyed() && !(await request(win, 'quit'))) return
      if (allowed) return
      allowed = true
      await onQuit()
    },
    get allowed() {
      return allowed
    }
  }
}
