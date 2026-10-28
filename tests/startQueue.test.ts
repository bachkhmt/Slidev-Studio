import { describe, expect, it, vi } from 'vitest'
vi.mock('electron', () => ({ BrowserWindow: class {}, app: { isPackaged: false } }))
vi.mock('../electron/services/projectStore', async () => {
  const { DEFAULT_SETTINGS } = await import('../shared/settings')
  return { projectStore: { getSettings: () => DEFAULT_SETTINGS } }
})
vi.mock('../electron/utils/diag', () => ({ diag: () => {} }))
import { ProcessManager } from '../electron/services/processManager'
describe('bounded server starts', () => {
  it('starts at most two projects concurrently and cancels a queued project', async () => {
    const manager = new ProcessManager()
    const finish: Array<() => void> = []
    const started: string[] = []
    ;(manager as any).startInternal = vi.fn((id: string) => {
      started.push(id)
      return new Promise((resolve) => finish.push(() => resolve({ port: 3030, url: 'http://localhost:3030' })))
    })
    const a = manager.start('a', '/a', 'slides.md'),
      b = manager.start('b', '/b', 'slides.md'),
      c = manager.start('c', '/c', 'slides.md').catch((e) => e)
    await Promise.resolve()
    expect(started).toEqual(['a', 'b'])
    await manager.stop('c')
    finish.forEach((fn) => fn())
    await Promise.all([a, b, c])
    expect(started).toEqual(['a', 'b'])
  })
})
