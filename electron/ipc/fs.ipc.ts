import { ipcMain, shell } from 'electron'
import fs from 'fs-extra'
import path from 'path'
import { assertInsideAllowedRoot } from '../utils/pathGuard'
import { atomicWriteFile } from '../utils/atomicWrite'
import { projectStore } from '../services/projectStore'
import { collaborationService } from '../services/collabRuntime'

export interface FileNode {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

const IGNORED_NAMES = new Set(['node_modules', '.git', 'dist', '.DS_Store', '.slidev', '.output', '.temp'])

async function buildTree(dirPath: string, depth = 0): Promise<FileNode[]> {
  if (depth > 6) return []
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const nodes: FileNode[] = []

  for (const entry of entries) {
    if (IGNORED_NAMES.has(entry.name)) continue
    const fullPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      const children = await buildTree(fullPath, depth + 1)
      nodes.push({
        name: entry.name,
        path: fullPath,
        isDirectory: true,
        children
      })
    } else {
      nodes.push({
        name: entry.name,
        path: fullPath,
        isDirectory: false
      })
    }
  }

  // Sort: directories first, then alphabetical
  return nodes.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1
    if (!a.isDirectory && b.isDirectory) return 1
    return a.name.localeCompare(b.name)
  })
}

export function registerFsIpc(): void {
  ipcMain.handle('fs:listDirectory', async (_event, dir: string): Promise<FileNode[]> => {
    const safe = assertInsideAllowedRoot(dir, 'read')
    const entries = await fs.readdir(safe, { withFileTypes: true })
    return entries
      .filter((e) => !IGNORED_NAMES.has(e.name) && !e.isSymbolicLink())
      .map((e) => ({ name: e.name, path: path.join(safe, e.name), isDirectory: e.isDirectory() }))
      .sort((a, b) => Number(b.isDirectory) - Number(a.isDirectory) || a.name.localeCompare(b.name))
  })
  ipcMain.handle('fs:statFile', async (_event, file: string) => {
    const stat = await fs.stat(assertInsideAllowedRoot(file, 'read'))
    return { mtimeMs: stat.mtimeMs, size: stat.size }
  })
  ipcMain.handle('fs:readFile', async (_event, filePath: string): Promise<string> => {
    return fs.readFile(assertInsideAllowedRoot(filePath, 'read'), 'utf8')
  })

  ipcMain.handle('fs:writeFile', async (_event, filePath: string, content: string): Promise<boolean> => {
    const safePath = assertInsideAllowedRoot(filePath, 'write')
    const projects = [...projectStore.getProjects()].sort((a, b) => b.path.length - a.path.length)
    for (const project of projects) {
      const relative = path.relative(project.path, safePath)
      if (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
        await collaborationService.writeFile(project.path, safePath, content)
        return true
      }
    }
    await atomicWriteFile(safePath, content)
    return true
  })

  ipcMain.handle('fs:listTree', async (_event, rootPath: string): Promise<FileNode[]> => {
    const safePath = assertInsideAllowedRoot(rootPath, 'read')
    if (!fs.existsSync(safePath)) return []
    return buildTree(safePath)
  })

  ipcMain.handle('fs:showInFolder', async (_event, fullPath: string): Promise<void> => {
    const safePath = assertInsideAllowedRoot(fullPath, 'read')
    if (fs.existsSync(safePath)) {
      shell.showItemInFolder(safePath)
    }
  })
}
