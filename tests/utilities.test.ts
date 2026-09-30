import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import net from 'net'
import path from 'path'
import os from 'os'
import fs from 'fs-extra'
import { stripAnsi } from '../electron/utils/stripAnsi'
import { PortAllocator } from '../electron/services/portFinder'
import { waitForReady } from '../electron/services/waitForReady'
import { samePath } from '../electron/utils/path'
import { DEFAULT_SETTINGS } from '../shared/settings'

const servers: net.Server[] = []
let ProjectStoreType: typeof import('../electron/services/projectStore').ProjectStore
let testHome = ''

beforeAll(async () => {
  testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'slidev-studio-test-'))
  vi.spyOn(os, 'homedir').mockReturnValue(testHome)
  ;({ ProjectStore: ProjectStoreType } = await import('../electron/services/projectStore'))
})

afterAll(() => {
  vi.restoreAllMocks()
  if (testHome) fs.removeSync(testHome)
})

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
})

describe('stripAnsi', () => {
  it('removes terminal color and style sequences', () => {
    expect(stripAnsi('\u001b[1mhttp://localhost:\u001b[22m3030\u001b[0m/')).toBe('http://localhost:3030/')
  })
})

describe('PortAllocator', () => {
  it('reserves different ports for parallel starts', async () => {
    const probe = net.createServer()
    servers.push(probe)
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve))
    const address = probe.address()
    if (!address || typeof address === 'string') throw new Error('Could not allocate a test port')
    const firstPort = address.port
    await new Promise<void>((resolve) => probe.close(() => resolve()))
    servers.splice(servers.indexOf(probe), 1)

    const allocator = new PortAllocator()
    const ports = await Promise.all([
      allocator.acquire(firstPort, 50, false, 'project-a'),
      allocator.acquire(firstPort, 50, false, 'project-b'),
      allocator.acquire(firstPort, 50, false, 'project-c')
    ])
    expect(new Set(ports).size).toBe(3)
    ports.forEach((port) => allocator.release(port))
  })
})

describe('ProjectStore settings and paths', () => {
  it('deep merges and sanitizes settings without mutating shared defaults', () => {
    const store = Object.create(ProjectStoreType.prototype) as any
    store.data = { settings: structuredClone(DEFAULT_SETTINGS) }
    const sourceJumpDefaults = structuredClone(DEFAULT_SETTINGS.preview.sourceJump)
    const merged = store.deepMerge(structuredClone(DEFAULT_SETTINGS), { preview: { sourceJump: { enabled: false } } })
    const sanitized = store.sanitizeSettings(merged)
    expect(sanitized.preview.sourceJump.enabled).toBe(false)
    expect(DEFAULT_SETTINGS.preview.sourceJump).toEqual(sourceJumpDefaults)
  })

  it('compares canonical paths', () => {
    expect(samePath(path.join(process.cwd(), '.'), process.cwd())).toBe(true)
  })

  it('recognizes BOM and leading whitespace and merges detected entry files in user order', async () => {
    const folder = fs.mkdtempSync(path.join(testHome, 'entry-merge-'))
    fs.writeFileSync(path.join(folder, 'slides-a.md'), '\n  ---\ntitle: A\n---\n# A\n')
    fs.writeFileSync(path.join(folder, 'slides-b.md'), '\uFEFF  \n---\nlayout: cover\n---\n# B\n')
    const store = Object.create(ProjectStoreType.prototype) as any
    store.data = { projects: [{ id: 'existing', name: 'entry', path: folder, entryFiles: ['slides-b.md', 'removed.md'], trusted: false }], settings: structuredClone(DEFAULT_SETTINGS) }
    store.save = () => {}
    const project = await store.addProjectFromFolder(folder)
    expect(project.entryFiles).toEqual(['slides-b.md', 'slides-a.md'])
    expect(project.trusted).toBe(false)
  })

  it('marks a newly added external folder untrusted', async () => {
    const folder = fs.mkdtempSync(path.join(testHome, 'untrusted-'))
    fs.writeFileSync(path.join(folder, 'slides.md'), '---\ntitle: External\n---\n# Slide\n')
    const store = Object.create(ProjectStoreType.prototype) as any
    store.data = { projects: [], settings: structuredClone(DEFAULT_SETTINGS) }
    store.save = () => {}
    const project = await store.addProjectFromFolder(folder)
    expect(project.trusted).toBe(false)
  })
})

describe('waitForReady', () => {
  it('resolves after a local TCP server starts accepting connections', async () => {
    const server = net.createServer((socket) => socket.end())
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Could not allocate a test port')
    await expect(waitForReady(address.port, { timeoutMs: 1000, intervalMs: 10 })).resolves.toBeUndefined()
  })

  it('resolves when Slidev listens only on IPv6 localhost', async ({ skip }) => {
    const server = net.createServer((socket) => socket.end())
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '::1', resolve)
      })
    } catch {
      skip()
      return
    }
    servers.push(server)
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Could not allocate a test port')
    await expect(waitForReady(address.port, { timeoutMs: 1000, intervalMs: 10 })).resolves.toBeUndefined()
  })
})
