import path from 'path'
import { canonicalPath, samePath } from './path'
import { projectStore } from '../services/projectStore'

function isWithin(root: string, target: string): boolean {
  const normalizedRoot = process.platform === 'win32' ? root.toLowerCase() : root
  const normalizedTarget = process.platform === 'win32' ? target.toLowerCase() : target
  const relative = path.relative(normalizedRoot, normalizedTarget)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

export function assertInsideAllowedRoot(target: string, access: 'read' | 'write' | 'project' = 'read'): string {
  if (typeof target !== 'string' || !target.trim()) throw new Error('Đường dẫn không hợp lệ')
  const resolvedTarget = canonicalPath(target)
  const roots = projectStore.getProjects().map((project) => canonicalPath(project.path))
  if (access === 'read') roots.push(canonicalPath(projectStore.getConfigDir()))
  if (!roots.some((root) => isWithin(root, resolvedTarget))) {
    throw new Error('Đường dẫn nằm ngoài các dự án đã đăng ký')
  }
  return resolvedTarget
}

export function assertRegisteredProjectRoot(target: string): string {
  const resolvedTarget = canonicalPath(target)
  if (!projectStore.getProjects().some((project) => samePath(project.path, resolvedTarget))) {
    throw new Error('Đường dẫn nằm ngoài các dự án đã đăng ký')
  }
  return resolvedTarget
}
