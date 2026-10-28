import { expect, it, vi } from 'vitest'
import { FileContentCache } from '../src/lib/fileContentCache'
it('reuses unchanged files, detects external changes and invalidates explicitly', async () => {
  let mtimeMs = 1
  const io = { statFile: vi.fn(async () => ({ mtimeMs, size: 12 })), readFile: vi.fn(async () => `content-${mtimeMs}`) }
  const cache = new FileContentCache(io)
  expect(await cache.read('/a')).toBe('content-1')
  expect(await cache.read('/a')).toBe('content-1')
  expect(io.readFile).toHaveBeenCalledTimes(1)
  mtimeMs = 2
  expect(await cache.read('/a')).toBe('content-2')
  expect(io.readFile).toHaveBeenCalledTimes(2)
  cache.clear()
  await cache.read('/a')
  expect(io.readFile).toHaveBeenCalledTimes(3)
})
