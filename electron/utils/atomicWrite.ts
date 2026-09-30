import fs from 'fs-extra'
import path from 'path'
import { randomUUID } from 'crypto'

const pendingWrites = new Map<string, Promise<void>>()

export async function atomicWriteFile(filePath: string, content: string): Promise<void> {
  const safePath = path.resolve(filePath)
  const previous = pendingWrites.get(safePath) || Promise.resolve()
  const write = previous.catch(() => {}).then(async () => {
    await fs.ensureDir(path.dirname(safePath))
    const tempPath = `${safePath}.${randomUUID()}.tmp`
    try {
      await fs.writeFile(tempPath, content, 'utf8')
      await fs.rename(tempPath, safePath)
    } catch (error) {
      await fs.remove(tempPath).catch(() => {})
      throw error
    }
  })
  pendingWrites.set(safePath, write)
  try {
    await write
  } finally {
    if (pendingWrites.get(safePath) === write) pendingWrites.delete(safePath)
  }
}
