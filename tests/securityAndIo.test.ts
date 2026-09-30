import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { atomicWriteFile } from '../electron/utils/atomicWrite'
import { validateGitUrl } from '../electron/utils/gitUrl'
import { validateSettingsImportFields } from '../electron/utils/settingsImportValidation'

const tempDirs: string[] = []
function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slidev-sec-test-'))
  tempDirs.push(dir)
  return dir
}
afterEach(() => { for (const dir of tempDirs.splice(0)) fs.removeSync(dir) })

describe('validateGitUrl', () => {
  it.each(['https://github.com/a/b', 'ssh://git@github.com/a/b.git', 'git@github.com:a/b.git'])('accepts %s', (url) => {
    expect(validateGitUrl(url)).toBe(true)
  })
  it.each(['', '--upload-pack=x', 'ext::sh -c id', 'file:///etc/passwd', 'http://github.com/a/b', 'https://github.com/a/b with-space'])('rejects %s', (url) => {
    expect(validateGitUrl(url)).toBe(false)
  })
})

describe('validateSettingsImportFields', () => {
  it('keeps valid settings and drops unsafe or missing paths with warnings', () => {
    const root = tempDir()
    const nodeDir = path.join(root, 'node-bin')
    const outputDir = path.join(root, 'export')
    fs.ensureDirSync(nodeDir)
    fs.writeFileSync(path.join(nodeDir, process.platform === 'win32' ? 'node.exe' : 'node'), '')
    fs.ensureDirSync(outputDir)
    const input = {
      system: { nodePathOverride: nodeDir },
      server: { registry: 'https://registry.npmjs.org', extraArgs: '--log info' },
      export: { outputDir }
    }
    const valid = validateSettingsImportFields(input, root)
    expect(valid.settings).toEqual(input)
    expect(valid.warnings).toEqual([])

    const invalid = validateSettingsImportFields({
      system: { nodePathOverride: path.join(root, 'missing') },
      server: { registry: 'http://registry.example', extraArgs: `--bad\n${'x'.repeat(250)}` },
      export: { outputDir: path.join(root, 'not-created') }
    }, root)
    expect(invalid.settings).toEqual({ system: {}, server: {}, export: {} })
    expect(invalid.warnings).toHaveLength(4)
  })
})

describe('atomicWriteFile', () => {
  it('serializes 20 concurrent writes and leaves no temporary files', async () => {
    const root = tempDir()
    const target = path.join(root, 'nested', 'slides.md')
    await Promise.all(Array.from({ length: 20 }, (_, i) => atomicWriteFile(target, `content-${i}`)))
    expect(await fs.readFile(target, 'utf8')).toBe('content-19')
    expect((await fs.readdir(path.dirname(target))).filter((name) => name.endsWith('.tmp'))).toEqual([])
  })
})
