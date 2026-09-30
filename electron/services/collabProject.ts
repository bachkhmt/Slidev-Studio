import fs from 'fs-extra'
import path from 'path'
import { parse, stringify } from 'yaml'
import { parseManifest, type CollabManifest, type CollabSection } from '../../shared/collab'
import { canonicalPath } from '../utils/path'
import { atomicWriteFile } from '../utils/atomicWrite'

export function projectFile(root: string, file: string): string {
  const target = path.resolve(root, file)
  const relative = path.relative(canonicalPath(root), canonicalPath(target))
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
    throw new Error('File cộng tác nằm ngoài dự án (có thể qua liên kết).')
  return target
}

export async function readCollabManifest(root: string): Promise<CollabManifest | null> {
  const file = projectFile(root, 'slidev-collab.json')
  if (!(await fs.pathExists(file))) return null
  const manifest = parseManifest(await fs.readJson(file))
  if (!(await fs.pathExists(projectFile(root, 'slides.md')))) throw new Error('Dự án cộng tác thiếu slides.md.')
  for (const section of manifest.sections) {
    if (!(await fs.pathExists(projectFile(root, section.file)))) throw new Error(`Không tìm thấy ${section.file}.`)
  }
  return manifest
}

export const GLOBAL_SECTION_KEYS = [
  'theme',
  'title',
  'fonts',
  'addons',
  'defaults',
  'css',
  'mdc',
  'highlighter',
  'vite',
  'drawings',
  'routerMode',
  'download',
  'export',
  'colorSchema',
  'aspectRatio',
  'canvasWidth'
]

export function validateSectionMarkdown(text: string): void {
  const head = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!head) return
  const data = parse(head[1]) || {}
  for (const key of GLOBAL_SECTION_KEYS) {
    if (key in data) throw new Error(`Cấu hình ${key} phải đặt ở slides.md, không đặt trong section.`)
  }
}

export async function ensureSectionPreview(root: string, section: CollabSection): Promise<string> {
  const entryText = await fs.readFile(projectFile(root, 'slides.md'), 'utf8')
  const head = entryText.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  const config = head ? parse(head[1]) || {} : {}
  // Slidev resolves the project root from the entry. Keep generated wrappers at
  // the repository root so setup/, local themes, public/ and components/ work.
  delete config.src
  delete config.layout
  config.title = `Preview — ${section.id}`
  config.hide = true
  const entry = `.slidev-collab-${section.id}.md`
  const text = `---\n${stringify(config)}---\n\n<!-- Preview tự sinh, không chỉnh sửa -->\n\n---\nsrc: ./${section.file}\n---\n`
  const target = projectFile(root, entry)
  if (!(await fs.pathExists(target)) || (await fs.readFile(target, 'utf8')) !== text)
    await atomicWriteFile(target, text)
  return entry
}
