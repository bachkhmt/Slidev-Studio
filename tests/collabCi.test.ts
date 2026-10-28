import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { execa } from 'execa'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const script = path.resolve('electron/templates/git-collab/.github/scripts/check-scope.mjs')
let root: string
let base: string
const run = async (args: string[]) => (await execa('git', args, { cwd: root })).stdout
const policy = async (author = 'alice') =>
  execa('node', [script], {
    cwd: root,
    env: { BASE_SHA: base, HEAD_SHA: await run(['rev-parse', 'HEAD']), PR_AUTHOR: author }
  })
const commit = async () => {
  await run(['add', '.'])
  await run(['commit', '-m', 'contribution'])
}
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'slidev-policy-test-'))
  const gitConfig = path.join(root, 'empty.gitconfig')
  await fs.writeFile(gitConfig, '')
  vi.stubEnv('GIT_CONFIG_NOSYSTEM', '1')
  vi.stubEnv('GIT_CONFIG_GLOBAL', gitConfig)
  await run(['init', '-b', 'main'])
  await run(['config', 'user.name', 'Test'])
  await run(['config', 'user.email', 'test@example.com'])
  await run(['config', 'core.autocrlf', 'false'])
  await run(['config', 'commit.gpgsign', 'false'])
  await fs.writeJson(path.join(root, 'slidev-collab.json'), {
    coordinator: 'leader',
    sections: [
      { id: '01-intro', file: 'sections/01-intro.md', owner: 'alice' },
      { id: '02-analysis', file: 'sections/02-analysis.md', owner: 'bob' }
    ]
  })
  await fs.outputFile(path.join(root, 'sections/01-intro.md'), '# Intro\n')
  await fs.outputFile(path.join(root, 'sections/02-analysis.md'), '# Analysis\n')
  await fs.writeFile(path.join(root, 'slides.md'), '# Total\n')
  await commit()
  base = await run(['rev-parse', 'HEAD'])
})
afterEach(async () => {
  vi.unstubAllEnvs()
  await fs.remove(root)
})

describe('trusted CI ownership policy', () => {
  it('allows assigned section and its own assets', async () => {
    await fs.writeFile(path.join(root, 'sections/01-intro.md'), '# Intro updated\n')
    await fs.outputFile(path.join(root, 'sections-assets/01-intro/logo.svg'), '<svg/>')
    await commit()
    expect((await policy()).stdout).toContain('Phạm vi hợp lệ')
  })
  it('cannot bypass scope by changing the submitted manifest', async () => {
    const file = path.join(root, 'slidev-collab.json')
    const modified = await fs.readJson(file)
    modified.sections[1].owner = 'alice'
    await fs.writeJson(file, modified)
    await fs.writeFile(path.join(root, 'sections/02-analysis.md'), '# Changed other section\n')
    await commit()
    await expect(policy()).rejects.toThrow(/Sửa ngoài phần phân công/)
  })
  it('checks both ends of renames and rejects symbolic links', async () => {
    await run(['mv', 'sections/01-intro.md', 'sections/02-new.md'])
    await commit()
    await expect(policy()).rejects.toThrow(/Sửa ngoài phần phân công/)
    await run(['reset', '--hard', base])
    await fs.ensureDir(path.join(root, 'sections-assets/01-intro'))
    const blob = (await execa('git', ['hash-object', '-w', '--stdin'], { cwd: root, input: '/etc/passwd' })).stdout
    await run(['update-index', '--add', '--cacheinfo', `120000,${blob},sections-assets/01-intro/secret`])
    await run(['commit', '-m', 'symlink contribution'])
    await expect(policy()).rejects.toThrow(/symlink/)
  })
  it('allows coordinator structure changes but still rejects section globals', async () => {
    await fs.writeFile(path.join(root, 'slides.md'), '# Reordered total\n')
    await commit()
    expect((await policy('leader')).stdout).toContain('Phạm vi hợp lệ')
    await fs.writeFile(path.join(root, 'sections/01-intro.md'), '---\ntheme: seriph\n---\n# Theme misuse\n')
    await commit()
    await expect(policy('leader')).rejects.toThrow(/Cấu hình toàn cục/)
  })
})
