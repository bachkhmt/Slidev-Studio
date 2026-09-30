import fs from 'fs'
import path from 'path'

export function canonicalPath(input: string): string {
  const resolved = path.resolve(input)
  try { return fs.realpathSync.native(resolved) } catch { /* Resolve through the nearest existing parent below. */ }
  const suffix: string[] = []
  let parent = resolved
  while (!fs.existsSync(parent)) {
    const next = path.dirname(parent)
    if (next === parent) return resolved
    suffix.unshift(path.basename(parent))
    parent = next
  }
  try { return path.join(fs.realpathSync.native(parent), ...suffix) } catch { return resolved }
}

export function samePath(first: string, second: string): boolean {
  const a = canonicalPath(first)
  const b = canonicalPath(second)
  return process.platform === 'darwin' || process.platform === 'win32'
    ? a.toLocaleLowerCase() === b.toLocaleLowerCase()
    : a === b
}
