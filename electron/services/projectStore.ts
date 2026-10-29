import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import { execa } from 'execa'
import { DEFAULT_SETTINGS, type AppSettings, type DeepPartial, type SettingsGroup } from '../../shared/settings'
import { canonicalPath, samePath } from '../utils/path'
import { validateGitUrl } from '../utils/gitUrl'
import { validateSettingsImportFields } from '../utils/settingsImportValidation'
import { portAllocator } from './portFinder'
import { dataDir } from '../utils/dataDir'

export interface ProjectItem {
  kind?: 'slidev' | 'latex' | 'markdown-report'
  id: string
  name: string
  path: string
  entryFiles: string[]
  gitUrl: string | null
  lastOpenedAt: string
  preferredPort?: number
  trusted?: boolean
}

export interface SettingsImportPreview {
  settings: AppSettings
  warnings: string[]
  changedSensitive: boolean
}

export type { AppSettings } from '../../shared/settings'

export interface StoreData {
  projects: ProjectItem[]
  settings: AppSettings
}

export class ProjectStore {
  private configDir: string
  private configPath: string
  private data: StoreData
  private settingsSaveTimer: NodeJS.Timeout | null = null

  constructor() {
    this.configDir = dataDir()
    this.configPath = path.join(this.configDir, 'projects.json')
    this.data = {
      projects: [],
      settings: {
        ...structuredClone(DEFAULT_SETTINGS),
        projects: {
          ...structuredClone(DEFAULT_SETTINGS.projects),
          defaultWorkspaceDir: path.join(os.homedir(), 'SlidevProjects')
        }
      }
    }
    this.init()
  }

  private init(): void {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirpSync(this.configDir)
      }
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, 'utf8')
        const parsed = JSON.parse(raw)
        const settings = parsed.settings || {}
        const upgradeLegacyStartupTimeout =
          settings.settingsVersion === 2 && settings.server?.startupTimeoutMs === 20000
        const currentSettings = upgradeLegacyStartupTimeout
          ? { ...settings, server: { ...settings.server, startupTimeoutMs: DEFAULT_SETTINGS.server.startupTimeoutMs } }
          : settings
        const migrated = settings.settingsVersion === 2 ? currentSettings : this.migrateV1Settings(settings)
        if (settings.settingsVersion !== 2) {
          const backupPath = `${this.configPath}.bak-v1`
          if (!fs.existsSync(backupPath)) fs.copyFileSync(this.configPath, backupPath)
        }
        const projects = Array.isArray(parsed.projects)
          ? (parsed.projects as ProjectItem[]).map((project) => ({
              ...project,
              trusted: typeof project.trusted === 'boolean' ? project.trusted : true
            }))
          : []
        const uniqueProjects: ProjectItem[] = []
        for (const project of [...projects].sort(
          (a, b) => (Date.parse(b.lastOpenedAt) || 0) - (Date.parse(a.lastOpenedAt) || 0)
        )) {
          const existing = uniqueProjects.find((item) => samePath(item.path, project.path))
          if (!existing) uniqueProjects.push(project)
          else if (existing.preferredPort === undefined && project.preferredPort !== undefined)
            existing.preferredPort = project.preferredPort
        }
        this.data = {
          projects: uniqueProjects,
          settings: this.sanitizeSettings(this.deepMerge(this.data.settings, migrated))
        }
        if (settings.settingsVersion !== 2 || uniqueProjects.length !== projects.length || upgradeLegacyStartupTimeout)
          this.save()
      } else {
        this.save()
      }
    } catch (err) {
      console.error('Failed to initialize project store:', err)
    }
  }

  private save(): void {
    try {
      fs.writeJsonSync(this.configPath, this.data, { spaces: 2 })
    } catch (err) {
      console.error('Failed to save project store:', err)
    }
  }

  private migrateV1Settings(old: Record<string, any>): DeepPartial<AppSettings> {
    const themeMode = old.themeMode
    return {
      appearance: {
        themeId: themeMode === 'light' ? 'academic-overleaf' : 'studio-dark',
        followSystem: themeMode === 'system'
      },
      editor: { fontSize: old.editorFontSize },
      projects: { defaultWorkspaceDir: old.defaultWorkspaceDir },
      system: { nodePathOverride: old.nodePathOverride || '' }
    }
  }

  private deepMerge<T extends Record<string, any>>(base: T, patch: Record<string, any>): T {
    const result: Record<string, any> = structuredClone(base)
    for (const [key, value] of Object.entries(patch || {})) {
      if (value === undefined || value === null) continue
      if (base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
        if (typeof value === 'object' && !Array.isArray(value)) result[key] = this.deepMerge(base[key], value)
        continue
      }
      if (Array.isArray(base[key]) && !Array.isArray(value)) continue
      result[key] = structuredClone(value)
    }
    return result as T
  }

  private sanitizeSettings(value: AppSettings): AppSettings {
    const defaults = this.data.settings
    const safeNumber = (input: unknown, fallback: number, min: number, max: number): number => {
      const number = Number(input)
      return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback
    }
    const pick = <T extends string>(input: unknown, allowed: readonly T[], fallback: T): T =>
      allowed.includes(input as T) ? (input as T) : fallback
    const safeString = (input: unknown, fallback: string): string => (typeof input === 'string' ? input : fallback)
    const safeBoolean = (input: unknown, fallback: boolean): boolean => (typeof input === 'boolean' ? input : fallback)
    const themeIds = [
      'studio-dark',
      'academic-overleaf',
      'github-light',
      'dracula',
      'nord',
      'catppuccin-mocha'
    ] as const
    const settings = this.deepMerge(structuredClone(DEFAULT_SETTINGS), value as unknown as Record<string, any>)
    const legacyWorkspace = (value as any)?.defaultWorkspaceDir
    const legacyNodePath = (value as any)?.nodePathOverride
    const legacyFontSize = (value as any)?.editorFontSize
    if (legacyWorkspace && !settings.projects.defaultWorkspaceDir)
      settings.projects.defaultWorkspaceDir = legacyWorkspace
    if (legacyNodePath && !settings.system.nodePathOverride) settings.system.nodePathOverride = legacyNodePath
    if (legacyFontSize) settings.editor.fontSize = legacyFontSize
    settings.settingsVersion = 2
    settings.appearance.themeId = pick(settings.appearance.themeId, themeIds, defaults.appearance.themeId)
    settings.appearance.themeIdLight = pick(settings.appearance.themeIdLight, themeIds, 'academic-overleaf')
    settings.appearance.themeIdDark = pick(settings.appearance.themeIdDark, themeIds, 'studio-dark')
    settings.appearance.uiZoom = safeNumber(settings.appearance.uiZoom, 1, 0.85, 1.25)
    settings.appearance.uiFontFamily = pick(
      settings.appearance.uiFontFamily,
      ['system', 'inter', 'source-sans'] as const,
      'system'
    )
    settings.appearance.followSystem = safeBoolean(settings.appearance.followSystem, false)
    settings.editor.fontSize = safeNumber(settings.editor.fontSize, 14, 10, 32)
    settings.editor.fontFamily = safeString(settings.editor.fontFamily, DEFAULT_SETTINGS.editor.fontFamily)
    settings.editor.fontLigatures = safeBoolean(settings.editor.fontLigatures, false)
    settings.editor.lineNumbers = safeBoolean(settings.editor.lineNumbers, true)
    settings.editor.minimap = safeBoolean(settings.editor.minimap, true)
    settings.editor.autoSaveDelayMs = safeNumber(settings.editor.autoSaveDelayMs, 1200, 100, 10000)
    settings.editor.autoSaveGuard = safeBoolean(settings.editor.autoSaveGuard, true)
    settings.editor.monacoTheme = safeString(settings.editor.monacoTheme, 'follow-app')
    settings.editor.tabSize = Number(settings.editor.tabSize) === 4 ? 4 : 2
    settings.editor.wordWrap = pick(settings.editor.wordWrap, ['on', 'off'] as const, 'on')
    settings.editor.renderWhitespace = pick(
      settings.editor.renderWhitespace,
      ['none', 'selection', 'all'] as const,
      'selection'
    )
    settings.editor.autoSave = pick(settings.editor.autoSave, ['off', 'afterDelay', 'onBlur'] as const, 'afterDelay')
    settings.preview.navMode = pick(
      settings.preview.navMode,
      ['paged', 'scroll-vertical', 'scroll-horizontal'] as const,
      'paged'
    )
    settings.preview.wheelAxis = pick(settings.preview.wheelAxis, ['horizontal', 'vertical', 'both'] as const, 'both')
    settings.preview.fitMode = pick(
      settings.preview.fitMode,
      ['fit-width', 'fit-height', 'manual'] as const,
      'fit-width'
    )
    settings.preview.colorScheme = pick(
      settings.preview.colorScheme,
      ['follow-app', 'light', 'dark', 'slide-default'] as const,
      'follow-app'
    )
    settings.preview.slideGapPx = safeNumber(settings.preview.slideGapPx, 24, 0, 120)
    settings.preview.scrollSnap = safeBoolean(settings.preview.scrollSnap, true)
    settings.preview.restoreSlideAfterRestart = safeBoolean(settings.preview.restoreSlideAfterRestart, true)
    settings.preview.sourceJump.enabled = safeBoolean(settings.preview.sourceJump.enabled, true)
    settings.preview.sourceJump.trigger = pick(
      settings.preview.sourceJump.trigger,
      ['alt-click', 'ctrl-click', 'double-click', 'click'] as const,
      'alt-click'
    )
    settings.preview.sourceJump.flashMs = safeNumber(settings.preview.sourceJump.flashMs, 1000, 100, 5000)
    settings.preview.sourceJump.syncEditorToPreview = safeBoolean(
      settings.preview.sourceJump.syncEditorToPreview,
      false
    )
    settings.server.defaultPort = safeNumber(
      settings.server.defaultPort,
      DEFAULT_SETTINGS.server.defaultPort,
      1024,
      65535
    )
    settings.server.portScanRange = safeNumber(
      settings.server.portScanRange,
      DEFAULT_SETTINGS.server.portScanRange,
      0,
      10000
    )
    settings.server.startupTimeoutMs = safeNumber(
      settings.server.startupTimeoutMs,
      DEFAULT_SETTINGS.server.startupTimeoutMs,
      1000,
      120000
    )
    settings.server.bindMode = pick(settings.server.bindMode, ['localhost', 'lan'] as const, 'localhost')
    settings.server.packageManager = pick(
      settings.server.packageManager,
      ['npm', 'pnpm', 'yarn', 'bun'] as const,
      'npm'
    )
    settings.server.strictPort = safeBoolean(settings.server.strictPort, false)
    settings.server.remotePassword = safeString(settings.server.remotePassword, '')
    settings.server.openExternalBrowser = safeBoolean(settings.server.openExternalBrowser, false)
    settings.server.extraArgs = safeString(settings.server.extraArgs, '')
    settings.server.autoInstallDeps = safeBoolean(settings.server.autoInstallDeps, true)
    settings.server.registry = safeString(settings.server.registry, '')
    settings.server.stopServerOnTabClose = safeBoolean(settings.server.stopServerOnTabClose, true)
    settings.server.keepServersOnQuit = safeBoolean(settings.server.keepServersOnQuit, false)
    settings.export.defaultFormat = pick(
      settings.export.defaultFormat,
      ['pdf', 'png', 'pptx', 'pptx-editable', 'md', 'build'] as const,
      'pdf'
    )
    settings.export.outputDir = safeString(settings.export.outputDir, 'project/export')
    settings.export.openFolderAfterExport = safeBoolean(settings.export.openFolderAfterExport, false)
    const exportOptions =
      settings.export.defaultOptions && typeof settings.export.defaultOptions === 'object'
        ? settings.export.defaultOptions
        : DEFAULT_SETTINGS.export.defaultOptions
    settings.export.defaultOptions = {
      range: typeof exportOptions.range === 'string' ? exportOptions.range : undefined,
      dark: safeBoolean(exportOptions.dark, false),
      withClicks: safeBoolean(exportOptions.withClicks, false),
      omitBackground: safeBoolean(exportOptions.omitBackground, false),
      timeout: exportOptions.timeout === undefined ? undefined : safeNumber(exportOptions.timeout, 30000, 1000, 120000),
      outputName: typeof exportOptions.outputName === 'string' ? exportOptions.outputName : undefined
    }
    settings.projects.defaultWorkspaceDir = safeString(
      settings.projects.defaultWorkspaceDir,
      defaults.projects.defaultWorkspaceDir
    )
    settings.projects.defaultAuthor = safeString(settings.projects.defaultAuthor, '')
    settings.projects.defaultCliRange = safeString(settings.projects.defaultCliRange, '^53.0.0')
    settings.projects.gitInitOnCreate = safeBoolean(settings.projects.gitInitOnCreate, false)
    settings.projects.restoreTabsOnLaunch = safeBoolean(settings.projects.restoreTabsOnLaunch, false)
    settings.projects.confirmBeforeCloseTab = safeBoolean(settings.projects.confirmBeforeCloseTab, true)
    settings.system.nodePathOverride = safeString(settings.system.nodePathOverride, '')
    settings.system.logLevel = pick(settings.system.logLevel, ['error', 'info', 'debug'] as const, 'info')
    return settings
  }

  private scheduleSettingsSave(): void {
    if (this.settingsSaveTimer) clearTimeout(this.settingsSaveTimer)
    this.settingsSaveTimer = setTimeout(() => {
      this.settingsSaveTimer = null
      this.save()
    }, 300)
  }

  public flushSettings(): void {
    if (this.settingsSaveTimer) clearTimeout(this.settingsSaveTimer)
    this.settingsSaveTimer = null
    this.save()
  }

  public getProjects(): ProjectItem[] {
    // Filter out missing folders or keep them with flag
    return this.data.projects.sort((a, b) => {
      const timeA = new Date(a.lastOpenedAt).getTime() || 0
      const timeB = new Date(b.lastOpenedAt).getTime() || 0
      return timeB - timeA
    })
  }

  public getProject(id: string): ProjectItem | undefined {
    return this.data.projects.find((p) => p.id === id)
  }

  public getSettings(): AppSettings {
    return this.data.settings
  }

  public updateSettings(partial: DeepPartial<AppSettings>): AppSettings {
    this.data.settings = this.sanitizeSettings(this.deepMerge(this.data.settings, partial as Record<string, any>))
    this.scheduleSettingsSave()
    return this.data.settings
  }

  public resetSettings(group?: SettingsGroup): AppSettings {
    if (group) {
      const value = DEFAULT_SETTINGS[group] as any
      this.data.settings = this.sanitizeSettings({
        ...this.data.settings,
        [group]:
          group === 'projects'
            ? { ...structuredClone(value), defaultWorkspaceDir: path.join(os.homedir(), 'SlidevProjects') }
            : structuredClone(value)
      })
    } else {
      this.data.settings = this.sanitizeSettings({
        ...structuredClone(DEFAULT_SETTINGS),
        projects: {
          ...structuredClone(DEFAULT_SETTINGS.projects),
          defaultWorkspaceDir: path.join(os.homedir(), 'SlidevProjects')
        }
      })
    }
    this.scheduleSettingsSave()
    return this.data.settings
  }

  public prepareSettingsImport(input: unknown): SettingsImportPreview {
    const { settings: imported, warnings } = validateSettingsImportFields(input)
    const next = this.sanitizeSettings(this.deepMerge(this.data.settings, imported))
    const current = this.data.settings
    const changedSensitive =
      current.system.nodePathOverride !== next.system.nodePathOverride ||
      current.server.registry !== next.server.registry ||
      current.server.extraArgs !== next.server.extraArgs ||
      current.export.outputDir !== next.export.outputDir
    return { settings: next, warnings, changedSensitive }
  }

  public applySettingsImport(preview: SettingsImportPreview): AppSettings {
    this.data.settings = preview.settings
    this.scheduleSettingsSave()
    return this.data.settings
  }

  public importSettings(input: unknown): AppSettings {
    return this.applySettingsImport(this.prepareSettingsImport(input))
  }

  public getConfigDir(): string {
    return this.configDir
  }

  public updateProject(id: string, partial: Partial<ProjectItem>): ProjectItem | undefined {
    const project = this.data.projects.find((p) => p.id === id)
    if (!project) return undefined
    if (typeof partial.name === 'string' && partial.name.trim().length >= 1 && partial.name.trim().length <= 100)
      project.name = partial.name.trim()
    if (
      'preferredPort' in partial &&
      (partial.preferredPort === undefined ||
        (Number.isInteger(partial.preferredPort) && partial.preferredPort >= 1024 && partial.preferredPort <= 65535))
    ) {
      project.preferredPort = partial.preferredPort
    }
    if (typeof partial.trusted === 'boolean') project.trusted = partial.trusted
    if (
      Array.isArray(partial.entryFiles) &&
      partial.entryFiles.every((file) => typeof file === 'string' && file.endsWith(project.kind === 'latex' ? '.tex' : '.md') && !/[\\/]|\.\./.test(file) && !file.startsWith('-'))
    ) {
      project.entryFiles = [...partial.entryFiles]
    }
    this.save()
    return project
  }

  public removeProject(id: string): boolean {
    const initialLen = this.data.projects.length
    this.data.projects = this.data.projects.filter((p) => p.id !== id)
    if (this.data.projects.length !== initialLen) {
      this.save()
      return true
    }
    return false
  }

  public async validateSlidevFolder(
    folderPath: string
  ): Promise<{ valid: boolean; entryFiles: string[]; kind?: 'slidev' | 'latex' | 'markdown-report'; reason?: string }> {
    if (!fs.existsSync(folderPath)) {
      return { valid: false, entryFiles: [], reason: 'Thư mục không tồn tại' }
    }
    const stat = await fs.stat(folderPath)
    if (!stat.isDirectory()) {
      return { valid: false, entryFiles: [], reason: 'Đường dẫn không phải là thư mục' }
    }

    const files = await fs.readdir(folderPath)
    if (files.includes('studio-report.json')) {
      try {
        const manifest = await fs.readJson(path.join(folderPath, 'studio-report.json'))
        const entryPattern = manifest.kind === 'markdown-report' ? /^[^\\/]+\.md$/i : /^[^\\/]+\.tex$/i
        if (manifest.version !== 1 || !['latex', 'markdown-report'].includes(manifest.kind) || typeof manifest.mainFile !== 'string'
          || !entryPattern.test(manifest.mainFile) || manifest.mainFile.includes('..') || manifest.mainFile.startsWith('-'))
          throw new Error('invalid')
        if (!(await fs.stat(path.join(folderPath, manifest.mainFile))).isFile()) throw new Error('missing')
        return { valid: true, entryFiles: [manifest.mainFile], kind: manifest.kind }
      } catch { return { valid: false, entryFiles: [], reason: 'studio-report.json hoặc file LaTeX chính không hợp lệ.' } }
    }
    if (files.includes('main.tex') && !files.includes('package.json')) {
      const source = await fs.readFile(path.join(folderPath, 'main.tex'), 'utf8')
      if (/\\documentclass(?:\[[^\]]*\])?\s*\{/.test(source)) return { valid: true, entryFiles: ['main.tex'], kind: 'latex' }
    }
    let hasSlidevDep = false

    // Check package.json
    if (files.includes('package.json')) {
      try {
        const pkg = await fs.readJson(path.join(folderPath, 'package.json'))
        const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
        if (allDeps['@slidev/cli'] || allDeps['@slidev/client']) {
          hasSlidevDep = true
        }
      } catch {
        // ignore json error
      }
    }

    // Check markdown files
    const mdFiles = files.filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
    const validEntryFiles: string[] = []

    for (const f of mdFiles) {
      try {
        const content = (await fs.readFile(path.join(folderPath, f), 'utf8')).replace(/^\uFEFF/, '').trimStart()
        if (
          content.startsWith('---') &&
          (content.includes('theme:') || content.includes('layout:') || content.includes('title:'))
        ) {
          validEntryFiles.push(f)
        }
      } catch {
        // ignore read error
      }
    }

    // Also check README.md if no other md files found
    if (validEntryFiles.length === 0 && files.includes('README.md')) {
      try {
        const content = (await fs.readFile(path.join(folderPath, 'README.md'), 'utf8'))
          .replace(/^\uFEFF/, '')
          .trimStart()
        if (content.startsWith('---') && (content.includes('theme:') || content.includes('layout:'))) {
          validEntryFiles.push('README.md')
        }
      } catch {
        // ignore
      }
    }

    // Also include any slides*.md files if hasSlidevDep is true
    if (hasSlidevDep && validEntryFiles.length === 0) {
      for (const f of mdFiles) {
        if (f.startsWith('slides') || f === 'index.md') {
          validEntryFiles.push(f)
        }
      }
      if (validEntryFiles.length === 0 && mdFiles.length > 0) {
        validEntryFiles.push(...mdFiles)
      }
    }

    if (!hasSlidevDep && validEntryFiles.length === 0) {
      return {
        valid: false,
        entryFiles: [],
        reason:
          'Thư mục không chứa cấu hình Slidev hợp lệ (không có @slidev/cli trong package.json và không tìm thấy file .md có frontmatter Slidev).'
      }
    }

    // Sort: slides.md first if present
    validEntryFiles.sort((a, b) => {
      if (a === 'slides.md') return -1
      if (b === 'slides.md') return 1
      return a.localeCompare(b)
    })

    if (validEntryFiles.length === 0) {
      validEntryFiles.push('slides.md')
    }

    return { valid: true, entryFiles: validEntryFiles }
  }

  public async addProjectFromFolder(folderPath: string, trusted = false): Promise<ProjectItem> {
    const resolvedPath = path.resolve(folderPath)
    const validation = await this.validateSlidevFolder(resolvedPath)
    if (!validation.valid) {
      throw new Error(validation.reason || 'Thư mục không hợp lệ')
    }

    // Check if already registered
    const existing = this.data.projects.find((p) => samePath(p.path, resolvedPath))
    if (existing) {
      existing.lastOpenedAt = new Date().toISOString()
      const discovered = new Set(validation.entryFiles)
      const existingEntries = Array.isArray(existing.entryFiles) ? existing.entryFiles : []
      const previous = existingEntries.filter((file) => discovered.has(file))
      existing.entryFiles = [...previous, ...validation.entryFiles.filter((file) => !previous.includes(file))]
      existing.kind = validation.kind || 'slidev'
      this.save()
      return existing
    }

    const folderName = path.basename(resolvedPath)
    const newProject: ProjectItem = {
      id: uuidv4(),
      kind: validation.kind || 'slidev',
      name: folderName,
      path: resolvedPath,
      entryFiles: validation.entryFiles,
      gitUrl: null,
      lastOpenedAt: new Date().toISOString(),
      preferredPort: undefined,
      trusted
    }

    this.data.projects.unshift(newProject)
    this.save()
    return newProject
  }

  public async cloneFromGit(url: string, targetDir: string): Promise<ProjectItem> {
    if (!validateGitUrl(url))
      throw new Error('URL Git không hợp lệ. Chỉ chấp nhận HTTPS, SSH hoặc dạng git@host:owner/repo.git.')
    // Check git installed
    try {
      await execa('git', ['--version'])
    } catch {
      throw new Error('Chưa cài Git trên máy hoặc không tìm thấy lệnh `git`. Vui lòng cài đặt Git trước.')
    }

    if (!fs.existsSync(targetDir)) {
      await fs.mkdirp(targetDir)
    }

    // Derive repo name from git url
    const sourcePath = url.startsWith('git@') ? url.split(':').pop() : new URL(url).pathname
    const repoName =
      sourcePath
        ?.replace(/\/$/, '')
        .split('/')
        .pop()
        ?.replace(/\.git$/, '') || 'slidev-project'
    if (!/^[A-Za-z0-9._-]{1,64}$/.test(repoName) || repoName === '.' || repoName === '..')
      throw new Error('Tên repository trong URL Git không hợp lệ.')
    const resolvedTarget = path.resolve(targetDir)
    const destPath = path.resolve(resolvedTarget, repoName)
    const relative = path.relative(resolvedTarget, destPath)
    if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      throw new Error('Đường dẫn repository nằm ngoài thư mục đích.')

    if (fs.existsSync(destPath)) {
      throw new Error(`Thư mục đích "${destPath}" đã tồn tại. Vui lòng chọn tên khác hoặc xoá thư mục cũ.`)
    }

    try {
      const { githubService } = await import('./collabRuntime')
      const { CollabGit } = await import('./collabGit')
      const credentials = /^https:\/\/github\.com\//.test(url) ? await githubService.getCredentials() : undefined
      await new CollabGit(resolvedTarget, credentials).run(['clone', '--', url, destPath], true)
    } catch (error) {
      if (fs.existsSync(destPath)) await fs.remove(destPath)
      throw error
    }

    const project = await this.addProjectFromFolder(destPath, false)
    project.gitUrl = url
    this.save()
    return project
  }

  public async cloneProject(id: string, targetDir: string, activePort?: number): Promise<ProjectItem> {
    const source = this.data.projects.find((project) => project.id === id)
    if (!source) throw new Error('Không tìm thấy dự án cần sao chép.')

    const sourcePath = canonicalPath(source.path)
    const parentPath = canonicalPath(targetDir)
    if (!fs.existsSync(parentPath) || !(await fs.stat(parentPath)).isDirectory()) {
      throw new Error('Thư mục lưu bản sao không tồn tại hoặc không hợp lệ.')
    }
    const relativeToSource = path.relative(sourcePath, parentPath)
    if (
      !relativeToSource ||
      (relativeToSource !== '..' && !relativeToSource.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeToSource))
    ) {
      throw new Error('Hãy chọn thư mục lưu bản sao nằm ngoài thư mục dự án gốc.')
    }

    const sourceValidation = await this.validateSlidevFolder(sourcePath)
    if (!sourceValidation.valid) throw new Error(sourceValidation.reason || 'Dự án gốc không còn hợp lệ.')

    const originalName = path.basename(sourcePath)
    const safeBase = originalName.slice(0, 180)
    let suffix = 1
    let destinationPath = ''
    while (suffix < 1000) {
      const copyName = suffix === 1 ? `${safeBase}-copy` : `${safeBase}-copy-${suffix}`
      const candidate = path.join(parentPath, copyName)
      const alreadyRegistered = this.data.projects.some((project) => samePath(project.path, candidate))
      if (!alreadyRegistered && !fs.existsSync(candidate)) {
        destinationPath = candidate
        break
      }
      suffix += 1
    }
    if (!destinationPath) throw new Error('Không thể tạo tên thư mục bản sao duy nhất.')

    if (sourceValidation.kind === 'latex' || sourceValidation.kind === 'markdown-report') {
      await fs.copy(sourcePath, destinationPath, {
        overwrite: false, errorOnExist: true,
        filter: async (current) => !['.git', 'node_modules', '.studio-latex', '.studio-report'].includes(path.basename(current))
          && !(await fs.lstat(current)).isSymbolicLink()
      })
      return this.addProjectFromFolder(destinationPath, source.trusted ?? false)
    }

    const newId = uuidv4()
    const settings = this.data.settings.server
    const basePort = activePort || source.preferredPort || settings.defaultPort
    const occupiedPorts = new Set<number>([
      settings.defaultPort,
      ...(activePort ? [activePort] : []),
      ...this.data.projects.flatMap((project) => (project.preferredPort ? [project.preferredPort] : []))
    ])

    let clonePort: number | undefined
    for (let offset = 1; offset < 64512; offset += 1) {
      const candidate = 1024 + ((basePort - 1024 + offset) % 64512)
      if (occupiedPorts.has(candidate)) continue
      try {
        clonePort = await portAllocator.acquire(candidate, 0, true, newId)
        break
      } catch {
        // Try the next port; the allocator also accounts for running projects and other clones.
      }
    }
    if (!clonePort) throw new Error('Không tìm được cổng trống riêng cho bản sao.')

    const stagingPath = path.join(parentPath, `.${path.basename(destinationPath)}-${newId}.tmp`)
    let destinationCreated = false
    try {
      await fs.copy(sourcePath, stagingPath, {
        overwrite: false,
        errorOnExist: true,
        dereference: false,
        filter: async (currentPath) => {
          const relative = path.relative(sourcePath, currentPath)
          if (!relative) return true
          const segments = relative.split(path.sep)
          if (segments.includes('node_modules')) return false
          if (segments.includes('.git')) return false
          try {
            if ((await fs.lstat(currentPath)).isSymbolicLink()) return false
          } catch {
            return false
          }
          return true
        }
      })

      const validation = await this.validateSlidevFolder(stagingPath)
      if (!validation.valid) throw new Error(validation.reason || 'Bản sao không còn hợp lệ sau khi sao chép.')
      await fs.rename(stagingPath, destinationPath)
      destinationCreated = true

      const project: ProjectItem = {
        id: newId,
        name: path.basename(destinationPath),
        path: destinationPath,
        entryFiles: validation.entryFiles,
        gitUrl: null,
        lastOpenedAt: new Date().toISOString(),
        preferredPort: clonePort,
        trusted: source.trusted ?? false
      }
      this.data.projects.unshift(project)
      this.save()
      return project
    } catch (error) {
      await fs.remove(stagingPath).catch(() => undefined)
      if (destinationCreated) await fs.remove(destinationPath).catch(() => undefined)
      throw error
    } finally {
      portAllocator.release(clonePort, newId)
    }
  }
}

export const projectStore = new ProjectStore()
