import { ipcMain } from 'electron'
import { processManager, ProcessInstance } from '../services/processManager'
import { projectStore } from '../services/projectStore'
import { samePath } from '../utils/path'
import { assertInsideAllowedRoot } from '../utils/pathGuard'
import path from 'path'

function validateProject(projectId: string, projectPath: string, entryFile: string): void {
  const project = projectStore.getProject(projectId)
  if (!project || !samePath(project.path, projectPath)) throw new Error('Dự án không hợp lệ hoặc chưa được đăng ký')
  if (typeof entryFile !== 'string' || !/^[^\\/]+\.md$/i.test(entryFile) || entryFile.includes('..')) {
    throw new Error('File trình chiếu không hợp lệ')
  }
  assertInsideAllowedRoot(path.join(projectPath, entryFile), 'read')
}

export function registerProcessIpc(): void {
  ipcMain.handle(
    'process:start',
    async (
      _event,
      projectId: string,
      projectPath: string,
      entryFile: string
    ): Promise<{ port: number; url: string; lanUrl?: string }> => {
      validateProject(projectId, projectPath, entryFile)
      return processManager.start(projectId, projectPath, entryFile)
    }
  )

  ipcMain.handle('process:stop', async (_event, projectId: string): Promise<boolean> => {
    return processManager.stop(projectId)
  })

  ipcMain.handle(
    'process:restart',
    async (
      _event,
      projectId: string,
      projectPath: string,
      entryFile: string
    ): Promise<{ port: number; url: string; lanUrl?: string }> => {
      validateProject(projectId, projectPath, entryFile)
      return processManager.restart(projectId, projectPath, entryFile)
    }
  )

  ipcMain.handle(
    'process:recompile',
    async (
      _event,
      projectId: string,
      projectPath: string,
      entryFile: string
    ): Promise<{ port: number; url: string; lanUrl?: string }> => {
      validateProject(projectId, projectPath, entryFile)
      return processManager.recompile(projectId, projectPath, entryFile)
    }
  )

  ipcMain.handle('process:getStatus', async (_event, projectId: string): Promise<ProcessInstance | null> => {
    return processManager.getStatus(projectId) as ProcessInstance | null
  })

  ipcMain.handle('process:getLogs', async (_event, projectId: string) => processManager.getLogs(projectId))
  ipcMain.handle('process:confirmTrust', async (_event, requestId: string, choice: 'once' | 'remember' | 'cancel', ignoreScripts: boolean) =>
    processManager.confirmTrust(requestId, choice, ignoreScripts))
}
