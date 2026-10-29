import { ipcMain, dialog, BrowserWindow, shell } from 'electron'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { projectStore, ProjectItem } from '../services/projectStore'
import { processManager } from '../services/processManager'
import type { DeepPartial } from '../../shared/settings'
import { canonicalPath, samePath } from '../utils/path'

function isSameOrInside(parentPath: string, candidatePath: string): boolean {
  const relative = path.relative(parentPath, candidatePath)
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative))
}

export function registerProjectsIpc(): void {
  ipcMain.handle('projects:list', async (): Promise<ProjectItem[]> => {
    return projectStore.getProjects()
  })

  ipcMain.handle('projects:addFolder', async (event, folderPath?: string): Promise<ProjectItem> => {
    let target = folderPath
    if (!target) {
      const win = BrowserWindow.fromWebContents(event.sender)
      const res = await dialog.showOpenDialog(win || BrowserWindow.getFocusedWindow()!, {
        title: 'Chọn thư mục Slidev hoặc báo cáo LaTeX',
        properties: ['openDirectory', 'createDirectory']
      })
      if (res.canceled || res.filePaths.length === 0) {
        throw new Error('Đã huỷ chọn thư mục')
      }
      target = res.filePaths[0]
    }
    return projectStore.addProjectFromFolder(target)
  })

  ipcMain.handle('projects:remove', async (_event, id: string): Promise<boolean> => {
    const project = projectStore.getProject(id)
    if (!project) return false

    if (project.kind === 'latex' || project.kind === 'markdown-report') await (await import('../services/reportManager')).reportManager.release(id)

    const stopped = await processManager.stop(id, 'project-removed')
    if (!stopped) throw new Error('Không thể xác nhận máy chủ đã dừng. Dự án vẫn được giữ trong danh sách để thử lại.')

    const projectPath = path.resolve(project.path)
    const stat = await fs.lstat(projectPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })

    if (stat) {
      if (stat.isSymbolicLink()) throw new Error('Không thể xoá dự án qua đường dẫn liên kết. Hãy mở thư mục thật rồi thêm lại dự án.')
      if (!stat.isDirectory()) throw new Error('Đường dẫn dự án không còn là thư mục nên không thể đưa vào Thùng rác.')

      const realProjectPath = canonicalPath(projectPath)
      const filesystemRoot = path.parse(realProjectPath).root
      if (samePath(realProjectPath, filesystemRoot)
        || samePath(realProjectPath, os.homedir())
        || samePath(realProjectPath, projectStore.getConfigDir())) {
        throw new Error('Đường dẫn này chứa dữ liệu hệ thống hoặc cấu hình Slidev Studio nên không thể xoá.')
      }

      const containsAnotherProject = projectStore.getProjects().some((other) => {
        if (other.id === project.id) return false
        const otherPath = canonicalPath(other.path)
        return isSameOrInside(realProjectPath, otherPath) || isSameOrInside(otherPath, realProjectPath)
      })
      if (containsAnotherProject) {
        throw new Error('Không thể xoá thư mục này vì nó nằm trong hoặc chứa thư mục của một dự án Slidev Studio khác.')
      }

      await shell.trashItem(realProjectPath)
    }

    return projectStore.removeProject(id)
  })

  ipcMain.handle('projects:updateProject', async (_event, id: string, partial: Partial<ProjectItem>) => {
    const safe: Partial<ProjectItem> = {}
    if (typeof partial?.name === 'string' && partial.name.trim().length >= 1 && partial.name.trim().length <= 100) {
      safe.name = partial.name.trim()
    }
    if (partial?.preferredPort === undefined || (Number.isInteger(partial?.preferredPort) && partial.preferredPort! >= 1024 && partial.preferredPort! <= 65535)) {
      if ('preferredPort' in (partial || {})) safe.preferredPort = partial.preferredPort
    }
    const entryExtension = projectStore.getProject(id)?.kind === 'latex' ? '.tex' : '.md'
    if (Array.isArray(partial?.entryFiles) && partial.entryFiles.every((file) => typeof file === 'string' && file.endsWith(entryExtension) && !/[\\/]|\.\./.test(file) && !file.startsWith('-'))) {
      safe.entryFiles = partial.entryFiles
    }
    return projectStore.updateProject(id, safe)
  })

  ipcMain.handle('projects:cloneFromGit', async (_event, url: string, targetDir: string): Promise<ProjectItem> => {
    return projectStore.cloneFromGit(url, targetDir)
  })

  ipcMain.handle('projects:cloneProject', async (_event, id: string, targetDir: string): Promise<ProjectItem> => {
    const activePort = processManager.getStatus(id)?.port
    return projectStore.cloneProject(id, targetDir, activePort)
  })

  ipcMain.handle('projects:getSettings', async () => {
    return projectStore.getSettings()
  })

  ipcMain.handle('projects:updateSettings', async (_event, partial: DeepPartial<ReturnType<typeof projectStore.getSettings>>) => {
    return projectStore.updateSettings(partial)
  })

  ipcMain.handle('projects:selectDirectory', async (event, title?: string): Promise<string | null> => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const res = await dialog.showOpenDialog(win || BrowserWindow.getFocusedWindow()!, {
      title: title || 'Chọn thư mục',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) {
      return null
    }
    return res.filePaths[0]
  })
}
