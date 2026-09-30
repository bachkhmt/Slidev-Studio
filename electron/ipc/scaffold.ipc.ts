import { ipcMain, BrowserWindow } from 'electron'
import { scaffolder, TemplateInfo } from '../services/scaffolder'
import { ProjectItem } from '../services/projectStore'

export function registerScaffoldIpc(): void {
  ipcMain.handle('scaffold:listTemplates', async (): Promise<TemplateInfo[]> => {
    return scaffolder.listTemplates()
  })

  ipcMain.handle(
    'scaffold:create',
    async (
      event,
      options: {
        name: string
        targetDir: string
        templateId: string
        title: string
        author: string
        customTheme?: string
      }
    ): Promise<ProjectItem> => {
      const win = BrowserWindow.fromWebContents(event.sender)
      return scaffolder.createProject(options, win)
    }
  )
}
