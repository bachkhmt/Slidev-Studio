import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import {
  branchFor,
  isSectionFile,
  parseManifest,
  type CollabManifest,
  type CollabSection,
  type CollabStatus
} from '../../shared/collab'
import { readCollabManifest, projectFile, ensureSectionPreview, validateSectionMarkdown } from './collabProject'
import { CollabGit } from './collabGit'
import type { GitHubService } from './githubService'
import { atomicWriteFile } from '../utils/atomicWrite'

export class CollaborationService {
  private busy = new Set<string>()
  private lastManifest = new Map<string, CollabManifest>()
  constructor(private github: GitHubService) {}

  async exclusive<T>(root: string, action: () => Promise<T>): Promise<T> {
    if (this.busy.has(root)) throw new Error('Đang xử lý một thao tác cộng tác. Hãy chờ hoàn tất.')
    this.busy.add(root)
    try {
      return await action()
    } finally {
      this.busy.delete(root)
    }
  }
  async git(root: string): Promise<CollabGit> {
    return new CollabGit(root, await this.github.getCredentials())
  }
  async manifest(root: string): Promise<CollabManifest> {
    let manifest: CollabManifest | null
    try {
      manifest = await readCollabManifest(root)
    } catch (error) {
      const git = await this.git(root)
      if (!(await git.merging())) throw error
      return (
        this.lastManifest.get(root) || parseManifest(JSON.parse(await git.run(['show', 'HEAD:slidev-collab.json'])))
      )
    }
    if (!manifest) throw new Error('Dự án chưa có slidev-collab.json.')
    this.lastManifest.set(root, manifest)
    return manifest
  }
  private async role(root: string, manifest: CollabManifest): Promise<CollabSection> {
    const account = await this.github.account()
    const branch = await (await this.git(root)).branch()
    const section = manifest.sections.find(
      (s) => branchFor(manifest, s) === branch && s.owner.toLowerCase() === account?.login.toLowerCase()
    )
    if (!section || !account || section.owner.toLowerCase() !== account.login.toLowerCase())
      throw new Error('Hãy đăng nhập GitHub và chọn phần được phân công cho bạn.')
    return section
  }
  async assertWritable(root: string, target: string, content?: string, withinOperation = false): Promise<void> {
    if (!(await fs.pathExists(projectFile(root, 'slidev-collab.json')))) return
    const manifest = await this.manifest(root)
    if (this.busy.has(root) && !withinOperation) throw new Error('Đang đồng bộ/gửi bài. Hãy chờ rồi lưu lại.')
    const section = await this.role(root, manifest)
    const relative = path.relative(root, target).split(path.sep).join('/')
    if (!isSectionFile(section, relative))
      throw new Error('Chỉ được sửa section của bạn và thư mục asset tương ứng. File chung do điều phối quản lý.')
    projectFile(root, relative)
    const git = await this.git(root)
    if ((await git.branch()) !== branchFor(manifest, section))
      throw new Error('Nhánh hiện tại không đúng vai trò. Hãy chọn lại phần phụ trách.')
    if (relative === section.file && content !== undefined) validateSectionMarkdown(content)
  }
  async writeFile(root: string, target: string, content: string): Promise<void> {
    if (!(await fs.pathExists(projectFile(root, 'slidev-collab.json')))) {
      await atomicWriteFile(target, content)
      return
    }
    await this.exclusive(root, async () => {
      await this.assertWritable(root, target, content, true)
      await atomicWriteFile(target, content)
    })
  }
  async inspect(root: string, includePr = true): Promise<CollabStatus | null> {
    if (!(await fs.pathExists(projectFile(root, 'slidev-collab.json')))) return null
    const manifest = await this.manifest(root)
    const git = await this.git(root)
    await git.verifyRoot()
    const branch = await git.branch()
    const account = await this.github.account()
    const section = manifest.sections.find(
      (s) => branchFor(manifest, s) === branch && s.owner.toLowerCase() === account?.login.toLowerCase()
    )
    const changedFiles = await git.changedFiles()
    const base = await git.mainRef(manifest)
    const localChanges = await git.changedSinceMain(manifest)
    const forbiddenFiles = [...new Set([...changedFiles, ...localChanges])].filter(
      (f) => !section || !isSectionFile(section, f)
    )
    const behindMain = Number((await git.run(['rev-list', '--count', `HEAD..${base}`])).trim())
    const remoteBranch = `refs/remotes/origin/${branch}`
    const ahead = Number(
      (
        await git.run([
          'rev-list',
          '--count',
          (await git.hasRef(remoteBranch)) ? `${remoteBranch}..HEAD` : `${base}..HEAD`
        ])
      ).trim()
    )
    const mainChanges = (await git.run(['diff', '--name-only', '-z', `HEAD...${base}`])).split('\0')
    const status: CollabStatus = {
      manifest,
      sectionId: section?.id || null,
      branch,
      changedFiles,
      forbiddenFiles,
      conflicts: await git.conflicts(),
      merging: await git.merging(),
      ahead,
      behindMain,
      mergedSections: manifest.sections.filter((s) => mainChanges.includes(s.file)).map((s) => s.id)
    }
    if (includePr && section && (await this.github.account())) {
      try {
        status.pr = await this.github.findPr(
          (await git.run(['remote', 'get-url', 'origin'])).trim(),
          branch,
          manifest.mainBranch
        )
      } catch (error) {
        status.warning = (error as Error).message
      }
    }
    return status
  }
  async select(root: string, sectionId: string): Promise<CollabStatus> {
    return this.exclusive(root, async () => {
      const manifest = await this.manifest(root)
      const section = manifest.sections.find((s) => s.id === sectionId)
      const account = await this.github.account()
      if (!section || !account || section.owner.toLowerCase() !== account.login.toLowerCase())
        throw new Error('Phần này không được phân công cho tài khoản GitHub của bạn.')
      const git = await this.git(root)
      await git.verifyRoot()
      await git.select(manifest, section)
      // A fetch can change assignments. Validate against the branch we just selected.
      const updated = await this.manifest(root)
      const assigned = updated.sections.find((s) => s.id === sectionId)
      if (
        !assigned ||
        assigned.owner.toLowerCase() !== account.login.toLowerCase() ||
        branchFor(updated, assigned) !== (await git.branch())
      )
        throw new Error('Phân công đã thay đổi. Hãy cập nhật dự án theo người điều phối.')
      await this.ignorePreview(git)
      return (await this.inspect(root))!
    })
  }
  private async ignorePreview(git: CollabGit): Promise<void> {
    const exclude = (await git.run(['rev-parse', '--git-path', 'info/exclude'])).trim()
    const file = path.resolve(git.root, exclude)
    await fs.ensureFile(file)
    const text = await fs.readFile(file, 'utf8')
    if (!text.includes('/.slidev-collab-*.md')) await fs.appendFile(file, '\n/.slidev-collab-*.md\n')
  }
  async preview(root: string, mode: 'section' | 'total'): Promise<string> {
    return this.exclusive(root, async () => {
      const manifest = await this.manifest(root)
      if (mode === 'total') return 'slides.md'
      const section = await this.role(root, manifest)
      const git = await this.git(root)
      await this.ignorePreview(git)
      return ensureSectionPreview(root, section)
    })
  }
  async draft(root: string): Promise<CollabStatus> {
    return this.exclusive(root, async () => {
      const manifest = await this.manifest(root)
      const section = await this.role(root, manifest)
      await (await this.git(root)).commit(manifest, section)
      return (await this.inspect(root))!
    })
  }
  async sync(root: string): Promise<CollabStatus> {
    return this.exclusive(root, async () => {
      const manifest = await this.manifest(root)
      const section = await this.role(root, manifest)
      const git = await this.git(root)
      if ((await git.branch()) !== branchFor(manifest, section))
        throw new Error('Hãy chọn lại phần phụ trách trước khi đồng bộ.')
      await git.sync(manifest)
      return (await this.inspect(root))!
    })
  }
  async submit(root: string): Promise<CollabStatus> {
    return this.exclusive(root, async () => {
      const manifest = await this.manifest(root)
      const section = await this.role(root, manifest)
      const git = await this.git(root)
      await git.commit(manifest, section)
      await git.push(manifest, section)
      const remote = (await git.run(['remote', 'get-url', 'origin'])).trim()
      const pr = await this.github.submitPr(
        remote,
        branchFor(manifest, section),
        manifest.mainBranch,
        `${manifest.title} — ${section.id}`
      )
      return { ...(await this.inspect(root, false))!, pr }
    })
  }
  async resolve(root: string, file: string, choice: 'mine' | 'incoming'): Promise<CollabStatus> {
    return this.exclusive(root, async () => {
      const manifest = await this.manifest(root)
      const section = await this.role(root, manifest)
      const git = await this.git(root)
      if (!isSectionFile(section, file))
        throw new Error('Xung đột file chung cần người điều phối xử lý. Hãy huỷ đồng bộ rồi liên hệ điều phối.')
      projectFile(root, file)
      if (!(await git.conflicts()).includes(file) || !['mine', 'incoming'].includes(choice))
        throw new Error('File hoặc lựa chọn xung đột không hợp lệ.')
      try {
        await git.run(['checkout', choice === 'mine' ? '--ours' : '--theirs', '--', file])
        await git.run(['add', '--', file])
      } catch {
        throw new Error('Không tự xử lý được xung đột xoá/đổi tên. Hãy mở công cụ Git hoặc huỷ đồng bộ.')
      }
      return (await this.inspect(root, false))!
    })
  }
  async finishMerge(root: string): Promise<CollabStatus> {
    return this.exclusive(root, async () => {
      const manifest = await this.manifest(root)
      const section = await this.role(root, manifest)
      const git = await this.git(root)
      if (!(await git.merging())) throw new Error('Không có đồng bộ đang chờ hoàn tất.')
      const unresolved = await git.conflicts()
      // Manual editing is supported for the assigned section. Add only files
      // without remaining conflict markers, never shared files.
      for (const file of unresolved) {
        if (!isSectionFile(section, file)) throw new Error('File chung đang xung đột, cần điều phối xử lý.')
        const text = await fs.readFile(projectFile(root, file), 'utf8')
        if (/^(<{7}|={7}|>{7})( |$)/m.test(text)) throw new Error(`Còn dấu xung đột trong ${file}.`)
        await git.run(['add', '--', file])
      }
      await git.assertScope(manifest, section)
      await git.commitIndex('Đồng bộ bản tổng')
      return (await this.inspect(root))!
    })
  }
  async abortMerge(root: string): Promise<CollabStatus> {
    return this.exclusive(root, async () => {
      const git = await this.git(root)
      if (await git.merging()) await git.run(['merge', '--abort'])
      return (await this.inspect(root))!
    })
  }
  async withMainSnapshot<T>(root: string, action: (snapshot: string) => Promise<T>): Promise<T> {
    return this.exclusive(root, async () => {
      const manifest = await this.manifest(root)
      const git = await this.git(root)
      await git.fetch()
      const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'slidev-main-export-'))
      const snapshot = path.join(temp, 'presentation')
      let created = false
      try {
        await git.run(['worktree', 'add', '--detach', snapshot, await git.mainRef(manifest)])
        created = true
        // Reuse dependencies only when their declaration and lockfile match.
        for (const file of ['package.json', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'bun.lock']) {
          const local = await fs.readFile(path.join(root, file), 'utf8').catch(() => '')
          const total = await fs.readFile(path.join(snapshot, file), 'utf8').catch(() => '')
          if (local !== total)
            throw new Error(
              'Thư viện trên bản tổng đã thay đổi. Hãy cập nhật/cài lại thư viện theo điều phối trước khi export.'
            )
        }
        if (await fs.pathExists(path.join(root, 'node_modules')))
          await fs.symlink(
            path.join(root, 'node_modules'),
            path.join(snapshot, 'node_modules'),
            process.platform === 'win32' ? 'junction' : 'dir'
          )
        return await action(snapshot)
      } finally {
        if (created) await git.run(['worktree', 'remove', '--force', snapshot])
        await fs.remove(temp)
      }
    })
  }
}
