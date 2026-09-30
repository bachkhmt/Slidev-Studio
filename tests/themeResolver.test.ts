import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { checkThemeInstalled, isEngineCompatible, readTheme, themePackageName } from '../electron/utils/themeResolver'

const tempDirs: string[] = []
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slidev-theme-test-'))
  tempDirs.push(dir)
  return dir
}
afterEach(() => { for (const dir of tempDirs.splice(0)) fs.removeSync(dir) })

describe('themeResolver', () => {
  it('reads theme from YAML headmatter', () => {
    expect(readTheme('---\ntheme: seriph\ntitle: Deck\n---\n# Slide')).toBe('seriph')
    expect(readTheme('# no frontmatter')).toBeUndefined()
  })

  it.each([
    ['none', { kind: 'none' }],
    ['default', { kind: 'package', name: '@slidev/theme-default' }],
    ['seriph', { kind: 'package', name: '@slidev/theme-seriph' }],
    ['apple-basic', { kind: 'package', name: '@slidev/theme-apple-basic' }],
    ['bricks', { kind: 'package', name: '@slidev/theme-bricks' }],
    ['shibainu', { kind: 'package', name: '@slidev/theme-shibainu' }],
    ['penguin', { kind: 'package', name: 'slidev-theme-penguin' }],
    ['@scope/slidev-theme-custom', { kind: 'package', name: '@scope/slidev-theme-custom' }],
    ['./theme', { kind: 'path', path: './theme' }],
    ['C:\\slides\\theme', { kind: 'path', path: 'C:\\slides\\theme' }]
  ])('resolves %s', (value, expected) => {
    expect(themePackageName(value)).toEqual(expected)
  })

  it('checks local package install manifests and path themes', () => {
    const project = tempDir()
    const packageDir = path.join(project, 'node_modules', 'slidev-theme-local')
    fs.ensureDirSync(packageDir)
    fs.writeJsonSync(path.join(packageDir, 'package.json'), { version: '1.2.3', engines: { slidev: '^53.0.0' } })
    fs.ensureDirSync(path.join(project, 'theme'))
    expect(checkThemeInstalled(project, { kind: 'package', name: 'slidev-theme-local' })).toEqual({ ok: true, version: '1.2.3', engine: '^53.0.0' })
    expect(checkThemeInstalled(project, { kind: 'package', name: 'slidev-theme-missing' })).toEqual({ ok: false, reason: 'missing' })
    expect(checkThemeInstalled(project, { kind: 'path', path: './theme' })).toEqual({ ok: true })
    expect(checkThemeInstalled(project, { kind: 'path', path: './missing' })).toEqual({ ok: false, reason: 'path-missing' })
  })

  it('checks theme engine ranges against the installed CLI version', () => {
    expect(isEngineCompatible('^53.0.0', '53.2.1')).toBe(true)
    expect(isEngineCompatible('>=52.0.0', '53.0.0')).toBe(true)
    expect(isEngineCompatible('^54.0.0', '53.0.0')).toBe(false)
    expect(isEngineCompatible(undefined, 'not-installed')).toBe(true)
  })
})
