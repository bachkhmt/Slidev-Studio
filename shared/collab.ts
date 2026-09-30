import type { ExportFormat, ExportOptions } from './settings'

export interface CollabSection {
  id: string
  file: string
  owner: string
}
export interface CollabManifest {
  title: string
  sections: CollabSection[]
  mainBranch: string
  branchPattern: string
  coordinator?: string
}
export interface CollabStatus {
  manifest: CollabManifest
  sectionId: string | null
  branch: string
  changedFiles: string[]
  forbiddenFiles: string[]
  conflicts: string[]
  merging: boolean
  ahead: number
  behindMain: number
  mergedSections: string[]
  pr?: { url: string; state: 'open' | 'merged' | 'closed' | 'changes_requested' }
  warning?: string
}
export interface GitHubAccount {
  login: string
  clientId: string
}
export interface DeviceLogin {
  userCode: string
  expiresAt: number
  interval: number
}
export interface CollaborationAPI {
  inspect: (projectId: string) => Promise<CollabStatus | null>
  selectSection: (projectId: string, sectionId: string) => Promise<CollabStatus>
  saveDraft: (projectId: string) => Promise<CollabStatus>
  sync: (projectId: string) => Promise<CollabStatus>
  submit: (projectId: string) => Promise<CollabStatus>
  previewEntry: (projectId: string, mode: 'section' | 'total') => Promise<string>
  resolveConflict: (projectId: string, file: string, choice: 'mine' | 'incoming') => Promise<CollabStatus>
  finishMerge: (projectId: string) => Promise<CollabStatus>
  abortMerge: (projectId: string) => Promise<CollabStatus>
  exportMain: (
    projectId: string,
    format: ExportFormat,
    options: ExportOptions
  ) => Promise<{ success: boolean; outputPath: string }>
  account: () => Promise<GitHubAccount | null>
  beginLogin: (clientId: string) => Promise<DeviceLogin>
  pollLogin: () => Promise<{ account?: GitHubAccount; pending?: boolean; interval?: number }>
  logout: () => Promise<void>
  openPr: (url: string) => Promise<void>
}

export function branchFor(manifest: CollabManifest, section: CollabSection): string {
  return manifest.branchPattern.split('{owner}').join(section.owner).split('{sectionId}').join(section.id)
}

export function isSectionFile(section: CollabSection, file: string): boolean {
  if (file.includes('\\') || file.split('/').some((part) => !part || part === '.' || part === '..')) return false
  return file === section.file || file.startsWith(`sections-assets/${section.id}/`)
}

export function parseManifest(input: unknown): CollabManifest {
  if (!input || typeof input !== 'object') throw new Error('Manifest cộng tác phải là một object JSON.')
  const value = input as Record<string, unknown>
  const validRef = (v: unknown): v is string =>
    typeof v === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9/_-]*$/.test(v) && !v.includes('//') && !v.endsWith('/')
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200)
    throw new Error('Manifest cần title (1–200 ký tự).')
  if (!validRef(value.mainBranch)) throw new Error('mainBranch không hợp lệ.')
  if (
    typeof value.branchPattern !== 'string' ||
    !value.branchPattern.includes('{owner}') ||
    !value.branchPattern.includes('{sectionId}')
  )
    throw new Error('branchPattern cần {owner} và {sectionId}.')
  if (!Array.isArray(value.sections) || !value.sections.length || value.sections.length > 100)
    throw new Error('Manifest cần 1–100 section.')
  const ids = new Set<string>()
  const files = new Set<string>()
  const sections = value.sections.map((item: unknown) => {
    if (!item || typeof item !== 'object') throw new Error('Section không hợp lệ.')
    const s = item as CollabSection
    if (typeof s.id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(s.id))
      throw new Error('ID section không hợp lệ.')
    if (
      typeof s.file !== 'string' ||
      !/^sections\/[a-zA-Z0-9][a-zA-Z0-9._-]*\.md$/.test(s.file) ||
      s.file.includes('..')
    )
      throw new Error('File section phải là sections/<tên>.md.')
    if (typeof s.owner !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(s.owner))
      throw new Error('owner phải là tên tài khoản GitHub.')
    if (ids.has(s.id.toLowerCase()) || files.has(s.file.toLowerCase()))
      throw new Error('ID hoặc file section bị trùng.')
    ids.add(s.id.toLowerCase())
    files.add(s.file.toLowerCase())
    return { id: s.id, file: s.file, owner: s.owner }
  })
  const manifest: CollabManifest = {
    title: value.title.trim(),
    mainBranch: value.mainBranch,
    branchPattern: value.branchPattern,
    sections
  }
  if (value.coordinator !== undefined) {
    if (typeof value.coordinator !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(value.coordinator))
      throw new Error('coordinator phải là tài khoản GitHub.')
    manifest.coordinator = value.coordinator
  }
  if (
    sections.some(
      (section) => !validRef(branchFor(manifest, section)) || branchFor(manifest, section) === manifest.mainBranch
    )
  )
    throw new Error('Tên nhánh section không hợp lệ hoặc trùng nhánh tổng.')
  return manifest
}
