import { execa } from 'execa'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { branchFor, isSectionFile, parseManifest, type CollabManifest, type CollabSection } from '../../shared/collab'
import { projectFile, validateSectionMarkdown } from './collabProject'

export type GitCredentials = { login: string; token: string }
export class CollabGit {
  constructor(
    public root: string,
    private credentials?: GitCredentials
  ) {}

  async run(args: string[], network = false): Promise<string> {
    let secretDir: string | undefined
    const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }
    try {
      if (network && this.credentials) {
        secretDir = await fs.mkdtemp(path.join(os.tmpdir(), 'slidev-git-auth-'))
        const askpass = path.join(secretDir, 'askpass.cjs')
        await fs.writeFile(
          askpass,
          `process.stdout.write(process.argv[2]?.toLowerCase().includes('username') ? 'x-access-token' : process.env.SLIDEV_GIT_TOKEN || '')`,
          { mode: 0o600 }
        )
        const launcher = path.join(secretDir, process.platform === 'win32' ? 'askpass.cmd' : 'askpass')
        await fs.writeFile(
          launcher,
          process.platform === 'win32'
            ? '@echo off\r\n"%SLIDEV_AUTH_NODE%" "%SLIDEV_AUTH_SCRIPT%" %*\r\n'
            : '#!/bin/sh\nexec "$SLIDEV_AUTH_NODE" "$SLIDEV_AUTH_SCRIPT" "$@"\n',
          { mode: 0o700 }
        )
        Object.assign(env, {
          GIT_ASKPASS: launcher,
          SLIDEV_AUTH_NODE: process.execPath,
          SLIDEV_AUTH_SCRIPT: askpass,
          SLIDEV_GIT_TOKEN: this.credentials.token,
          ELECTRON_RUN_AS_NODE: '1'
        })
      }
      const result = await execa(
        'git',
        [
          '-c',
          'core.hooksPath=',
          '-c',
          'protocol.ext.allow=never',
          '-c',
          'protocol.file.allow=never',
          ...(network && this.credentials ? ['-c', 'credential.helper='] : []),
          ...args
        ],
        {
          cwd: this.root,
          env,
          timeout: network ? 120000 : 30000,
          maxBuffer: 20 * 1024 * 1024,
          stripFinalNewline: false
        }
      )
      return result.stdout
    } catch (error: unknown) {
      const e = error as { stderr?: string; code?: string; timedOut?: boolean }
      let detail =
        e.stderr?.trim() ||
        (e.code === 'ENOENT'
          ? 'Chưa cài Git trên máy.'
          : 'Thao tác Git không thành công. Kiểm tra mạng và quyền truy cập repository.')
      if (this.credentials) detail = detail.split(this.credentials.token).join('[ẩn]')
      if (
        e.timedOut ||
        /could not resolve host|failed to connect|connection refused|unable to connect|network.*unreachable|timed out/i.test(
          detail
        )
      ) {
        detail = 'Không kết nối được kho bài của nhóm. Kiểm tra mạng rồi thử lại; bản nháp trên máy vẫn được giữ.'
      } else if (
        /authentication failed|could not read username|permission denied|repository not found|repository .* not found|returned error: (401|403)/i.test(
          detail
        )
      ) {
        detail = 'Không truy cập được dự án. Hãy đăng nhập lại GitHub hoặc kiểm tra quyền truy cập repository.'
      } else if (/non-fast-forward|fetch first|updates were rejected/i.test(detail)) {
        detail =
          'Có bản mới trên nhánh phần của bạn. Hãy cập nhật nhánh bằng Git hoặc nhờ điều phối trước khi gửi lại; bản nháp vẫn được giữ.'
      } else if (/please tell me who you are|unable to auto-detect email address/i.test(detail)) {
        detail = 'Chưa có thông tin tác giả. Hãy đăng nhập GitHub hoặc cấu hình tên/email trong Git trước khi lưu nháp.'
      }
      throw new Error(detail)
    } finally {
      if (secretDir) await fs.remove(secretDir)
    }
  }

  async verifyRoot(): Promise<void> {
    const top = (await this.run(['rev-parse', '--show-toplevel'])).trim()
    if ((await fs.realpath(top)) !== (await fs.realpath(this.root)))
      throw new Error('Thư mục dự án phải là gốc của repository Git.')
  }
  async branch(): Promise<string> {
    return (await this.run(['branch', '--show-current'])).trim()
  }
  async hasRef(ref: string): Promise<boolean> {
    try {
      await this.run(['rev-parse', '--verify', ref])
      return true
    } catch {
      return false
    }
  }
  async mainRef(manifest: CollabManifest): Promise<string> {
    const remote = `refs/remotes/origin/${manifest.mainBranch}`
    if (await this.hasRef(remote)) return remote
    const local = `refs/heads/${manifest.mainBranch}`
    if (await this.hasRef(local)) return local
    throw new Error(`Không tìm thấy nhánh tổng ${manifest.mainBranch}.`)
  }
  async changedFiles(): Promise<string[]> {
    const raw = (await this.run(['status', '--porcelain=v1', '-z', '--untracked-files=all'])).split('\0')
    const files: string[] = []
    for (let i = 0; i < raw.length; i++) {
      if (!raw[i]) continue
      files.push(raw[i].slice(3))
      if (/R|C/.test(raw[i].slice(0, 2)) && raw[i + 1]) files.push(raw[++i])
    }
    return [...new Set(files)]
  }
  async conflicts(): Promise<string[]> {
    return (await this.run(['diff', '--name-only', '--diff-filter=U', '-z'])).split('\0').filter(Boolean)
  }
  async merging(): Promise<boolean> {
    return this.hasRef('MERGE_HEAD')
  }
  async requireClean(): Promise<void> {
    if ((await this.changedFiles()).length || (await this.merging()))
      throw new Error('Hãy lưu nháp và xử lý thay đổi trước khi đổi vai trò hoặc đồng bộ.')
  }
  async fetch(): Promise<void> {
    const remote = (await this.run(['remote', 'get-url', 'origin'])).trim()
    if (this.credentials && !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?\/?$/.test(remote))
      throw new Error(
        'Đăng nhập GitHub chỉ dùng cho origin HTTPS trên github.com. Hãy đổi origin hoặc dùng xác thực SSH của máy.'
      )
    await this.run(['fetch', '--prune', 'origin'], true)
  }
  async select(manifest: CollabManifest, section: CollabSection): Promise<void> {
    await this.requireClean()
    await this.fetch()
    const branch = branchFor(manifest, section)
    if (await this.hasRef(`refs/heads/${branch}`)) await this.run(['checkout', branch])
    else if (await this.hasRef(`refs/remotes/origin/${branch}`))
      await this.run(['checkout', '-b', branch, '--track', `origin/${branch}`])
    else await this.run(['checkout', '-b', branch, await this.mainRef(manifest)])
  }
  async changedSinceMain(manifest: CollabManifest): Promise<string[]> {
    const base = await this.mainRef(manifest)
    return (await this.run(['diff', '--no-renames', '--name-only', '-z', `${base}...HEAD`])).split('\0').filter(Boolean)
  }
  async assertScope(manifest: CollabManifest, section: CollabSection): Promise<void> {
    if ((await this.branch()) !== branchFor(manifest, section))
      throw new Error('Bạn chưa vào đúng vai trò. Hãy chọn lại phần phụ trách.')
    const base = await this.mainRef(manifest)
    const baseline = parseManifest(JSON.parse(await this.run(['show', `${base}:slidev-collab.json`])))
    if (JSON.stringify(baseline) !== JSON.stringify(manifest))
      throw new Error('Phân công đã thay đổi. Hãy đồng bộ cấu trúc trước khi gửi bài; manifest chỉ do điều phối sửa.')
    const workingFiles = (await this.merging())
      ? [
          ...(await this.run(['diff', '--no-renames', '--name-only', '-z', base])).split('\0').filter(Boolean),
          ...(await this.run(['diff', '--cached', '--no-renames', '--name-only', '-z', base]))
            .split('\0')
            .filter(Boolean)
        ]
      : await this.changedFiles()
    const files = [...new Set([...workingFiles, ...(await this.changedSinceMain(manifest))])]
    const forbidden = files.filter((file) => !isSectionFile(section, file))
    if (forbidden.length)
      throw new Error(
        `Có thay đổi ngoài phần phụ trách: ${forbidden.join(', ')}. Hãy tách hoặc khôi phục các thay đổi này trước khi lưu nháp/gửi bài.`
      )
    for (const file of files) {
      const target = projectFile(this.root, file)
      if ((await fs.pathExists(target)) && (await fs.lstat(target)).isSymbolicLink())
        throw new Error('Section và asset không được là liên kết.')
    }
    if (!(await fs.pathExists(projectFile(this.root, section.file)))) throw new Error('Không được xoá file section.')
    validateSectionMarkdown(await fs.readFile(projectFile(this.root, section.file), 'utf8'))
  }
  async commit(manifest: CollabManifest, section: CollabSection): Promise<void> {
    if (await this.merging()) throw new Error('Đang có bản đồng bộ cần xử lý. Hãy hoàn tất xung đột trước.')
    await this.assertScope(manifest, section)
    const files = await this.changedFiles()
    if (!files.length) return
    await this.run(['add', '--', ...files])
    await this.commitIndex(`wip(${section.id}): ${new Date().toISOString()}`)
  }
  async commitIndex(message: string): Promise<void> {
    const identity = this.credentials
      ? [
          '-c',
          `user.name=${this.credentials.login}`,
          '-c',
          `user.email=${this.credentials.login}@users.noreply.github.com`
        ]
      : []
    await this.run([...identity, '-c', 'commit.gpgsign=false', 'commit', '-m', message])
  }
  async sync(manifest: CollabManifest): Promise<void> {
    await this.requireClean()
    await this.fetch()
    try {
      await this.run(['-c', 'merge.autoStash=false', 'merge', '--no-edit', '--no-commit', await this.mainRef(manifest)])
    } catch (error) {
      if (!(await this.conflicts()).length) throw error
    }
    if ((await this.merging()) && !(await this.conflicts()).length) await this.commitIndex('Đồng bộ bản tổng')
  }
  async push(manifest: CollabManifest, section: CollabSection): Promise<void> {
    await this.assertScope(manifest, section)
    if ((await this.merging()) || (await this.conflicts()).length)
      throw new Error('Hãy hoàn tất xung đột trước khi gửi bài.')
    await this.fetch() // Validate origin before sharing credentials on push as well.
    await this.assertScope(manifest, section)
    await this.run(['push', '-u', 'origin', `HEAD:refs/heads/${branchFor(manifest, section)}`], true)
  }
}
