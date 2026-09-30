import fs from 'fs-extra'
import path from 'path'
import { fileURLToPath } from 'url'
import { execa } from 'execa'
import type { BrowserWindow } from 'electron'
import { projectStore, ProjectItem } from './projectStore'
import { buildEnv } from '../utils/env'
import { installQueue } from './installQueue'
import { parse } from 'yaml'
import { renderTemplate } from './templateRender'
import { parseManifest } from '../../shared/collab'

const __filename = typeof import.meta.filename === 'string' ? import.meta.filename : fileURLToPath(import.meta.url)
const __dirname = typeof import.meta.dirname === 'string' ? import.meta.dirname : path.dirname(__filename)

function getCustomThemePackage(theme: string): string {
  if (theme.startsWith('@') || theme.startsWith('slidev-theme-')) return theme
  return ['default', 'seriph', 'apple-basic', 'bricks', 'shibainu'].includes(theme)
    ? `@slidev/theme-${theme}`
    : `slidev-theme-${theme}`
}

export interface TemplateInfo {
  id: string
  name: string
  description: string
  theme: string
  themeRange?: string
}

export const BUNDLED_TEMPLATES: TemplateInfo[] = [
  {
    id: 'default',
    name: 'Default Theme',
    description: 'Chủ đề mặc định của Slidev, tối giản, cân đối và linh hoạt',
    theme: 'default',
    themeRange: '^0.25.0'
  },
  { id: 'git-collab', name: 'Cộng tác theo section', description: 'Ba phần riêng, phân công GitHub, lưu nháp và gửi bài cho điều phối duyệt', theme: 'default', themeRange: '0.25.0' },
  {
    id: 'frankfurt-academic',
    name: 'Frankfurt Academic',
    description: 'Chủ đề học thuật chuẩn Beamer/Frankfurt (phù hợp báo cáo NCKH, chuyên đề)',
    theme: 'frankfurt',
    themeRange: '^1.1.0'
  },
  {
    id: 'seriph',
    name: 'Seriph (Editorial)',
    description: 'Phong cách tạp chí, phông chữ serif trang nhã, hình ảnh ấn tượng',
    theme: 'seriph',
    themeRange: '^0.25.0'
  },
  {
    id: 'bricks',
    name: 'Bricks Grid',
    description: 'Bố cục dạng thẻ/khối hiện đại, phù hợp bài giảng công nghệ & workshop',
    theme: 'bricks',
    themeRange: '^0.25.0'
  },
  {
    id: 'apple-basic',
    name: 'Apple Basic',
    description: 'Phong cách Keynote tối giản với nền sáng và nhiều khoảng trắng',
    theme: 'apple-basic',
    themeRange: '^0.25.1'
  },
  {
    id: 'shibainu',
    name: 'Shibainu',
    description: 'Theme vui nhộn với bảng màu pastel, do Slidev chính thức phát hành',
    theme: 'shibainu',
    themeRange: '^0.25.0'
  },
  {
    id: 'penguin',
    name: 'Penguin',
    description: 'Theme cộng đồng phong cách sáng tạo, phù hợp bài thuyết trình kỹ thuật',
    theme: 'penguin',
    themeRange: '^2.3.1'
  },
  {
    id: 'dracula',
    name: 'Dracula',
    description: 'Theme cộng đồng nền tối với bảng màu Dracula quen thuộc',
    theme: 'dracula',
    themeRange: '^0.2.5'
  },
  {
    id: 'hcmut-bach',
    name: 'HCMUT Bách Khoa',
    description: 'Phong cách học thuật HCMUT, chuyển thể từ Beamer với thanh section và footline riêng',
    theme: 'hcmut-bach'
  }
]

export class Scaffolder {
  private getTemplatesDir(): string {
    // 1. Check process.resourcesPath when packaged
    if (process.resourcesPath) {
      const resPath = path.join(process.resourcesPath, 'templates')
      if (fs.existsSync(resPath)) return resPath
    }

    // 2. Direct path from __dirname in electron/services/
    const devPath = path.resolve(__dirname, '..', 'templates')
    if (fs.existsSync(devPath)) return devPath

    // 3. Direct path from cwd
    const cwdPath = path.resolve(process.cwd(), 'electron', 'templates')
    if (fs.existsSync(cwdPath)) return cwdPath

    // 4. Fallback in app directory
    const appDir = path.resolve(__dirname, '..')
    const outTemplates = path.join(appDir, 'templates')
    if (fs.existsSync(outTemplates)) return outTemplates

    return devPath
  }

  public listTemplates(): TemplateInfo[] {
    return BUNDLED_TEMPLATES
  }

  public async createProject(
    options: {
      name: string
      targetDir: string
      templateId: string
      title: string
      author: string
      customTheme?: string
      collabOwners?: string[]
      collabCoordinator?: string
    },
    win?: BrowserWindow | null
  ): Promise<ProjectItem> {
    const { name, targetDir, templateId, title, author } = options
    const customTheme = options.customTheme?.trim()
    let collabManifest: ReturnType<typeof parseManifest> | undefined
    if (templateId === 'git-collab') {
      if (!options.collabOwners || options.collabOwners.length !== 3) throw new Error('Nhập tài khoản GitHub cho ba section.')
      collabManifest = parseManifest({ title: title || name, coordinator: options.collabCoordinator, mainBranch: 'main', branchPattern: 'feature/{owner}-{sectionId}', sections: ['01-intro', '02-analysis', '03-demo'].map((id, i) => ({ id, file: `sections/${id}.md`, owner: options.collabOwners![i] })) })
      if (!collabManifest.coordinator) throw new Error('Nhập tài khoản GitHub của điều phối.')
      try { await execa('git', ['--version']) }
      catch { throw new Error('Cần cài Git trên máy trước khi tạo dự án cộng tác.') }
    }
    const cleanDisplayText = (value: string, label: string, fallback: string): string => {
      const cleaned = (value || fallback).replace(/[\r\n\u0000-\u001f\u007f]/g, '').trim()
      if (cleaned.length > 200) throw new Error(`${label} không được dài quá 200 ký tự.`)
      return cleaned
    }
    const safeTitle = cleanDisplayText(title, 'Tiêu đề', name)
    const safeAuthor = cleanDisplayText(author, 'Tác giả', 'Slidev Author')

    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name)) {
      throw new Error('Tên dự án chỉ được gồm chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới (tối đa 64 ký tự).')
    }

    if (customTheme && (!/^[\w@./-]{1,120}$/.test(customTheme) || customTheme.startsWith('/') || customTheme.includes('..'))) {
      throw new Error('Tên theme chỉ được chứa chữ, số, dấu chấm, gạch ngang, gạch dưới và dấu /')
    }

    const emitLog = (msg: string): void => {
      if (win && !win.isDestroyed()) {
        win.webContents.send('scaffold:log', msg)
      }
    }

    emitLog(`[Tạo Project] Bắt đầu khởi tạo dự án "${name}"...`)

    const templatesRoot = this.getTemplatesDir()
    if (!BUNDLED_TEMPLATES.some((template) => template.id === templateId)) {
      throw new Error('Mẫu dự án không hợp lệ')
    }
    const templateDir = path.join(templatesRoot, templateId)
    if (!fs.existsSync(templateDir)) {
      throw new Error(`Không tìm thấy mẫu template "${templateId}" tại ${templateDir}`)
    }

    if (!fs.existsSync(targetDir)) {
      await fs.mkdirp(targetDir)
    }

    const resolvedTargetDir = path.resolve(targetDir)
    const projectPath = path.resolve(resolvedTargetDir, name)
    const relativeProjectPath = path.relative(resolvedTargetDir, projectPath)
    if (!relativeProjectPath || relativeProjectPath.startsWith(`..${path.sep}`) || relativeProjectPath === '..' || path.isAbsolute(relativeProjectPath)) {
      throw new Error('Tên dự án nằm ngoài thư mục đích đã chọn.')
    }
    if (fs.existsSync(projectPath)) {
      throw new Error(`Thư mục "${projectPath}" đã tồn tại. Vui lòng chọn tên khác!`)
    }

    emitLog(`[Tạo Project] Sao chép cấu trúc từ mẫu ${templateId}...`)
    await fs.copy(templateDir, projectPath, {
      filter: (src) => {
        const relative = path.relative(templateDir, src).replace(/\\/g, '/')
        if (['node_modules', '.git'].includes(path.basename(src))) return false
        if (templateId === 'hcmut-bach' && /^(?:starter|scripts)(?:\/|$)|^(?:example\.md|README\.md)$|^theme\/(?:README|CHANGELOG)\.md$/i.test(relative)) return false
        return true
      }
    })

    // Ensure public folder
    await fs.mkdirp(path.join(projectPath, 'public'))

    const slug = name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
    const now = new Date()
    const today = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`

    // Process package.json
    const pkgPath = path.join(projectPath, 'package.json')
    if (fs.existsSync(pkgPath)) {
      let pkgContent = await fs.readFile(pkgPath, 'utf8')
      pkgContent = pkgContent.replace(/\{\{SLUG\}\}/g, slug)
      await fs.writeFile(pkgPath, pkgContent, 'utf8')
    }

    if (fs.existsSync(pkgPath)) {
      const packageJson = await fs.readJson(pkgPath)
      packageJson.dependencies = packageJson.dependencies || {}
      packageJson.devDependencies = packageJson.devDependencies || {}
      packageJson.dependencies['@slidev/cli'] = templateId === 'git-collab' ? '53.0.0' : projectStore.getSettings().projects.defaultCliRange || '^53.0.0'
      delete packageJson.devDependencies['@slidev/cli']
      const templateInfo = BUNDLED_TEMPLATES.find((template) => template.id === templateId)
      if (templateInfo?.themeRange) {
        const defaultThemePackage = templateInfo.theme === 'frankfurt' ? 'slidev-theme-frankfurt'
          : ['penguin', 'dracula'].includes(templateInfo.theme) ? `slidev-theme-${templateInfo.theme}`
            : `@slidev/theme-${templateInfo.theme}`
        for (const section of [packageJson.dependencies, packageJson.devDependencies]) {
          if (section?.[defaultThemePackage]) section[defaultThemePackage] = templateInfo.themeRange
        }
      }
      if (customTheme) {
        if (customTheme !== 'default') delete packageJson.dependencies['@slidev/theme-default']
        packageJson.dependencies[getCustomThemePackage(customTheme)] = 'latest'
      }
      await fs.writeJson(pkgPath, packageJson, { spaces: 2 })
      if (customTheme) emitLog(`[Tạo Project] Đã thêm theme ${getCustomThemePackage(customTheme)} vào dependencies.`)
    }

    // Process slides.md
    const slidesPath = path.join(projectPath, 'slides.md')
    if (fs.existsSync(slidesPath)) {
      let slidesContent = await fs.readFile(slidesPath, 'utf8')
      slidesContent = renderTemplate(slidesContent, { title: safeTitle, author: safeAuthor, date: today })
      if (customTheme) {
        const serializedTheme = JSON.stringify(customTheme)
        slidesContent = slidesContent.replace(/^(---\r?\n)([\s\S]*?)(\r?\n---)/, (_match, opening, frontmatter, closing) => {
          const updatedFrontmatter = /^theme\s*:/m.test(frontmatter)
            ? frontmatter.replace(/^theme\s*:.*$/m, `theme: ${serializedTheme}`)
            : `theme: ${serializedTheme}\n${frontmatter}`
          return `${opening}${updatedFrontmatter}${closing}`
        })
      }
      await fs.writeFile(slidesPath, slidesContent, 'utf8')
      try {
        const frontmatter = slidesContent.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
        if (frontmatter) parse(frontmatter[1])
      } catch (error) {
        await fs.remove(projectPath)
        throw new Error(`Tiêu đề hoặc tác giả chứa ký tự không hợp lệ cho YAML: ${(error as Error).message}`)
      }
    }

    if (collabManifest) {
      collabManifest.title = safeTitle
      await fs.writeJson(path.join(projectPath, 'slidev-collab.json'), collabManifest, { spaces: 2 })
      const owners = [`* @${collabManifest.coordinator}`, ...collabManifest.sections.flatMap((s) => [`/${s.file} @${s.owner} @${collabManifest.coordinator}`, `/sections-assets/${s.id}/ @${s.owner} @${collabManifest.coordinator}`]), `/.github/ @${collabManifest.coordinator}`]
      await fs.outputFile(path.join(projectPath, '.github/CODEOWNERS'), owners.join('\n') + '\n')
    }
    const settings = projectStore.getSettings()
    if (settings.projects.gitInitOnCreate || collabManifest) {
      try {
        await execa('git', collabManifest ? ['init', '-b', 'main'] : ['init'], { cwd: projectPath })
        emitLog('[Tạo Project] Đã khởi tạo Git repository.')
      } catch (error: any) {
        emitLog(`[Cảnh báo] Không thể khởi tạo Git: ${error.message}`)
      }
    }
    if (!settings.server.autoInstallDeps) {
      emitLog('[Tạo Project] Bỏ qua cài dependencies theo cài đặt. Có thể chạy package manager install trong terminal sau.')
    } else {
    emitLog(`[Tạo Project] Đang chạy "${settings.server.packageManager} install" để cài đặt thư viện cần thiết...`)
    try {
      const installArgs = ['install']
      if (settings.server.registry) installArgs.push('--registry', settings.server.registry)
      const res = await installQueue.run(`scaffold:${projectPath}`, async () => {
        const installProc = execa(settings.server.packageManager, installArgs, {
          cwd: projectPath,
          env: buildEnv(settings),
          buffer: false,
          stdin: 'ignore',
          reject: false
        })
        installProc.stdout?.on('data', (data) => emitLog(data.toString().trim()))
        installProc.stderr?.on('data', (data) => emitLog(data.toString().trim()))
        return installProc
      })
      if (res.exitCode !== 0) {
        emitLog(`[Cảnh báo] ${settings.server.packageManager} install kết thúc với mã ${res.exitCode}. Bạn vẫn có thể tiếp tục.`)
      } else {
        emitLog(`[Tạo Project] Cài đặt dependencies thành công!`)
      }
    } catch (err: any) {
      emitLog(`[Lỗi cài đặt] ${err.message}`)
    }
    }

    if (collabManifest) {
      try {
        const { githubService } = await import('./collabRuntime')
        const { CollabGit } = await import('./collabGit')
        const credentials = await githubService.getCredentials()
        const git = new CollabGit(projectPath, credentials)
        await git.run(['add', '--', '.'])
        if (credentials) await git.commitIndex('Khởi tạo bài thuyết trình cộng tác')
        else await git.run(['-c', 'user.name=Slidev Studio', '-c', 'user.email=slidev-studio@localhost', '-c', 'commit.gpgsign=false', 'commit', '-m', 'Khởi tạo bài thuyết trình cộng tác'])
      } catch {
        emitLog('[Cộng tác] Cần đăng nhập GitHub hoặc cấu hình tên/email Git để tạo bản đầu tiên. Xem hướng dẫn trong README.md của dự án.')
      }
    }
    // Register into project store
    const newProject = await projectStore.addProjectFromFolder(projectPath, true)
    emitLog(`[Tạo Project] Hoàn tất! Đang chuyển hướng vào workspace...`)
    return newProject
  }
}

export const scaffolder = new Scaffolder()
