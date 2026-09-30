import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import net from 'net'
import { spawn, type ChildProcess } from 'child_process'
import { execa } from 'execa'
import getPort from 'get-port'
import { parse } from 'yaml'
import { branchFor, isSectionFile, parseManifest } from '../shared/collab'
import { CollabGit } from '../electron/services/collabGit'
import { readCollabManifest, ensureSectionPreview, projectFile } from '../electron/services/collabProject'
import { CollaborationService } from '../electron/services/collaboration'
import type { GitHubService } from '../electron/services/githubService'

const manifest = parseManifest({
  title: 'Báo cáo',
  coordinator: 'leader',
  mainBranch: 'main',
  branchPattern: 'feature/{owner}-{sectionId}',
  sections: [
    { id: '01-intro', file: 'sections/01-intro.md', owner: 'alice' },
    { id: '02-analysis', file: 'sections/02-analysis.md', owner: 'bob' },
    { id: '03-demo', file: 'sections/03-demo.md', owner: 'carol' }
  ]
})
const initial = '# Intro\n\nOriginal\n'
let temp: string
let origin: string
let daemon: ChildProcess
let counter = 0
const git = async (root: string, args: string[]) => (await execa('git', args, { cwd: root })).stdout
const setupIdentity = async (root: string) => {
  await git(root, ['config', 'user.name', 'Test'])
  await git(root, ['config', 'user.email', 'test@example.com'])
}

beforeAll(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), 'slidev-collab-test-'))
  const seed = path.join(temp, 'seed')
  await fs.ensureDir(seed)
  await git(seed, ['init', '-b', 'main'])
  await setupIdentity(seed)
  await fs.writeJson(path.join(seed, 'slidev-collab.json'), manifest)
  await fs.writeJson(path.join(seed, 'package.json'), { dependencies: {} })
  await fs.writeFile(path.join(seed, '.gitignore'), 'node_modules/\n.slidev-collab-*.md\nexport/\n')
  await fs.writeFile(
    path.join(seed, 'slides.md'),
    '---\ntheme: default\nfonts:\n  sans: Noto Sans\n---\n\n# Cover\n\n---\nsrc: ./sections/01-intro.md\n---\n'
  )
  for (const s of manifest.sections) await fs.outputFile(path.join(seed, s.file), initial)
  await git(seed, ['add', '.'])
  await git(seed, ['commit', '-m', 'initial'])
  const bare = path.join(temp, 'presentation.git')
  await git(temp, ['clone', '--bare', seed, bare])
  const port = await getPort()
  origin = `git://127.0.0.1:${port}/presentation.git`
  daemon = spawn(
    'git',
    [
      'daemon',
      '--reuseaddr',
      '--export-all',
      '--enable=receive-pack',
      `--base-path=${temp}`,
      '--listen=127.0.0.1',
      `--port=${port}`,
      temp
    ],
    { stdio: 'ignore' }
  )
  await new Promise<void>((resolve, reject) => {
    const start = Date.now()
    const connect = () => {
      const socket = net.connect(port, '127.0.0.1')
      socket.once('connect', () => {
        socket.destroy()
        resolve()
      })
      socket.once('error', () => {
        socket.destroy()
        if (Date.now() - start > 5000) reject(new Error('Git daemon unavailable'))
        else setTimeout(connect, 50)
      })
    }
    connect()
  })
}, 20000)
afterAll(async () => {
  daemon?.kill()
  if (temp) await fs.remove(temp)
})
async function clone(): Promise<string> {
  const dir = path.join(temp, `clone-${++counter}`)
  await git(temp, ['clone', origin, dir])
  await setupIdentity(dir)
  return dir
}
function service(): CollaborationService {
  return new CollaborationService({
    getCredentials: async () => undefined,
    account: async () => ({ login: 'alice', clientId: 'test' }),
    findPr: async () => undefined
  } as unknown as GitHubService)
}

describe('manifest and project policy', () => {
  it('maps sections to branches and exact asset directory boundaries', () => {
    expect(branchFor(manifest, manifest.sections[0])).toBe('feature/alice-01-intro')
    expect(isSectionFile(manifest.sections[0], 'sections-assets/01-intro/logo.png')).toBe(true)
    expect(isSectionFile(manifest.sections[0], 'sections-assets/01-intro-other/logo.png')).toBe(false)
    expect(isSectionFile(manifest.sections[0], 'slides.md')).toBe(false)
    expect(isSectionFile(manifest.sections[0], 'sections-assets/01-intro/../02-analysis/chart.png')).toBe(false)
  })
  it.each(['../outside.md', 'sections/../../x.md', '/etc/passwd', 'sections/a\\b.md'])(
    'rejects unsafe section path %s',
    (file) => {
      expect(() => parseManifest({ ...manifest, sections: [{ ...manifest.sections[0], file }] })).toThrow()
    }
  )
  it('rejects duplicate IDs and missing owner placeholders', () => {
    expect(() => parseManifest({ ...manifest, sections: [manifest.sections[0], manifest.sections[0]] })).toThrow()
    expect(() => parseManifest({ ...manifest, branchPattern: 'feature/{sectionId}' })).toThrow()
    expect(() => parseManifest({ ...manifest, sections: [{ ...manifest.sections[0], id: 123 }] })).toThrow()
    expect(() =>
      parseManifest({
        ...manifest,
        sections: [manifest.sections[0], { ...manifest.sections[0], id: '01-INTRO', file: 'sections/01-INTRO.md' }]
      })
    ).toThrow()
  })
  it('builds a root wrapper retaining shared fonts and protects symlink traversal', async () => {
    const root = await clone()
    expect(await readCollabManifest(root)).toEqual(manifest)
    const entry = await ensureSectionPreview(root, manifest.sections[0])
    const text = await fs.readFile(path.join(root, entry), 'utf8')
    const fm = parse(text.match(/^---\n([\s\S]*?)\n---/)![1])
    expect(fm.fonts.sans).toBe('Noto Sans')
    expect(text).toContain('src: ./sections/01-intro.md')
    await fs.symlink(temp, path.join(root, 'escape'), 'dir')
    expect(() => projectFile(root, 'escape/secret.md')).toThrow(/ngoài/)
  })
})

describe('real Git collaboration through local bare remote', () => {
  it('clones, selects, edits, drafts, pushes and fetches into another checkout', async () => {
    const root = await clone()
    const runner = new CollabGit(root)
    await runner.select(manifest, manifest.sections[0])
    await fs.writeFile(path.join(root, manifest.sections[0].file), '# Intro\n\nAlice draft\n')
    await runner.commit(manifest, manifest.sections[0])
    expect(await runner.changedFiles()).toEqual([])
    await runner.push(manifest, manifest.sections[0])
    const other = await clone()
    await git(other, ['checkout', branchFor(manifest, manifest.sections[0])])
    expect(await fs.readFile(path.join(other, manifest.sections[0].file), 'utf8')).toContain('Alice draft')
  })
  it('blocks dirty checkout, wrong ownership, shared changes and global config', async () => {
    const root = await clone()
    const svc = service()
    await expect(svc.select(root, '02-analysis')).rejects.toThrow(/phân công/)
    await svc.select(root, '01-intro')
    await expect(svc.assertWritable(root, path.join(root, 'slides.md'), '# Changed')).rejects.toThrow(/Chỉ được sửa/)
    await expect(
      svc.assertWritable(root, path.join(root, manifest.sections[0].file), '---\ntheme: seriph\n---\n# Changed')
    ).rejects.toThrow(/theme/)
    await fs.writeFile(path.join(root, 'slides.md'), '# Changed')
    await expect(svc.draft(root)).rejects.toThrow(/ngoài phần/)
    await expect(svc.select(root, '01-intro')).rejects.toThrow(/lưu nháp/)
  })
  it('restores the assigned role after restarting with uncommitted changes', async () => {
    const root = await clone()
    await service().select(root, '01-intro')
    const restarted = service()
    await fs.writeFile(path.join(root, manifest.sections[0].file), '# Restored working draft\n')
    expect((await restarted.inspect(root))?.sectionId).toBe('01-intro')
    await restarted.writeFile(root, path.join(root, manifest.sections[0].file), '# Saved after restart\n')
    await restarted.draft(root)
    expect(await new CollabGit(root).changedFiles()).toEqual([])
  })
  it('serializes writes with Git operations', async () => {
    const root = await clone()
    const svc = service()
    await svc.select(root, '01-intro')
    let release: () => void = () => {}
    const blocker = new Promise<void>((resolve) => {
      release = resolve
    })
    const active = svc.exclusive(root, () => blocker)
    await expect(svc.writeFile(root, path.join(root, manifest.sections[0].file), '# Concurrent write')).rejects.toThrow(
      /Đang xử lý/
    )
    release()
    await active
    await svc.writeFile(root, path.join(root, manifest.sections[0].file), '# After operation\n')
    expect(await fs.readFile(path.join(root, manifest.sections[0].file), 'utf8')).toContain('After operation')
  })
  it('blocks already committed violations before push', async () => {
    const root = await clone()
    const runner = new CollabGit(root)
    await runner.select(manifest, manifest.sections[0])
    await fs.outputFile(path.join(root, 'setup/style.css'), 'body {}')
    await git(root, ['add', '.'])
    await git(root, ['commit', '-m', 'wrong scope'])
    await expect(runner.push(manifest, manifest.sections[0])).rejects.toThrow(/setup\/style.css/)
  })
  it('syncs changes from another section and exports a clean main snapshot without switching branches', async () => {
    const root = await clone()
    const svc = service()
    await svc.select(root, '01-intro')
    const before = await git(root, ['branch', '--show-current'])
    const leader = await clone()
    await fs.writeFile(path.join(leader, 'sections/02-analysis.md'), '# New analysis\n')
    await git(leader, ['add', '.'])
    await git(leader, ['commit', '-m', 'merged bob'])
    await git(leader, ['push', 'origin', 'main'])
    const state = await svc.sync(root)
    expect(state.conflicts).toEqual([])
    expect(await fs.readFile(path.join(root, 'sections/02-analysis.md'), 'utf8')).toContain('New analysis')
    await fs.writeFile(path.join(root, manifest.sections[0].file), '# Unsubmitted draft\n')
    await svc.withMainSnapshot(root, async (snapshot) => {
      expect(await fs.readFile(path.join(snapshot, manifest.sections[0].file), 'utf8')).toBe(initial)
      expect(await fs.readFile(path.join(snapshot, 'sections/02-analysis.md'), 'utf8')).toContain('New analysis')
    })
    expect(await git(root, ['branch', '--show-current'])).toBe(before)
    expect(await fs.readFile(path.join(root, manifest.sections[0].file), 'utf8')).toContain('Unsubmitted draft')
  })
  it('exposes conflicts, resolves assigned files and completes merge', async () => {
    const root = await clone()
    const svc = service()
    await svc.select(root, '01-intro')
    await fs.writeFile(path.join(root, manifest.sections[0].file), '# Intro\n\nMine conflict\n')
    await svc.draft(root)
    const leader = await clone()
    await fs.writeFile(path.join(leader, manifest.sections[0].file), '# Intro\n\nIncoming conflict\n')
    await git(leader, ['add', '.'])
    await git(leader, ['commit', '-m', 'incoming conflict'])
    await git(leader, ['push', 'origin', 'main'])
    const conflict = await svc.sync(root)
    expect(conflict.conflicts).toEqual([manifest.sections[0].file])
    await svc.resolve(root, manifest.sections[0].file, 'mine')
    const finished = await svc.finishMerge(root)
    expect(finished.merging).toBe(false)
    expect(await fs.readFile(path.join(root, manifest.sections[0].file), 'utf8')).toContain('Mine conflict')
  })
  it('does not replace local draft when network is unavailable', async () => {
    const root = await clone()
    const runner = new CollabGit(root)
    await runner.select(manifest, manifest.sections[0])
    await fs.writeFile(path.join(root, manifest.sections[0].file), '# Offline draft\n')
    await runner.commit(manifest, manifest.sections[0])
    const sha = await git(root, ['rev-parse', 'HEAD'])
    await git(root, ['remote', 'set-url', 'origin', 'git://127.0.0.1:1/unavailable.git'])
    await expect(runner.sync(manifest)).rejects.toThrow()
    expect(await git(root, ['rev-parse', 'HEAD'])).toBe(sha)
    expect(await fs.readFile(path.join(root, manifest.sections[0].file), 'utf8')).toContain('Offline draft')
  })
})
