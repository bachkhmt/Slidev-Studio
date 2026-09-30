import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { execa } from 'execa'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/settings'

vi.mock('../electron/services/projectStore', () => ({
  projectStore: {
    getSettings: () => ({
      ...DEFAULT_SETTINGS,
      projects: { ...DEFAULT_SETTINGS.projects, gitInitOnCreate: false },
      server: { ...DEFAULT_SETTINGS.server, autoInstallDeps: false }
    }),
    addProjectFromFolder: async (root: string) => ({
      id: 'test',
      path: root,
      name: path.basename(root),
      entryFiles: ['slides.md'],
      gitUrl: null,
      trusted: true
    })
  }
}))
vi.mock('../electron/services/collabRuntime', () => ({
  githubService: { getCredentials: async () => ({ login: 'leader', token: 'test-only-token' }) }
}))
import { Scaffolder } from '../electron/services/scaffolder'
import { readCollabManifest } from '../electron/services/collabProject'
import { githubService } from '../electron/services/collabRuntime'
let root: string
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'slidev-scaffold-collab-'))
})
afterEach(async () => {
  vi.restoreAllMocks()
  await fs.remove(root)
})
const options = () => ({
  name: 'team-presentation',
  targetDir: root,
  templateId: 'git-collab',
  title: "Báo cáo 'AI': Cộng tác",
  author: 'Nhóm báo cáo',
  collabOwners: ['alice', 'bob', 'carol'],
  collabCoordinator: 'leader'
})

describe('collaboration project creation', () => {
  it('creates the initial generated commit without requiring login or global Git identity', async () => {
    vi.spyOn(githubService, 'getCredentials').mockResolvedValue(undefined)
    const project = await new Scaffolder().createProject(options())
    expect((await execa('git', ['log', '-1', '--format=%an <%ae>'], { cwd: project.path })).stdout).toBe(
      'Slidev Studio <slidev-studio@localhost>'
    )
    expect((await execa('git', ['status', '--porcelain'], { cwd: project.path })).stdout).toBe('')
  })
  it('creates assigned sections, coordinator review ownership and clean main history', async () => {
    const project = await new Scaffolder().createProject(options())
    const manifest = await readCollabManifest(project.path)
    expect(manifest?.title).toBe(options().title)
    expect(manifest?.sections.map((s) => s.owner)).toEqual(['alice', 'bob', 'carol'])
    expect(manifest?.coordinator).toBe('leader')
    const owners = await fs.readFile(path.join(project.path, '.github/CODEOWNERS'), 'utf8')
    expect(owners).toContain('/sections/01-intro.md @alice @leader')
    expect(owners).toContain('/sections-assets/02-analysis/ @bob @leader')
    expect((await fs.readJson(path.join(project.path, 'package.json'))).dependencies['@slidev/cli']).toBe('53.0.0')
    expect((await execa('git', ['branch', '--show-current'], { cwd: project.path })).stdout).toBe('main')
    expect((await execa('git', ['status', '--porcelain'], { cwd: project.path })).stdout).toBe('')
    expect(await fs.pathExists(path.join(project.path, '.github/workflows/review.yml'))).toBe(true)
    expect(await fs.pathExists(path.join(project.path, 'previews/03-demo.md'))).toBe(true)
  })
  it('rejects incomplete assignments before creating the project folder', async () => {
    await expect(new Scaffolder().createProject({ ...options(), collabOwners: ['alice'] })).rejects.toThrow(
      /ba section/
    )
    await expect(new Scaffolder().createProject({ ...options(), collabCoordinator: '' })).rejects.toThrow(/coordinator/)
    expect(await fs.readdir(root)).toEqual([])
  })
})
