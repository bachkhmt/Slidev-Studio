import { execa, type ExecaChildProcess } from 'execa'
import treeKill from 'tree-kill'
import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { randomBytes } from 'crypto'
import { BrowserWindow } from 'electron'
import { portAllocator } from './portFinder'
import { waitForReady } from './waitForReady'
import { installQueue } from './installQueue'
import { pidRegistry } from './pidRegistry'
import { projectStore } from './projectStore'
import { buildEnv } from '../utils/env'
import { stripAnsi } from '../utils/stripAnsi'
import { diag } from '../utils/diag'
import { resolveSlidevRunner } from '../utils/slidevRunner'
import { CompileErrorAggregator, type CompileEvent } from './compileErrorParser'
import { checkThemeInstalled, isEngineCompatible, readTheme, themePackageName } from '../utils/themeResolver'
import { patchTwoslashFloatingVue } from '../utils/slidevCompatibility'

export type ProcessStatusType = 'idle' | 'installing' | 'starting' | 'running' | 'error' | 'stopped'
export interface ProcessLogLine {
  text: string
  type: 'stdout' | 'stderr'
  time: string
  seq: number
}

export interface ProcessInstance {
  projectId: string
  projectPath: string
  entryFile: string
  childProcess?: ExecaChildProcess
  installProcess?: ExecaChildProcess
  pid?: number
  port?: number
  url?: string
  lanUrl?: string
  status: ProcessStatusType
  logs: ProcessLogLine[]
  error?: string
  generation: number
  abortController: AbortController
}

type StartResult = { port: number; url: string; lanUrl?: string }
type ExitResult = { code: number | null; signal: NodeJS.Signals | null }

function waitForChildExit(child: ExecaChildProcess, timeoutMs: number): Promise<boolean> {
  if (child.exitCode !== null && child.exitCode !== undefined) return Promise.resolve(true)
  return new Promise((resolve) => {
    let done = false
    const finish = (exited: boolean) => {
      if (done) return
      done = true
      clearTimeout(timer)
      child.removeListener('exit', onExit)
      resolve(exited)
    }
    const onExit = () => finish(true)
    const timer = setTimeout(() => finish(false), timeoutMs)
    child.once('exit', onExit)
  })
}

function sendTreeSignal(pid: number, signal: NodeJS.Signals): Promise<void> {
  return new Promise((resolve) => {
    treeKill(pid, signal, (error) => {
      if (error && (error as NodeJS.ErrnoException).code !== 'ESRCH') {
        diag('tree-signal-error', { pid, signal, message: error.message })
      }
      resolve()
    })
  })
}

export class ProcessManager {
  private instances = new Map<string, ProcessInstance>()
  private pendingStarts = new Map<string, { entryFile: string; promise: Promise<StartResult> }>()
  private windows: BrowserWindow[] = []
  private nextGeneration = 1
  private logFlushTimers = new Map<string, NodeJS.Timeout>()
  private pendingLogBatches = new Map<string, ProcessLogLine[]>()
  private logSequence = new Map<string, number>()
  private compileErrors = new Map<string, CompileErrorAggregator>()
  private compileErrorActive = new Set<string>()
  private pendingTrust = new Map<string, (result: { approved: boolean; ignoreScripts: boolean; choice: 'once' | 'remember' | 'cancel' }) => void>()

  public registerWindow(win: BrowserWindow): void {
    if (!this.windows.includes(win)) {
      this.windows.push(win)
      win.on('closed', () => { this.windows = this.windows.filter((window) => window !== win) })
    }
  }

  private send(channel: string, payload: unknown): void {
    for (const win of this.windows) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload)
    }
  }

  private emitStatus(instance: ProcessInstance): void {
    this.send('process:status-changed', {
      projectId: instance.projectId,
      status: instance.status,
      port: instance.port,
      url: instance.url,
      lanUrl: instance.lanUrl,
      error: instance.error
    })
  }

  private emitLog(projectId: string, rawText: string, type: 'stdout' | 'stderr' = 'stdout'): void {
    const text = stripAnsi(rawText).replace(/\r/g, '').trimEnd()
    if (!text.trim()) return
    const instance = this.instances.get(projectId)
    const seq = (this.logSequence.get(projectId) || 0) + 1
    this.logSequence.set(projectId, seq)
    const logItem: ProcessLogLine = { text, type, time: new Date().toLocaleTimeString(), seq }
    if (instance) {
      instance.logs.push(logItem)
      if (instance.logs.length > 1500) instance.logs.splice(0, instance.logs.length - 1500)
    }
    const batch = this.pendingLogBatches.get(projectId) || []
    batch.push(logItem)
    this.pendingLogBatches.set(projectId, batch)
    if (!this.logFlushTimers.has(projectId)) {
      const timer = setTimeout(() => this.flushLogs(projectId), 100)
      timer.unref?.()
      this.logFlushTimers.set(projectId, timer)
    }
  }

  private flushLogs(projectId: string): void {
    const timer = this.logFlushTimers.get(projectId)
    if (timer) clearTimeout(timer)
    this.logFlushTimers.delete(projectId)
    const lines = this.pendingLogBatches.get(projectId) || []
    this.pendingLogBatches.delete(projectId)
    if (lines.length) this.send('process:log-batch', { projectId, lines })
  }

  private emitCompileEvents(projectId: string, events: CompileEvent[], instance?: ProcessInstance): void {
    for (const event of events) {
      if (event.type === 'error') {
        this.compileErrorActive.add(projectId)
        this.send('process:compile-error', { projectId, ...event, message: event.summary })
      } else {
        if (this.compileErrorActive.delete(projectId)) this.send('process:compile-ok', { projectId })
        if (instance) instance.error = undefined
      }
    }
  }

  private requestInstallTrust(projectId: string, command: string, signal?: AbortSignal): Promise<{ approved: boolean; ignoreScripts: boolean }> {
    const project = projectStore.getProject(projectId)
    if (!project || project.trusted !== false) return Promise.resolve({ approved: true, ignoreScripts: false })
    if (signal?.aborted) return Promise.resolve({ approved: false, ignoreScripts: true })
    const requestId = `${projectId}:${Date.now()}:${Math.random().toString(36).slice(2)}`
    return new Promise((resolve) => {
      const finish = (result: { approved: boolean; ignoreScripts: boolean }) => {
        this.pendingTrust.delete(requestId)
        clearTimeout(timeout)
        signal?.removeEventListener('abort', onAbort)
        resolve(result)
      }
      const onAbort = () => finish({ approved: false, ignoreScripts: true })
      const timeout = setTimeout(() => finish({ approved: false, ignoreScripts: true }), 5 * 60 * 1000)
      this.pendingTrust.set(requestId, (result) => {
        finish({ approved: result.approved, ignoreScripts: result.ignoreScripts })
      })
      signal?.addEventListener('abort', onAbort, { once: true })
      this.send('process:needs-trust', { requestId, projectId, command })
    })
  }

  public confirmTrust(requestId: string, choice: 'once' | 'remember' | 'cancel', ignoreScripts = true): boolean {
    const resolve = this.pendingTrust.get(requestId)
    if (!resolve) return false
    this.pendingTrust.delete(requestId)
    const [, projectId] = requestId.split(':')
    if (choice === 'remember' && projectId) projectStore.updateProject(projectId, { trusted: true })
    resolve({ approved: choice !== 'cancel', ignoreScripts, choice })
    return true
  }

  private async runInstall(projectId: string, instance: ProcessInstance, args: string[], description: string, trustCommand: string): Promise<void> {
    const settings = projectStore.getSettings()
    const project = projectStore.getProject(projectId)
    let ignoreScripts = false
    if (project?.trusted === false) {
      const trust = await this.requestInstallTrust(projectId, trustCommand, instance.abortController.signal)
      if (!trust.approved) throw new Error('Đã huỷ cài dependencies vì dự án chưa được xác nhận tin cậy.')
      ignoreScripts = trust.ignoreScripts
    }
    instance.status = 'installing'
    this.emitStatus(instance)
    await installQueue.run(`${projectId}:install`, async () => {
      if (instance.abortController.signal.aborted) throw Object.assign(new Error('Đã huỷ tác vụ cài đặt'), { code: 'STOPPED_BY_USER' })
      const installArgs = [...args, ...(settings.server.registry && !args.includes('--registry') ? ['--registry', settings.server.registry] : []), ...(ignoreScripts ? ['--ignore-scripts'] : [])]
      const child = execa(settings.server.packageManager, installArgs, {
        cwd: instance.projectPath,
        env: this.getEnv(),
        buffer: false,
        stdin: 'ignore',
        reject: false,
        signal: instance.abortController.signal
      })
      instance.installProcess = child
      instance.pid = child.pid
      child.once('exit', () => {
        if (instance.installProcess === child) {
          instance.installProcess = undefined
          instance.pid = undefined
        }
      })
      child.stdout?.on('data', (data) => this.emitLog(projectId, data.toString(), 'stdout'))
      child.stderr?.on('data', (data) => this.emitLog(projectId, data.toString(), 'stderr'))
      const result = await child
      instance.installProcess = undefined
      instance.pid = undefined
      if (instance.abortController.signal.aborted) throw Object.assign(new Error('Đã huỷ tác vụ cài đặt'), { code: 'STOPPED_BY_USER' })
      if (result.exitCode !== 0) throw new Error(`${description} thất bại với mã lỗi ${result.exitCode}`)
    }, instance.abortController.signal)
    this.emitLog(projectId, `[Slidev Studio] ${description} hoàn tất.`)
  }

  private packageAddArgs(packageManager: string, packageName: string): string[] {
    if (packageManager === 'pnpm') return ['add', '-D', packageName]
    if (packageManager === 'yarn') return ['add', '-D', packageName]
    if (packageManager === 'bun') return ['add', '-d', packageName]
    return ['install', '--save-dev', packageName]
  }

  private emitCompileLine(projectId: string, line: string, instance: ProcessInstance): void {
    const aggregator = this.compileErrors.get(projectId)
    if (aggregator) this.emitCompileEvents(projectId, aggregator.push(line), instance)
  }

  private async verifyTheme(projectId: string, instance: ProcessInstance): Promise<void> {
    const entryPath = path.join(instance.projectPath, instance.entryFile)
    const entryText = await fs.readFile(entryPath, 'utf8')
    const theme = readTheme(entryText)
    if (!theme) return
    const resolved = themePackageName(theme)
    let result = checkThemeInstalled(instance.projectPath, resolved)
    if (!result.ok && result.reason === 'path-missing') throw new Error(`Không tìm thấy theme theo đường dẫn ${resolved.kind === 'path' ? resolved.path : theme}.`)
    if (!result.ok && result.reason === 'missing') {
      if (!projectStore.getSettings().server.autoInstallDeps) {
        throw new Error(`Theme ${resolved.kind === 'package' ? resolved.name : theme} chưa được cài. Hãy chạy lệnh cài package theme trong thư mục dự án.`)
      }
      const name = resolved.kind === 'package' ? resolved.name : theme
      const manager = projectStore.getSettings().server.packageManager
      const args = this.packageAddArgs(manager, name)
      this.emitLog(projectId, `[Slidev Studio] Theme ${name} chưa cài, đang cài...`)
      await this.runInstall(projectId, instance, args, `Cài theme ${name}`, `${manager} ${args.join(' ')}`)
      result = checkThemeInstalled(instance.projectPath, resolved)
      if (!result.ok) throw new Error(`Không xác nhận được theme ${name} sau khi cài đặt.`)
    }
    const cliPath = path.join(instance.projectPath, 'node_modules', '@slidev', 'cli', 'package.json')
    const cliVersion = fs.existsSync(cliPath) ? String((await fs.readJson(cliPath)).version || '') : ''
    if (result.ok && !isEngineCompatible(result.engine, cliVersion)) {
      throw new Error(`Theme ${resolved.kind === 'package' ? resolved.name : theme}@${result.version || 'unknown'} yêu cầu Slidev ${result.engine}, đang cài CLI ${cliVersion || 'không xác định'}. Hãy nâng @slidev/cli hoặc ghim theme phiên bản cũ hơn.`)
    }
  }

  public getStatus(projectId: string): Omit<ProcessInstance, 'childProcess' | 'installProcess' | 'abortController'> | null {
    const instance = this.instances.get(projectId)
    if (!instance) return null
    const { childProcess: _child, installProcess: _install, abortController: _abort, ...status } = instance
    return status
  }

  public getLogs(projectId: string): ProcessLogLine[] {
    return [...(this.instances.get(projectId)?.logs || [])]
  }

  private getEnv(): NodeJS.ProcessEnv {
    return buildEnv(projectStore.getSettings())
  }

  public start(projectId: string, projectPath: string, entryFile: string, options: { force?: boolean } = {}): Promise<StartResult> {
    const pending = this.pendingStarts.get(projectId)
    if (pending) {
      if (!options.force && pending.entryFile === entryFile) return pending.promise
      return pending.promise.catch(() => undefined).then(() => this.start(projectId, projectPath, entryFile, options))
    }

    const promise = this.startInternal(projectId, projectPath, entryFile, options)
    this.pendingStarts.set(projectId, { entryFile, promise })
    const clear = () => {
      if (this.pendingStarts.get(projectId)?.promise === promise) this.pendingStarts.delete(projectId)
    }
    void promise.then(clear, clear)
    return promise
  }

  private async startInternal(projectId: string, projectPath: string, entryFile: string, options: { force?: boolean } = {}): Promise<StartResult> {
    const existing = this.instances.get(projectId)
    if (!options.force && existing?.status === 'running' && existing.entryFile === entryFile && existing.port && existing.url) {
      return { port: existing.port, url: existing.url, lanUrl: existing.lanUrl }
    }
    if (existing) await this.stop(projectId, 'restart-before-start')

    const instance: ProcessInstance = {
      projectId,
      projectPath,
      entryFile,
      status: 'starting',
      logs: [],
      generation: this.nextGeneration++,
      abortController: new AbortController()
    }
    this.instances.set(projectId, instance)
    this.compileErrors.set(projectId, new CompileErrorAggregator())
    this.compileErrorActive.delete(projectId)
    const generation = instance.generation
    this.emitStatus(instance)
    this.emitLog(projectId, `[Slidev Studio] Chuẩn bị khởi chạy slidev cho "${entryFile}"...`)
    diag('start', { projectId, projectPath, entryFile, generation, caller: new Error().stack?.split('\n').slice(2, 5).join('\n') })

    const settings = projectStore.getSettings()
    const server = settings.server
    try {
      const localBin = path.join(projectPath, 'node_modules', '.bin', process.platform === 'win32' ? 'slidev.cmd' : 'slidev')
      const cliPackage = path.join(projectPath, 'node_modules', '@slidev', 'cli', 'package.json')
      const dependenciesInstalled = fs.existsSync(localBin) || fs.existsSync(cliPackage)
      if (!dependenciesInstalled) {
        if (!server.autoInstallDeps) {
          throw new Error('Dự án chưa cài Slidev CLI. Bật tự động cài dependencies hoặc chạy package manager install rồi thử lại.')
        }
        const queuedAhead = installQueue.pendingCount()
        if (queuedAhead) this.emitLog(projectId, `[Slidev Studio] Đang xếp hàng cài dependencies (còn ${queuedAhead} tác vụ phía trước)...`)
        else this.emitLog(projectId, `[Slidev Studio] Không tìm thấy Slidev trong node_modules. Đang chạy "${server.packageManager} install"...`)
        await this.runInstall(projectId, instance, ['install'], 'Cài dependencies', `${server.packageManager} install`)
      }

      await this.verifyTheme(projectId, instance)

      const twoslashPatch = patchTwoslashFloatingVue(projectPath)
      if (twoslashPatch === 'patched') {
        this.emitLog(projectId, '[Slidev Studio] Đã áp dụng bản vá tương thích FloatingVue cho Twoslash.')
      } else if (twoslashPatch === 'unsupported') {
        this.emitLog(projectId, '[Cảnh báo] Có phiên bản Twoslash không khớp bản vá tương thích FloatingVue của Studio.', 'stderr')
      }

      const runner = resolveSlidevRunner(projectPath)
      if (!runner) {
        throw new Error('Không tìm thấy lệnh Slidev trong node_modules/.bin. Hãy cài lại dependencies của dự án; Studio không tự tải một bản CLI khác.')
      }

      const preferredPort = projectStore.getProject(projectId)?.preferredPort || server.defaultPort
      const remotePassword = server.bindMode === 'lan' ? server.remotePassword || randomBytes(4).toString('hex') : ''
      if (server.bindMode === 'lan' && !server.remotePassword) {
        this.emitLog(projectId, `[Slidev Studio] Mật khẩu remote của phiên này: ${remotePassword}`)
      }
      let port = await portAllocator.acquire(preferredPort, server.portScanRange, server.strictPort, projectId)
      let lastError: Error | undefined

      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (instance.abortController.signal.aborted || generation !== instance.generation) {
          throw Object.assign(new Error('Đã huỷ khởi chạy Slidev'), { code: 'STOPPED_BY_USER' })
        }
        instance.port = port
        instance.status = 'starting'
        instance.error = undefined
        this.emitStatus(instance)
        if (port !== preferredPort) this.emitLog(projectId, `[Cảnh báo] Cổng ưu tiên ${preferredPort} đang bận; dự án dùng cổng ${port}.`, 'stderr')
        this.emitLog(projectId, `[Slidev Studio] Đã giữ cổng ${port}. Đang khởi chạy tiến trình Slidev...`)

        const args = [
          ...runner.prefixArgs,
          ...this.splitArgs(server.extraArgs), entryFile, '--port', String(port),
          ...(server.openExternalBrowser ? ['--open'] : []),
          ...(server.bindMode === 'lan' ? [`--remote=${remotePassword}`, '--bind=0.0.0.0'] : []),
          ...(options.force ? ['--force'] : [])
        ]
        this.emitLog(projectId, `[Slidev Studio] Thực thi: ${runner.command} ${args.map((arg) => arg.startsWith('--remote=') ? '--remote=••••' : arg).join(' ')}`)
        const child = execa(runner.command, args, {
          cwd: projectPath,
          env: this.getEnv(),
          detached: server.keepServersOnQuit,
          buffer: false,
          stdin: 'ignore',
          reject: false,
          signal: instance.abortController.signal
        })
        instance.childProcess = child
        instance.pid = child.pid
        const childPid = child.pid
        let output = ''
        let stdoutBuffer = ''
        let stderrBuffer = ''
        const consumeOutput = (type: 'stdout' | 'stderr', data: Buffer | string): void => {
          const raw = type === 'stdout' ? `${stdoutBuffer}${data.toString()}` : `${stderrBuffer}${data.toString()}`
          const lines = raw.split(/\r?\n/)
          if (type === 'stdout') stdoutBuffer = lines.pop() || ''
          else stderrBuffer = lines.pop() || ''
          for (const rawLine of lines) {
            const line = stripAnsi(rawLine)
            this.emitCompileLine(projectId, line, instance)
            if (!line.trim()) continue
            output = `${output}${line}\n`.slice(-12000)
            this.emitLog(projectId, line, type)
            if (type === 'stdout' && /hmr update|page reload|hmr invalidate|program reload|server restarted/i.test(line) && generation === instance.generation) instance.error = undefined
          }
        }
        let exitedResolve!: (result: ExitResult) => void
        const exited = new Promise<ExitResult>((resolve) => { exitedResolve = resolve })
        child.stdout?.on('data', (data) => consumeOutput('stdout', data))
        child.stderr?.on('data', (data) => consumeOutput('stderr', data))
        child.on('error', (error) => { exitedResolve({ code: 1, signal: null }); lastError = error })
        child.once('exit', (code, signal) => {
          if (stdoutBuffer.trim()) consumeOutput('stdout', '\n')
          if (stderrBuffer.trim()) consumeOutput('stderr', '\n')
          const aggregator = this.compileErrors.get(projectId)
          if (aggregator) this.emitCompileEvents(projectId, aggregator.flush(), instance)
          exitedResolve({ code, signal })
          diag('child-exit', { projectId, pid: childPid, ppid: process.pid, pgid: server.keepServersOnQuit ? childPid : null, port, code, signal, generation })
          if (childPid) pidRegistry.remove(childPid)
          if (instance.childProcess === child) {
            instance.childProcess = undefined
            instance.pid = undefined
          }
          if (instance.port === port) {
            portAllocator.release(port, projectId)
            instance.port = undefined
          }
          const isCurrent = this.instances.get(projectId)?.generation === generation
          if (!isCurrent || instance.abortController.signal.aborted) return
          if (instance.status === 'running') {
            instance.status = code === 0 ? 'stopped' : 'error'
            instance.error = code === 0 ? undefined : `Tiến trình kết thúc với mã lỗi ${code} (${signal})`
            this.emitStatus(instance)
          }
          if (instance.status !== 'starting') this.emitLog(projectId, `[Slidev Studio] Tiến trình đã dừng (code: ${code}, signal: ${signal})`)
        })
        if (childPid) {
          pidRegistry.add({ pid: childPid, projectId, port, appPid: process.pid, startedAt: new Date().toISOString(), cmdHint: runner.command })
        }

        try {
          await Promise.race([
            waitForReady(port, { signal: instance.abortController.signal, timeoutMs: server.startupTimeoutMs }),
            exited.then(({ code, signal }) => {
              const error = new Error(`Slidev đã thoát trước khi sẵn sàng (code: ${code}, signal: ${signal}). ${output.slice(-1500)}`)
              Object.assign(error, { code: 'PROCESS_EXITED' })
              throw error
            })
          ])
          if (generation !== instance.generation || instance.abortController.signal.aborted) {
            throw Object.assign(new Error('Đã huỷ khởi chạy Slidev'), { code: 'STOPPED_BY_USER' })
          }
          instance.url = `http://localhost:${port}`
          instance.lanUrl = server.bindMode === 'lan' ? `http://${this.getLanHost()}:${port}` : undefined
          instance.status = 'running'
          instance.error = undefined
          this.emitStatus(instance)
          this.emitLog(projectId, `[Slidev Studio] Máy chủ đã sẵn sàng tại ${instance.url}`)
          return { port, url: instance.url, lanUrl: instance.lanUrl }
        } catch (error) {
          lastError = error as Error
          const portInUse = /port\s+\d+\s+is already in use/i.test(output)
          if (portInUse && !server.strictPort && attempt < 2 && !instance.abortController.signal.aborted) {
            this.emitLog(projectId, `[Slidev Studio] Cổng ${port} vừa bị tiến trình khác chiếm. Đang thử cổng kế tiếp...`, 'stderr')
            if (childPid) await sendTreeSignal(childPid, 'SIGTERM')
            await waitForChildExit(child, 3000)
            portAllocator.release(port, projectId)
            instance.port = undefined
            port = await portAllocator.acquire(port + 1, Math.max(0, server.portScanRange - 1), false, projectId)
            continue
          }
          if (childPid) {
            await sendTreeSignal(childPid, 'SIGTERM')
            if (!(await waitForChildExit(child, 3000))) {
              await sendTreeSignal(childPid, 'SIGKILL')
              await waitForChildExit(child, 2000)
            }
          }
          throw lastError
        }
      }
      throw lastError || new Error('Không thể khởi động Slidev.')
    } catch (error) {
      const err = error as Error & { code?: string }
      const child = instance.installProcess || instance.childProcess
      const pid = instance.pid
      if (child && pid) {
        await sendTreeSignal(pid, 'SIGTERM')
        if (!(await waitForChildExit(child, 3000))) {
          await sendTreeSignal(pid, 'SIGKILL')
          await waitForChildExit(child, 2000)
        }
        pidRegistry.remove(pid)
      }
      instance.childProcess = undefined
      instance.installProcess = undefined
      instance.pid = undefined
      if (instance.port !== undefined) portAllocator.release(instance.port, projectId)
      instance.port = undefined
      if (generation === instance.generation && this.instances.get(projectId) === instance) {
        if (err.code === 'STOPPED_BY_USER' || instance.abortController.signal.aborted) {
          instance.status = 'stopped'
          instance.error = undefined
        } else {
          instance.status = 'error'
          instance.error = err.message || String(err)
          this.emitLog(projectId, `[Slidev Studio] ${instance.error}`, 'stderr')
        }
        this.emitStatus(instance)
      }
      throw err
    }
  }

  public async stop(projectId: string, reason = 'user'): Promise<boolean> {
    const instance = this.instances.get(projectId)
    if (!instance) return true
    const pid = instance.pid
    diag('stop', { projectId, pid, ppid: process.pid, pgid: pid && projectStore.getSettings().server.keepServersOnQuit ? pid : null, port: instance.port, reason, caller: new Error().stack?.split('\n').slice(2, 6).join('\n') })
    instance.status = 'stopped'
    instance.error = undefined
    const compileAggregator = this.compileErrors.get(projectId)
    if (compileAggregator) this.emitCompileEvents(projectId, compileAggregator.flush(), instance)
    this.compileErrors.delete(projectId)
    this.compileErrorActive.delete(projectId)
    instance.abortController.abort()
    this.emitStatus(instance)
    this.emitLog(projectId, `[Slidev Studio] Đang dừng tiến trình${pid ? ` (PID: ${pid})` : ''}...`)

    const child = instance.installProcess || instance.childProcess
    if (pid && child) {
      await sendTreeSignal(pid, 'SIGTERM')
      if (!(await waitForChildExit(child, 3000))) {
        await sendTreeSignal(pid, 'SIGKILL')
        if (!(await waitForChildExit(child, 5000))) {
          const message = `Không xác nhận được tiến trình ${pid} đã thoát sau SIGKILL.`
          instance.status = 'error'
          instance.error = message
          this.emitStatus(instance)
          this.emitLog(projectId, `[Slidev Studio] ${message}`, 'stderr')
          diag('stop-timeout', { projectId, pid, port: instance.port, reason })
          this.flushLogs(projectId)
          return false
        }
      }
    }
    if (instance.pid) pidRegistry.remove(instance.pid)
    if (instance.port !== undefined) portAllocator.release(instance.port, projectId)
    instance.childProcess = undefined
    instance.installProcess = undefined
    instance.pid = undefined
    instance.port = undefined
    instance.url = undefined
    instance.lanUrl = undefined
    instance.status = 'stopped'
    this.emitStatus(instance)
    this.emitLog(projectId, '[Slidev Studio] Đã dừng tiến trình an toàn.')
    this.flushLogs(projectId)
    return true
  }

  public async restart(projectId: string, projectPath: string, entryFile: string): Promise<StartResult> {
    await this.stop(projectId, 'restart')
    this.pendingStarts.delete(projectId)
    return this.start(projectId, projectPath, entryFile)
  }

  public async recompile(projectId: string, projectPath: string, entryFile: string): Promise<StartResult> {
    await this.stop(projectId, 'recompile')
    this.pendingStarts.delete(projectId)
    return this.start(projectId, projectPath, entryFile, { force: true })
  }

  private splitArgs(input: string): string[] {
    const matches = input.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || []
    return matches.map((value) => value.replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_match, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted))
  }

  private getLanHost(): string {
    for (const entries of Object.values(os.networkInterfaces())) {
      for (const entry of entries || []) if (entry.family === 'IPv4' && !entry.internal) return entry.address
    }
    return '127.0.0.1'
  }

  public async stopAll(): Promise<void> {
    if (projectStore.getSettings().server.keepServersOnQuit) return
    await Promise.all([...this.instances.keys()].map((id) => this.stop(id, 'app-quit')))
    for (const projectId of [...this.logFlushTimers.keys()]) this.flushLogs(projectId)
    this.instances.clear()
  }

  public killAllSync(): void {
    if (projectStore.getSettings().server.keepServersOnQuit) return
    for (const instance of this.instances.values()) {
      instance.abortController.abort()
      if (instance.pid) {
        try { process.kill(instance.pid, 'SIGKILL') } catch { /* Best-effort on process exit. */ }
      }
    }
  }
}

export const processManager = new ProcessManager()
