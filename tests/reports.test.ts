import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import path from 'path'
import os from 'os'
import fs from 'fs-extra'
import { EventEmitter } from 'events'
import { DEFAULT_SETTINGS } from '../shared/settings'

const mocks = vi.hoisted(() => ({ execa: vi.fn(), command: vi.fn(), treeKill: vi.fn() }))
vi.mock('electron', () => ({ app: { isPackaged: false } }))
vi.mock('execa', () => ({ execa: mocks.execa }))
vi.mock('tree-kill', () => ({ default: mocks.treeKill }))
vi.mock('../electron/services/compilerRuntime', () => ({ compilerRuntime: { command: mocks.command } }))
vi.mock('../electron/services/projectStore', () => ({
  projectStore: {
    getSettings: () => DEFAULT_SETTINGS,
    addProjectFromFolder: async (root: string) => ({
      id: 'report',
      kind: 'latex',
      path: root,
      name: path.basename(root),
      entryFiles: ['main.tex']
    })
  }
}))
import { ReportManager, reportBuildDir, reportEntry } from '../electron/services/reportManager'
import { Scaffolder } from '../electron/services/scaffolder'

let root: string
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-report-test-'))
  await fs.writeFile(path.join(root, 'main.tex'), '\\documentclass{article}\\begin{document}Report\\end{document}')
  mocks.command.mockResolvedValue('tectonic')
})
afterEach(async () => {
  vi.clearAllMocks()
  await fs.remove(root)
})

function fakeChild(run: () => Promise<{ exitCode: number }>) {
  const stdout = new EventEmitter(),
    stderr = new EventEmitter()
  return Object.assign(Promise.resolve().then(run), { stdout, stderr, pid: 12345 })
}

describe('report compiler', () => {
  it('compiles in a dedicated job directory and publishes a verified PDF with shell escape disabled', async () => {
    mocks.execa.mockImplementation((_command, args) =>
      fakeChild(async () => {
        const output = args[args.indexOf('--outdir') + 1]
        await fs.writeFile(path.join(output, 'main.pdf'), '%PDF-1.7\ncompiled')
        return { exitCode: 0 }
      })
    )
    const manager = new ReportManager()
    const state = await manager.compile('r', root, 'main.tex')
    expect(state.state).toBe('ready')
    const [, args, options] = mocks.execa.mock.calls[0]
    expect(args).toContain('--untrusted')
    expect(options.env.TECTONIC_UNTRUSTED_MODE).toBe('1')
    expect(options.cwd).toBe(root)
    expect(await fs.readFile(await manager.pdfPath(root, 'main.tex'), 'utf8')).toContain('compiled')
    expect((await fs.readdir(path.join(root, '.studio-latex'))).filter((name) => name.startsWith('job-'))).toEqual([])
    expect(await fs.readFile(path.join(root, 'main.tex'), 'utf8')).toContain('Report')
  })
  it('retains the last good PDF after a compiler failure', async () => {
    const manager = new ReportManager()
    const output = await manager.pdfPath(root, 'main.tex')
    await fs.writeFile(output, '%PDF-1.7\nprevious good report')
    mocks.execa.mockImplementation(() => fakeChild(async () => ({ exitCode: 1 })))
    expect((await manager.compile('r', root, 'main.tex')).state).toBe('error')
    expect(await fs.readFile(output, 'utf8')).toContain('previous good report')
  })
  it('cancels an active compile, rejects a duplicate job and waits for process exit', async () => {
    let finish!: (result: { exitCode: number }) => void
    mocks.execa.mockImplementation(() =>
      Object.assign(
        new Promise((resolve) => {
          finish = resolve
        }),
        {
          pid: 12345,
          stdout: new EventEmitter(),
          stderr: new EventEmitter()
        }
      )
    )
    mocks.treeKill.mockImplementation((_pid, _signal, callback) => {
      finish({ exitCode: 1 })
      callback()
    })
    const manager = new ReportManager()
    const started = manager.compile('r', root, 'main.tex')
    await vi.waitFor(() => expect(mocks.execa).toHaveBeenCalled())
    await expect(manager.compile('r', root, 'main.tex')).rejects.toThrow('đang được biên dịch')
    await manager.cancel('r')
    expect((await started).state).toBe('cancelled')
    expect(mocks.treeKill).toHaveBeenCalledWith(12345, 'SIGKILL', expect.any(Function))
  })
  it('rejects traversal, CLI option filenames and linked build folders', async () => {
    expect(() => reportEntry(root, '../outside.tex')).toThrow()
    expect(() => reportEntry(root, '-danger.tex')).toThrow()
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-report-outside-'))
    try {
      await fs.symlink(outside, path.join(root, '.studio-latex'), process.platform === 'win32' ? 'junction' : 'dir')
      await expect(reportBuildDir(root)).rejects.toThrow('không hợp lệ')
      await fs.unlink(path.join(root, '.studio-latex'))
      expect(await fs.readdir(outside)).toEqual([])
    } finally {
      await fs.remove(outside)
    }
  })
})

describe('report template', () => {
  it('creates a Markdown report without a compiler, npm or TeX source', async () => {
    const project = await new Scaffolder().createProject({ name: 'md-report', targetDir: root, templateId: 'dl-assignment-markdown', title: 'AI: "Markdown" & $value', author: 'Nguyễn Văn A' })
    expect(mocks.execa).not.toHaveBeenCalled()
    const main = await fs.readFile(path.join(project.path, 'main.md'), 'utf8')
    expect(main).toContain('title: "AI: \\"Markdown\\" & $value"')
    expect(main).toContain('# Sample Section')
    expect(await fs.pathExists(path.join(project.path, 'main.tex'))).toBe(false)
    expect((await fs.readJson(path.join(project.path, 'studio-report.json'))).kind).toBe('markdown-report')
  })
  it('creates a report without running npm and escapes TeX metadata', async () => {
    const project = await new Scaffolder().createProject({
      name: 'my-report',
      targetDir: root,
      templateId: 'dl-assignment-report',
      title: 'Deep_Learning & 100% $value \\input{secret}',
      author: 'Nguyễn Văn A'
    })
    expect(project.kind).toBe('latex')
    expect(mocks.execa).not.toHaveBeenCalled()
    const main = await fs.readFile(path.join(project.path, 'main.tex'), 'utf8')
    expect(main).toContain('Deep\\_Learning \\& 100\\% \\$value \\textbackslash{}input\\{secret\\}')
    expect(main).toContain('Nguyễn Văn A')
    expect(main).not.toContain('{{REPORT_TITLE}}')
    expect(main).not.toContain('\\usepackage{minted}')
    expect(await fs.pathExists(path.join(project.path, 'image/hcmut.png'))).toBe(true)
    expect(await fs.pathExists(path.join(project.path, 'template-preview.pdf'))).toBe(true)
    expect((await fs.readJson(path.join(project.path, 'studio-report.json'))).mainFile).toBe('main.tex')
    expect(await fs.pathExists(path.join(project.path, 'node_modules'))).toBe(false)
    await expect(
      new Scaffolder().createProject({
        name: 'my-report',
        targetDir: root,
        templateId: 'dl-assignment-report',
        title: '',
        author: ''
      })
    ).rejects.toThrow('đã tồn tại')
  })
})
