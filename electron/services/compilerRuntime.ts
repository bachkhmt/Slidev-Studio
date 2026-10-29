import { app } from 'electron'
import { createHash, randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs-extra'
import { execa } from 'execa'
import { unzipSync } from 'fflate'
import { dataDir } from '../utils/dataDir'
import type { CompilerInfo } from '../../shared/reports'

export const TECTONIC_VERSION = '0.17.0'
const RELEASE = `https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}`
const ASSETS: Record<string, { target: string; hash: string }> = {
  'win32-x64': {
    target: 'x86_64-pc-windows-msvc.zip',
    hash: 'f61ce51f0b0ade1015b7de7ef368541c5424e9756ecbd0d7af97d6d48030845f'
  },
  'darwin-x64': {
    target: 'x86_64-apple-darwin.tar.gz',
    hash: '7c90ef5b6ddb1eb1937e4337add5237b79338e4b9676459fa91187d24d6cdf80'
  },
  'darwin-arm64': {
    target: 'aarch64-apple-darwin.tar.gz',
    hash: 'a3f1cac7c5678f01661a92212f58480ae3b0634115d880dbc59e2953ded45667'
  },
  'linux-x64': {
    target: 'x86_64-unknown-linux-musl.tar.gz',
    hash: '8533d07f9ccbd7a65824b9e0459041bca34af1eb33daba48f59215593753a3b7'
  },
  'linux-arm64': {
    target: 'aarch64-unknown-linux-musl.tar.gz',
    hash: 'b10954a95404f3ab2328d2fa59a5ebab8e657f893fab096f98be8db7c0c979b8'
  }
}

export class CompilerRuntime {
  private installation?: Promise<CompilerInfo>
  constructor(private directory = path.join(dataDir(), 'runtimes', 'tectonic', TECTONIC_VERSION)) {}
  private get binary() {
    return path.join(this.directory, process.platform === 'win32' ? 'tectonic.exe' : 'tectonic')
  }
  async command(): Promise<string | undefined> {
    if (await fs.pathExists(this.binary)) return this.binary
    // A test fixture may supply a compiler without installing it in the user's profile.
    const testBinary =
      !app.isPackaged && process.env.NODE_ENV === 'test' ? process.env.SLIDEV_STUDIO_TEST_TECTONIC : undefined
    if (testBinary && path.isAbsolute(testBinary) && (await fs.pathExists(testBinary))) return testBinary
    try {
      await execa('tectonic', ['--version'], { timeout: 5000, windowsHide: true })
      return 'tectonic'
    } catch {
      return undefined
    }
  }
  async info(): Promise<CompilerInfo> {
    const command = await this.command()
    if (!command) return { available: false }
    try {
      const { stdout } = await execa(command, ['--version'], { timeout: 5000, windowsHide: true })
      return { available: true, version: stdout.trim() }
    } catch {
      return { available: false }
    }
  }
  install(): Promise<CompilerInfo> {
    if (this.installation) return this.installation
    this.installation = this.installInternal().finally(() => {
      this.installation = undefined
    })
    return this.installation
  }
  private async installInternal(): Promise<CompilerInfo> {
    const existing = await this.info()
    if (existing.available) return existing
    const asset = ASSETS[`${process.platform}-${process.arch}`]
    if (!asset) throw new Error('Chưa hỗ trợ cài tự động trên máy này. Hãy cài Tectonic rồi mở lại ứng dụng.')
    const response = await fetch(`${RELEASE}/tectonic-${TECTONIC_VERSION}-${asset.target}`, {
      signal: AbortSignal.timeout(120000)
    })
    if (!response.ok)
      throw new Error(`Không tải được bộ biên dịch (HTTP ${response.status}). Kiểm tra mạng rồi thử lại.`)
    const archive = Buffer.from(await response.arrayBuffer())
    if (archive.length > 40 * 1024 * 1024 || createHash('sha256').update(archive).digest('hex') !== asset.hash)
      throw new Error('Bộ biên dịch tải về không đúng mã kiểm tra. Hãy thử lại.')
    const staging = `${this.directory}.install-${randomUUID()}`
    await fs.ensureDir(staging)
    try {
      const name = path.basename(this.binary)
      if (asset.target.endsWith('.zip')) {
        const files = unzipSync(archive, { filter: (file) => file.name === name })
        if (!files[name]) throw new Error('Gói cài đặt không có bộ biên dịch.')
        await fs.writeFile(path.join(staging, name), files[name])
      } else {
        const archivePath = path.join(staging, 'runtime.tar.gz')
        await fs.writeFile(archivePath, archive)
        await execa('tar', ['-xzf', archivePath, '-C', staging, name], { timeout: 30000 })
        await fs.chmod(path.join(staging, name), 0o755)
      }
      await execa(path.join(staging, name), ['--version'], { timeout: 5000, windowsHide: true })
      await fs.ensureDir(this.directory)
      await fs.move(path.join(staging, name), this.binary, { overwrite: false })
      return this.info()
    } finally {
      await fs.remove(staging)
    }
  }
}
export const compilerRuntime = new CompilerRuntime()
