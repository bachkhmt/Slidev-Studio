import fs from 'fs-extra'
import path from 'path'
import { parse } from 'yaml'
import semver from 'semver'

export type ResolvedTheme = { kind: 'package'; name: string } | { kind: 'path'; path: string } | { kind: 'none' }

export function readTheme(entryText: string): string | undefined {
  const match = entryText.replace(/^\uFEFF/, '').match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return undefined
  const frontmatter = parse(match[1]) as Record<string, unknown> | null
  return typeof frontmatter?.theme === 'string' ? frontmatter.theme.trim() : undefined
}

export function themePackageName(theme: string): ResolvedTheme {
  const value = theme.trim()
  if (!value || value === 'none') return { kind: 'none' }
  if (value.startsWith('.') || value.startsWith('/') || /^[a-z]:[\\/]/i.test(value)) return { kind: 'path', path: value }
  if (value.startsWith('@')) {
    if (!/^@[A-Za-z0-9._-]+\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) throw new Error(`Tên theme không hợp lệ: ${value}`)
    return { kind: 'package', name: value }
  }
  if (value.startsWith('slidev-theme-')) {
    if (!/^slidev-theme-[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) throw new Error(`Tên theme không hợp lệ: ${value}`)
    return { kind: 'package', name: value }
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) throw new Error(`Tên theme không hợp lệ: ${value}`)
  if (['default', 'seriph', 'apple-basic', 'bricks', 'shibainu'].includes(value)) return { kind: 'package', name: `@slidev/theme-${value}` }
  return { kind: 'package', name: `slidev-theme-${value}` }
}

export function checkThemeInstalled(projectPath: string, resolved: ResolvedTheme): { ok: true; version?: string; engine?: string } | { ok: false; reason: 'missing' | 'path-missing' } {
  if (resolved.kind === 'none') return { ok: true }
  if (resolved.kind === 'path') {
    const themePath = path.resolve(projectPath, resolved.path)
    if (!fs.existsSync(themePath) || !fs.statSync(themePath).isDirectory()) return { ok: false, reason: 'path-missing' }
    const manifestPath = path.join(themePath, 'package.json')
    if (!fs.existsSync(manifestPath)) return { ok: true }
    try {
      const manifest = fs.readJsonSync(manifestPath)
      return { ok: true, ...(typeof manifest.version === 'string' ? { version: manifest.version } : {}), ...(typeof manifest.engines?.slidev === 'string' ? { engine: manifest.engines.slidev } : {}) }
    } catch {
      return { ok: true }
    }
  }
  const manifestPath = path.join(projectPath, 'node_modules', ...resolved.name.split('/'), 'package.json')
  if (!fs.existsSync(manifestPath)) return { ok: false, reason: 'missing' }
  try {
    const manifest = fs.readJsonSync(manifestPath)
    return { ok: true, ...(typeof manifest.version === 'string' ? { version: manifest.version } : {}), ...(typeof manifest.engines?.slidev === 'string' ? { engine: manifest.engines.slidev } : {}) }
  } catch {
    return { ok: false, reason: 'missing' }
  }
}

export function isEngineCompatible(engineRange: string | undefined, cliVersion: string): boolean {
  if (!engineRange) return true
  const normalizedVersion = semver.valid(cliVersion) || semver.coerce(cliVersion)?.version
  if (!normalizedVersion) return false
  try { return semver.satisfies(normalizedVersion, engineRange, { includePrerelease: true }) } catch { return false }
}
