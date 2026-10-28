import { afterEach, describe, expect, it, vi } from 'vitest'
import { DocumentStore } from '../src/state/documentStore'
import { DEFAULT_SETTINGS } from '../shared/settings'
const stores: DocumentStore[] = []
function setup() {
  const io = { readFile: vi.fn(async () => '# initial'), writeFile: vi.fn(async () => {}) }
  const store = new DocumentStore(io)
  stores.push(store)
  store.configure({ ...DEFAULT_SETTINGS.editor, autoSave: 'off' })
  return { store, io }
}
afterEach(() => {
  stores.forEach((s) => s.reset())
  stores.length = 0
  vi.useRealTimers()
})
describe('revisioned document saves and close policy', () => {
  it('flushes a project containing clean read-only shared files before selecting a team section', async () => {
    const { store, io } = setup()
    await store.load('/team/slides.md')
    store.setWritable('/team/slides.md', false)
    await expect(store.flushProject('/team')).resolves.toBeUndefined()
    expect(io.writeFile).not.toHaveBeenCalled()
  })
  it('does not flush a dirty file after section write permission has been revoked', async () => {
    const { store, io } = setup()
    await store.load('/team/sections/intro.md')
    store.edit('/team/sections/intro.md', '# draft')
    store.setWritable('/team/sections/intro.md', false)
    await expect(store.flushProject('/team')).rejects.toThrow(/chỉ xem/)
    expect(io.writeFile).not.toHaveBeenCalled()
    expect(store.get('/team/sections/intro.md').revision).not.toBe(store.get('/team/sections/intro.md').savedRevision)
  })
  it('refreshes a clean cached document after an external change but preserves a dirty draft', async () => {
    const { store, io } = setup()
    let mtimeMs = 1
    Object.assign(io, { statFile: async () => ({ mtimeMs, size: 10 }) })
    await store.load('/external.md')
    io.readFile.mockResolvedValue('# changed outside')
    mtimeMs++
    await store.load('/external.md')
    expect(store.get('/external.md').content).toBe('# changed outside')
    store.edit('/external.md', '# my draft')
    io.readFile.mockResolvedValue('# another outside change')
    mtimeMs++
    await store.load('/external.md')
    expect(store.get('/external.md').content).toBe('# my draft')
  })
  it('does not allow an unread file to be overwritten after a read error', async () => {
    const { store, io } = setup()
    io.readFile.mockRejectedValue(new Error('read denied'))
    await store.load('/unread.md')
    store.edit('/unread.md', 'replacement')
    await store.save('/unread.md')
    expect(io.writeFile).not.toHaveBeenCalled()
    expect(store.get('/unread.md').revision).toBe(0)
  })
  it('serializes revisions and coalesces duplicate saves', async () => {
    const { store, io } = setup()
    await store.load('/a.md')
    store.edit('/a.md', 'v1')
    let done!: () => void
    io.writeFile.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          done = r
        })
    )
    const first = store.save('/a.md')
    await Promise.resolve()
    await Promise.resolve()
    store.edit('/a.md', 'v2')
    const second = store.save('/a.md')
    const third = store.save('/a.md')
    done()
    await Promise.all([first, second, third])
    expect(io.writeFile.mock.calls).toEqual([
      ['/a.md', 'v1'],
      ['/a.md', 'v2']
    ])
    expect(store.get('/a.md').savedRevision).toBe(2)
  })
  it('cancelling or failing a close retains the draft', async () => {
    const { store, io } = setup()
    await store.load('/a.md')
    store.edit('/a.md', 'draft')
    expect(await store.prepareClose(undefined, async () => 'cancel')).toBe(false)
    io.writeFile.mockRejectedValue(new Error('disk full'))
    expect(await store.prepareClose(undefined, async () => 'save')).toBe(false)
    expect(store.get('/a.md').content).toBe('draft')
    expect(store.get('/a.md').savedRevision).toBe(0)
  })
  it('autosaves valid content on close before the debounce fires, without prompting', async () => {
    const { store, io } = setup()
    store.configure(DEFAULT_SETTINGS.editor)
    await store.load('/a.md')
    store.edit('/a.md', '# final')
    const choose = vi.fn()
    expect(await store.prepareClose(undefined, choose)).toBe(true)
    expect(io.writeFile).toHaveBeenCalledWith('/a.md', '# final')
    expect(choose).not.toHaveBeenCalled()
  })
  it('guard blocks automatic writes and manual save is explicit', async () => {
    const { store, io } = setup()
    store.configure(DEFAULT_SETTINGS.editor)
    await store.load('/a.md')
    store.edit('/a.md', '```js\nunclosed')
    expect(await store.prepareClose(undefined, async () => 'cancel')).toBe(false)
    expect(io.writeFile).not.toHaveBeenCalled()
    expect(await store.prepareClose(undefined, async () => 'save')).toBe(true)
    expect(io.writeFile).toHaveBeenCalledTimes(1)
  })
  it('coalesces concurrent close requests and never touches another project', async () => {
    const { store, io } = setup()
    await store.load('/a/slides.md')
    await store.load('/b/slides.md')
    store.edit('/a/slides.md', 'a')
    store.edit('/b/slides.md', 'b')
    let choose!: (v: 'cancel') => void
    const prompt = vi.fn(
      () =>
        new Promise<'cancel'>((r) => {
          choose = r
        })
    )
    const p = store.prepareClose('/a', prompt)
    const q = store.prepareClose('/a', prompt)
    await vi.waitFor(() => expect(prompt).toHaveBeenCalledTimes(1))
    choose('cancel')
    await Promise.all([p, q])
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(io.writeFile).not.toHaveBeenCalled()
  })
  it('a window-close request also flushes other projects after an in-flight tab close', async () => {
    const { store, io } = setup()
    await store.load('/a/slides.md')
    await store.load('/b/slides.md')
    store.edit('/a/slides.md', 'a')
    store.edit('/b/slides.md', 'b')
    let resolve!: (choice: 'save') => void
    const first = store.prepareClose(
      '/a',
      () =>
        new Promise<'save'>((r) => {
          resolve = r
        })
    )
    const all = store.prepareClose(undefined, async () => 'save')
    await vi.waitFor(() => expect(resolve).toBeTypeOf('function'))
    resolve('save')
    expect(await first).toBe(true)
    expect(await all).toBe(true)
    expect(io.writeFile).toHaveBeenCalledWith('/b/slides.md', 'b')
  })
})
