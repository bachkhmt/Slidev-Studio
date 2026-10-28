import { afterEach, expect, it, vi } from 'vitest'
vi.mock('../src/ipc-client', () => ({ default: { fs: { readFile: async () => '', writeFile: async () => true } } }))
import { documents } from '../src/state/documents'
import { modelCache } from '../src/state/modelCache'
afterEach(() => documents.reset())
function model() {
  let disposed = false
  return {
    dispose: vi.fn(() => {
      disposed = true
    }),
    isDisposed: () => disposed,
    isAttachedToEditor: () => false
  }
}
it('bounds saved models, pins dirty models, and releases resources over 20 cycles', async () => {
  await documents.load('/pool/dirty.md')
  documents.edit('/pool/dirty.md', 'draft')
  const dirty = model()
  modelCache.touch('/pool/dirty.md', dirty)
  for (let i = 0; i < 30; i++) modelCache.touch(`/pool/${i}.md`, model())
  expect(modelCache.size).toBe(11)
  expect(dirty.dispose).not.toHaveBeenCalled()
  modelCache.release('/pool')
  modelCache.prune()
  expect(modelCache.size).toBe(0)
  for (let i = 0; i < 20; i++) {
    const m = model()
    modelCache.touch(`/cycle/${i}.md`, m)
    modelCache.release('/cycle')
    modelCache.prune()
    expect(m.dispose).toHaveBeenCalledTimes(1)
    expect(modelCache.size).toBe(0)
  }
})
