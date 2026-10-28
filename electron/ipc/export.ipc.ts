import { ipcMain, BrowserWindow } from 'electron'
import { execa } from 'execa'
import path from 'path'
import fs from 'fs-extra'
import { projectStore } from '../services/projectStore'
import { buildEnv } from '../utils/env'
import { assertInsideAllowedRoot, assertRegisteredProjectRoot } from '../utils/pathGuard'
import { installQueue } from '../services/installQueue'
import { resolveSlidevRunner } from '../utils/slidevRunner'

type ExportFormat = 'pdf' | 'png' | 'pptx' | 'pptx-editable' | 'md' | 'build'

interface ExportOptions {
  range?: string
  dark?: boolean
  withClicks?: boolean
  omitBackground?: boolean
  timeout?: number
  outputName?: string
  outputDir?: string
}

interface BatchExportResult {
  file: string
  success: boolean
  outputPath?: string
  error?: string
}

type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

function getSlidevRunner(
  projectPath: string,
  _packageManager: PackageManager
): { command: string; prefixArgs: string[] } {
  const runner = resolveSlidevRunner(projectPath)
  if (runner) return runner
  throw new Error('Không tìm thấy Slidev CLI cục bộ. Hãy cài dependencies trong dự án trước khi xuất.')
}

function getInstallCommand(packageManager: PackageManager): { command: string; args: string[] } {
  switch (packageManager) {
    case 'pnpm':
      return { command: 'pnpm', args: ['add', '-D', 'playwright-chromium'] }
    case 'yarn':
      return { command: 'yarn', args: ['add', '-D', 'playwright-chromium'] }
    case 'bun':
      return { command: 'bun', args: ['add', '-d', 'playwright-chromium'] }
    default:
      return { command: 'npm', args: ['install', '-D', 'playwright-chromium'] }
  }
}

function safeOutputName(value: string | undefined, entryFile: string): string {
  const name = value?.trim() || `${path.basename(entryFile, path.extname(entryFile))}-export`
  if (name !== path.basename(name) || name === '.' || name === '..') {
    throw new Error('Tên file xuất chỉ được chứa tên tệp, không được chứa đường dẫn')
  }
  return name.replace(/\.(pdf|png|pptx|md)$/i, '')
}

function outputPathFor(format: ExportFormat, outputBase: string): string {
  switch (format) {
    case 'pdf':
      return `${outputBase}.pdf`
    case 'pptx':
    case 'pptx-editable':
      return `${outputBase}.pptx`
    case 'md':
      return `${outputBase}.md`
    case 'png':
      return outputBase
    case 'build':
      return path.dirname(outputBase)
  }
}

function resolveProjectOutputDir(projectPath: string, outputDir?: string, fallback = 'export'): string {
  if (!outputDir || outputDir === 'project/export') return path.join(projectPath, 'export')
  if (path.isAbsolute(outputDir)) return path.resolve(outputDir)
  const relative = outputDir.startsWith('project/') ? outputDir.slice('project/'.length) : outputDir
  const resolved = path.resolve(projectPath, relative || fallback)
  const escaped = path.relative(path.resolve(projectPath), resolved)
  if (escaped === '..' || escaped.startsWith(`..${path.sep}`) || path.isAbsolute(escaped)) {
    throw new Error('Thư mục xuất tương đối phải nằm bên trong dự án')
  }
  return resolved
}

export async function runSingleExport(
  projectPath: string,
  entryFile: string,
  format: ExportFormat,
  options: ExportOptions,
  emitLog: (message: string) => void,
  internalSnapshot = false
): Promise<{ success: boolean; outputPath: string }> {
  if (typeof entryFile !== 'string' || !/^[^\\/]+\.md$/i.test(entryFile) || entryFile.includes('..')) {
    throw new Error('File trình chiếu không hợp lệ')
  }
  if (!internalSnapshot) entryFile = path.basename(assertInsideAllowedRoot(path.join(projectPath, entryFile), 'read'))
  emitLog(`[Export] Bắt đầu xuất ${entryFile} sang ${format.toUpperCase()}...`)

  const env = buildEnv(projectStore.getSettings())
  const serverSettings = projectStore.getSettings().server
  const runner = getSlidevRunner(projectPath, serverSettings.packageManager)
  const cmd = runner.command
  const cliPrefix = runner.prefixArgs
  let args: string[]
  let expectedOut: string

  if (format === 'build') {
    const outDir = resolveProjectOutputDir(projectPath, options.outputDir, 'dist')
    expectedOut = options.outputName ? path.join(outDir, safeOutputName(options.outputName, entryFile)) : outDir
    args = [
      ...cliPrefix,
      'build',
      entryFile,
      '--base',
      './',
      ...(options.outputName || options.outputDir ? ['--out', path.relative(projectPath, expectedOut)] : [])
    ]
  } else {
    const outDir = resolveProjectOutputDir(projectPath, options.outputDir)
    await fs.mkdirp(outDir)
    const outputBase = path.join(outDir, safeOutputName(options.outputName, entryFile))
    expectedOut = outputPathFor(format, outputBase)
    args = [...cliPrefix, 'export', entryFile, '--format', format, '--output', outputBase]

    if (options.range?.trim()) args.push('--range', options.range.trim())
    // Slidev 53's one-piece PDF print route does not filter the requested range.
    // Its per-slide route iterates the selected page numbers explicitly.
    if (format === 'pdf' && options.range?.trim()) args.push('--per-slide')
    if (options.dark) args.push('--dark')
    if (typeof options.withClicks === 'boolean') args.push('--with-clicks', String(options.withClicks))
    if (options.omitBackground) args.push('--omit-background')
    if (Number.isFinite(options.timeout) && options.timeout && options.timeout > 0) {
      args.push('--timeout', String(Math.floor(options.timeout)))
    }
  }

  emitLog(`[Export] Thực thi: ${cmd} ${args.join(' ')}`)

  try {
    const proc = execa(cmd, args, {
      cwd: projectPath,
      env,
      buffer: false,
      stdin: 'ignore',
      reject: false
    })
    proc.stdout?.on('data', (data) => emitLog(data.toString().trim()))
    proc.stderr?.on('data', (data) => emitLog(data.toString().trim()))

    const result = await proc
    if (result.exitCode !== 0) {
      const details = `${result.stderr || ''}\n${result.stdout || ''}`
      const upgradeHint = /unsupported exporting format/i.test(details)
        ? ' Hãy cập nhật @slidev/cli trong package.json của dự án rồi chạy npm install.'
        : ''
      throw new Error(`Export kết thúc với mã lỗi ${result.exitCode}.${upgradeHint}`)
    }

    emitLog(`[Export] Xuất thành công vào: ${expectedOut}`)
    return { success: true, outputPath: expectedOut }
  } catch (err: any) {
    emitLog(`[Export Lỗi] ${err.message}`)
    throw err
  }
}

export function registerExportIpc(): void {
  ipcMain.handle(
    'export:run',
    async (event, projectPath: string, entryFile: string, format: ExportFormat, options: ExportOptions = {}) => {
      projectPath = assertRegisteredProjectRoot(projectPath)
      const win = BrowserWindow.fromWebContents(event.sender)
      const emitLog = (message: string): void => {
        if (win && !win.isDestroyed()) win.webContents.send('export:log', message)
      }
      return runSingleExport(projectPath, entryFile, format, options || {}, emitLog)
    }
  )

  ipcMain.handle(
    'export:runBatch',
    async (
      event,
      projectPath: string,
      entryFiles: string[],
      format: ExportFormat,
      options: ExportOptions = {}
    ): Promise<BatchExportResult[]> => {
      projectPath = assertRegisteredProjectRoot(projectPath)
      const win = BrowserWindow.fromWebContents(event.sender)
      const emitLog = (message: string): void => {
        if (win && !win.isDestroyed()) win.webContents.send('export:log', message)
      }
      const results: BatchExportResult[] = []

      for (let index = 0; index < entryFiles.length; index += 1) {
        const file = entryFiles[index]
        if (win && !win.isDestroyed()) {
          win.webContents.send('export:batch-progress', {
            current: index + 1,
            total: entryFiles.length,
            file
          })
        }

        const entryStem = path.basename(file, path.extname(file))
        const outputName = options.outputName
          ? `${options.outputName}-${entryStem}`
          : format === 'build'
            ? entryStem
            : undefined
        try {
          const result = await runSingleExport(projectPath, file, format, { ...options, outputName }, emitLog)
          results.push({ file, success: true, outputPath: result.outputPath })
        } catch (err: any) {
          results.push({ file, success: false, error: err.message || String(err) })
        }
      }
      return results
    }
  )

  ipcMain.handle('export:checkDeps', async (_event, projectPath: string): Promise<{ ok: boolean }> => {
    projectPath = assertRegisteredProjectRoot(projectPath)
    const packagePath = path.join(projectPath, 'node_modules', 'playwright-chromium', 'package.json')
    return { ok: fs.existsSync(packagePath) }
  })

  ipcMain.handle('export:installDeps', async (event, projectPath: string): Promise<{ success: boolean }> => {
    projectPath = assertRegisteredProjectRoot(projectPath)
    const win = BrowserWindow.fromWebContents(event.sender)
    const emitLog = (message: string): void => {
      if (win && !win.isDestroyed()) win.webContents.send('export:log', message)
    }

    emitLog('[Export] Đang cài playwright-chromium vào dự án...')
    const packageManager = projectStore.getSettings().server.packageManager
    const install = getInstallCommand(packageManager)
    const result = await installQueue.run(`export:${projectPath}`, async () => {
      const proc = execa(install.command, install.args, {
        cwd: projectPath,
        env: buildEnv(projectStore.getSettings()),
        buffer: false,
        stdin: 'ignore',
        reject: false
      })
      proc.stdout?.on('data', (data) => emitLog(data.toString().trim()))
      proc.stderr?.on('data', (data) => emitLog(data.toString().trim()))
      return proc
    })

    if (result.exitCode !== 0) {
      const message = `${packageManager} install thất bại với mã lỗi ${result.exitCode}`
      emitLog(`[Export Lỗi] ${message}`)
      throw new Error(message)
    }

    emitLog('[Export] Đã cài playwright-chromium thành công.')
    return { success: true }
  })

  // Node & Git environment checks
  ipcMain.handle('env:checkNode', async () => {
    try {
      const res = await execa('node', ['--version'], { env: buildEnv(projectStore.getSettings()) })
      return { ok: true, version: res.stdout.trim() }
    } catch {
      return { ok: false }
    }
  })

  ipcMain.handle('env:checkGit', async () => {
    try {
      const res = await execa('git', ['--version'], { env: buildEnv(projectStore.getSettings()) })
      return { ok: true, version: res.stdout.trim() }
    } catch {
      return { ok: false }
    }
  })
}
