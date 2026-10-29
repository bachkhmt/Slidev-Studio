import path from 'path'
import { randomUUID } from 'crypto'
import fs from 'fs-extra'
import { execa, type ExecaChildProcess } from 'execa'
import { app } from 'electron'
import treeKill from 'tree-kill'
import type { ReportSnapshot } from '../../shared/reports'
import { compilerRuntime } from './compilerRuntime'
import { canonicalPath } from '../utils/path'
import { dataDir } from '../utils/dataDir'

export function reportEntry(root: string, entry: string): string {
  if (
    typeof entry !== 'string' ||
    !/^[^\\/]+\.(?:tex|md)$/i.test(entry) ||
    entry.includes('..') ||
    entry.startsWith('-')
  )
    throw new Error('File chính của báo cáo không hợp lệ.')
  const target = canonicalPath(path.join(root, entry))
  const relative = path.relative(canonicalPath(root), target)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('File báo cáo nằm ngoài dự án.')
  return target
}

// Only Studio-owned build directories may receive compiler output.
export async function reportBuildDir(root: string, markdown = false): Promise<string> {
  const dir = path.join(root, markdown ? '.studio-report' : '.studio-latex')
  const stat = await fs.lstat(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })
  if (stat?.isSymbolicLink() || (stat && !stat.isDirectory())) throw new Error('Thư mục biên dịch không hợp lệ.')
  await fs.ensureDir(dir)
  return dir
}

export async function readReportPdf(root: string, entry: string, reference = false): Promise<Uint8Array | null> {
  reportEntry(root, entry)
  const file = reference
    ? path.join(root, 'template-preview.pdf')
    : path.join(
        await reportBuildDir(root, entry.toLowerCase().endsWith('.md')),
        `${path.basename(entry, path.extname(entry))}.pdf`
      )
  const relative = path.relative(canonicalPath(root), canonicalPath(file))
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('PDF nằm ngoài dự án.')
  const stat = await fs.stat(file).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })
  if (!stat) return null
  if (stat.size > 50 * 1024 * 1024 || !stat.isFile()) throw new Error('Không thể mở PDF này.')
  const data = await fs.readFile(file)
  if (!data.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('File không phải PDF hợp lệ.')
  return new Uint8Array(data)
}

export class ReportManager {
  private snapshots = new Map<string, ReportSnapshot>()
  private jobs = new Map<
    string,
    { child?: ExecaChildProcess; controller: AbortController; cancelled: boolean; done: Promise<ReportSnapshot> }
  >()
  private listeners = new Set<(snapshot: ReportSnapshot) => void>()
  subscribe(listener: (snapshot: ReportSnapshot) => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  status(id: string): ReportSnapshot {
    return this.snapshots.get(id) || { projectId: id, state: 'idle', logs: [] }
  }
  private publish(id: string, patch: Partial<ReportSnapshot>) {
    const snapshot = { ...this.status(id), ...patch }
    this.snapshots.set(id, snapshot)
    for (const listener of this.listeners) listener(snapshot)
    return snapshot
  }
  async pdfPath(root: string, entry: string) {
    reportEntry(root, entry)
    return path.join(
      await reportBuildDir(root, entry.toLowerCase().endsWith('.md')),
      `${path.basename(entry, path.extname(entry))}.pdf`
    )
  }
  compile(id: string, root: string, entry: string): Promise<ReportSnapshot> {
    if (this.jobs.has(id))
      return Promise.reject(new Error('Báo cáo đang được biên dịch. Hãy chờ hoặc hủy tác vụ hiện tại.'))
    const job = {
      cancelled: false,
      controller: new AbortController(),
      child: undefined as ExecaChildProcess | undefined,
      done: undefined as unknown as Promise<ReportSnapshot>
    }
    this.jobs.set(id, job)
    this.publish(id, { state: 'compiling', error: undefined, logs: ['Đang chuẩn bị biên dịch báo cáo…'] })
    job.done = (async () => {
      let temp: string | undefined
      try {
        const input = reportEntry(root, entry)
        const markdown = entry.toLowerCase().endsWith('.md')
        const buildDir = await reportBuildDir(root, markdown)
        temp = path.join(buildDir, `job-${randomUUID()}`)
        await fs.mkdir(temp)
        if (job.cancelled) return this.publish(id, { state: 'cancelled' })
        if (markdown) {
          this.publish(id, { logs: ['Đang dàn trang Markdown và tạo PDF A4 bằng Electron…'] })
          const { markdownPdf } = await import('./markdownPdf')
          const bytes = await markdownPdf(root, input, temp, job.controller.signal)
          await fs.writeFile(path.join(temp, `${path.basename(entry, path.extname(entry))}.pdf`), bytes)
        } else {
          const command = await compilerRuntime.command()
          if (!command) throw new Error('Chưa có bộ biên dịch. Bấm “Cài bộ biên dịch” để thiết lập Tectonic.')
          const child = execa(command, ['-X', 'compile', '--untrusted', '--keep-logs', '--outdir', temp, input], {
            cwd: root,
            env: {
              ...process.env,
              TECTONIC_UNTRUSTED_MODE: '1',
              TECTONIC_CACHE_DIR:
                (!app.isPackaged && process.env.NODE_ENV === 'test' && process.env.SLIDEV_STUDIO_TEST_TEX_CACHE) ||
                path.join(dataDir(), 'latex-cache')
            },
            buffer: false,
            stdin: 'ignore',
            reject: false,
            timeout: 600000,
            windowsHide: true
          })
          job.child = child
          const log = (data: Buffer) => {
            const lines = data.toString().replace(/\r/g, '').trim().split('\n').filter(Boolean)
            if (lines.length) this.publish(id, { logs: [...this.status(id).logs, ...lines].slice(-300) })
          }
          child.stdout?.on('data', log)
          child.stderr?.on('data', log)
          const result = await child
          if (job.cancelled) return this.publish(id, { state: 'cancelled' })
          if (result.exitCode !== 0) {
            const details = this.status(id)
              .logs.filter((line) => /error:|^!|^l\.\d+/.test(line))
              .slice(-4)
              .join('\n')
            throw new Error(details || 'Biên dịch không thành công. Xem nhật ký để tìm dòng cần sửa.')
          }
        }
        if (job.cancelled) return this.publish(id, { state: 'cancelled' })
        const source = path.join(temp, `${path.basename(entry, path.extname(entry))}.pdf`)
        const stat = await fs.stat(source)
        if (stat.size < 5 || stat.size > 50 * 1024 * 1024) throw new Error('PDF đầu ra trống hoặc vượt giới hạn 50 MB.')
        const header = await fs.open(source, 'r')
        try {
          const bytes = Buffer.alloc(5)
          await fs.read(header, bytes, 0, 5, 0)
          if (!bytes.equals(Buffer.from('%PDF-'))) throw new Error('Bộ biên dịch không tạo PDF hợp lệ.')
        } finally {
          await fs.close(header)
        }
        const output = await this.pdfPath(root, entry)
        // Do not follow a malicious destination symlink while replacing the old preview.
        if ((await fs.lstat(output).catch(() => undefined))?.isSymbolicLink())
          throw new Error('Đường dẫn PDF không hợp lệ.')
        await fs.rename(source, output)
        return this.publish(id, { state: 'ready', compiledAt: Date.now(), error: undefined })
      } catch (error: any) {
        return this.publish(
          id,
          job.cancelled
            ? { state: 'cancelled', error: undefined }
            : {
                state: 'error',
                error: error.timedOut ? 'Biên dịch quá 10 phút. Kiểm tra mạng và nội dung rồi thử lại.' : error.message
              }
        )
      } finally {
        if (temp) await fs.remove(temp).catch(() => {})
        this.jobs.delete(id)
      }
    })()
    return job.done
  }
  async cancel(id: string) {
    const job = this.jobs.get(id)
    if (!job) return
    job.cancelled = true
    job.controller.abort()
    if (job.child?.pid) await new Promise<void>((resolve) => treeKill(job.child!.pid!, 'SIGKILL', () => resolve()))
    await job.done
  }
  async release(id: string) {
    await this.cancel(id)
    this.snapshots.delete(id)
  }
  async stopAll() {
    await Promise.all([...this.jobs.keys()].map((id) => this.cancel(id)))
  }
}
export const reportManager = new ReportManager()
