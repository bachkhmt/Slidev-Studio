import { ipcMain, BrowserWindow, shell } from 'electron'
import { projectStore } from '../services/projectStore'
import { processManager } from '../services/processManager'
import { collaborationService as service, githubService } from '../services/collabRuntime'

function rootFor(id: string): string {
  const project = projectStore.getProject(id)
  if (!project) throw new Error('Dự án chưa được đăng ký.')
  return project.path
}
export function registerCollabIpc(): void {
  ipcMain.handle('collab:inspect', (_e, id: string) => service.inspect(rootFor(id)))
  ipcMain.handle('collab:selectSection', async (_e, id: string, sectionId: string) => {
    // Check clean state before stopping preview; switching files must await editor save.
    await (await service.git(rootFor(id))).requireClean()
    if (!(await processManager.stop(id, 'section-change'))) throw new Error('Chưa dừng được preview. Hãy thử lại.')
    return service.select(rootFor(id), sectionId)
  })
  ipcMain.handle('collab:saveDraft', (_e, id: string) => service.draft(rootFor(id)))
  ipcMain.handle('collab:sync', (_e, id: string) => service.sync(rootFor(id)))
  ipcMain.handle('collab:submit', (_e, id: string) => service.submit(rootFor(id)))
  ipcMain.handle('collab:previewEntry', (_e, id: string, mode: 'section' | 'total') => {
    if (!['section', 'total'].includes(mode)) throw new Error('Chế độ preview không hợp lệ.')
    return service.preview(rootFor(id), mode)
  })
  ipcMain.handle('collab:resolveConflict', (_e, id: string, file: string, choice: 'mine' | 'incoming') =>
    service.resolve(rootFor(id), file, choice)
  )
  ipcMain.handle('collab:finishMerge', (_e, id: string) => service.finishMerge(rootFor(id)))
  ipcMain.handle('collab:abortMerge', (_e, id: string) => service.abortMerge(rootFor(id)))
  ipcMain.handle('collab:account', () => githubService.account())
  ipcMain.handle('collab:beginLogin', async (_e, clientId: string) => {
    const login = await githubService.beginLogin(clientId)
    await shell.openExternal('https://github.com/login/device')
    return login
  })
  ipcMain.handle('collab:pollLogin', () => githubService.pollLogin())
  ipcMain.handle('collab:logout', () => githubService.logout())
  ipcMain.handle('collab:openPr', (_e, url: string) => {
    if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+$/.test(url))
      throw new Error('Link PR không hợp lệ.')
    return shell.openExternal(url)
  })
  ipcMain.handle('collab:exportMain', async (event, id: string, format: string, options: any) => {
    if (!['pdf', 'pptx', 'build'].includes(format)) throw new Error('Cộng tác hỗ trợ export PDF, PPTX và web tĩnh.')
    const root = rootFor(id)
    const win = BrowserWindow.fromWebContents(event.sender)
    const { runSingleExport } = await import('./export.ipc')
    return service.withMainSnapshot(root, (snapshot) =>
      runSingleExport(
        snapshot,
        'slides.md',
        format as 'pdf' | 'pptx' | 'build',
        {
          ...options,
          outputDir: `${root}/export`,
          outputName: format === 'build' ? 'main-web' : 'main'
        },
        (message) => {
          if (win && !win.isDestroyed()) win.webContents.send('export:log', message)
        },
        true
      )
    )
  })
}
