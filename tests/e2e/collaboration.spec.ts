import { test, expect } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import http from 'node:http'
import { pathToFileURL } from 'node:url'
import { execa } from 'execa'
// @ts-expect-error shared ESM fixture
import { launchFixture } from '../../scripts/desktop-fixture.mjs'

test('team UI selects, drafts, submits, syncs and resolves conflicts without editing another section', async () => {
  const f = await launchFixture({ offline: true })
  const root = f.projects[0].path
  const git = async (dir: string, args: string[]) =>
    (
      await execa(
        'git',
        ['-c', 'core.autocrlf=false', '-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', ...args],
        { cwd: dir, env: f.gitEnv }
      )
    ).stdout
  const identity = async (dir: string) => {
    await git(dir, ['config', 'user.name', 'Alice Fixture'])
    await git(dir, ['config', 'user.email', 'alice@fixture.invalid'])
    await git(dir, ['config', 'core.autocrlf', 'false'])
    await git(dir, ['config', 'commit.gpgsign', 'false'])
  }
  const server = http.createServer(async (req, res) => {
    try {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const input = Buffer.concat(chunks),
        url = new URL(req.url!, 'http://localhost')
      const result = await execa('git', ['http-backend'], {
        encoding: 'buffer',
        input,
        env: {
          GIT_PROJECT_ROOT: f.root,
          GIT_HTTP_EXPORT_ALL: '1',
          REQUEST_METHOD: req.method!,
          PATH_INFO: decodeURIComponent(url.pathname),
          QUERY_STRING: url.search.slice(1),
          CONTENT_TYPE: req.headers['content-type'] || '',
          CONTENT_LENGTH: String(input.length),
          REMOTE_USER: 'fixture'
        }
      })
      const split = result.stdout.indexOf('\r\n\r\n')
      for (const header of result.stdout.subarray(0, split).toString().split('\r\n')) {
        const colon = header.indexOf(':')
        if (colon > 0) {
          const name = header.slice(0, colon),
            value = header.slice(colon + 1).trim()
          if (name.toLowerCase() === 'status') res.statusCode = Number(value.split(' ')[0])
          else res.setHeader(name, value)
        }
      }
      res.end(result.stdout.subarray(split + 4))
    } catch (error) {
      res.statusCode = 500
      res.end(String(error))
    }
  })
  try {
    await fs.mkdir(path.join(root, 'sections'))
    await fs.writeFile(path.join(root, 'sections/01-intro.md'), '# Intro\n\nOriginal\n')
    await fs.writeFile(path.join(root, 'sections/02-analysis.md'), '# Analysis\n')
    await fs.writeFile(
      path.join(root, 'slides.md'),
      '---\ntheme: default\nfonts:\n  provider: none\n---\n# Team\n\n---\nsrc: ./sections/01-intro.md\n---\n\n---\nsrc: ./sections/02-analysis.md\n---\n'
    )
    await fs.writeFile(
      path.join(root, 'slidev-collab.json'),
      JSON.stringify({
        title: 'Team fixture',
        coordinator: 'leader',
        mainBranch: 'main',
        branchPattern: 'feature/{owner}-{sectionId}',
        sections: [
          { id: '01-intro', file: 'sections/01-intro.md', owner: 'alice' },
          { id: '02-analysis', file: 'sections/02-analysis.md', owner: 'bob' }
        ]
      })
    )
    await fs.writeFile(path.join(root, '.gitignore'), 'node_modules/\nexport/\n.slidev-collab-*.md\n')
    await git(root, ['init', '-b', 'main'])
    await identity(root)
    await git(root, ['add', '.'])
    await git(root, ['commit', '-m', 'Initial team fixture'])
    const bare = path.join(f.root, 'team.git')
    await git(f.root, ['clone', '--bare', root, bare])
    await git(bare, ['config', 'http.receivepack', 'true'])
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const remote = `http://127.0.0.1:${(server.address() as any).port}/team.git`
    await git(root, ['remote', 'add', 'origin', remote])
    const runtime = (await fs.readdir('out/main/chunks')).find((name) => name.startsWith('collabRuntime-'))!
    await f.app.evaluate(
      async (_electron: any, url: string) => {
        const { githubService } = await (globalThis as any).__studioTestImport(url)
        githubService.account = async () => ({ login: 'alice', clientId: 'fixture' })
        githubService.getCredentials = async () => undefined
        githubService.findPr = async () => undefined
        githubService.submitPr = async (...args: any[]) => {
          ;(globalThis as any).__teamSubmission = args
          return { url: 'https://github.com/fixture/team/pull/1', state: 'open' }
        }
      },
      pathToFileURL(path.resolve('out/main/chunks', runtime)).href
    )
    await f.page.evaluate(() => window.api.settings.update({ editor: { autoSave: 'off' } }))
    await f.page.getByRole('heading', { name: 'slides-30', exact: true }).click()
    const select = f.page.getByRole('combobox', { name: 'Phần phụ trách' })
    await expect(select).toBeEnabled()
    await select.selectOption('01-intro')
    await expect(f.page.getByRole('button', { name: 'Lưu nháp', exact: true })).toBeEnabled()
    await expect.poll(() => git(root, ['branch', '--show-current'])).toBe('feature/alice-01-intro')
    await expect(f.page.locator('.monaco-editor')).toBeVisible()
    const type = async (text: string, replace = false) => {
      await f.page.locator('.monaco-editor').click({ position: { x: 160, y: 100 } })
      await f.page.keyboard.press(replace ? 'Control+a' : 'Control+End')
      await f.page.keyboard.type(text)
    }
    await type('\nDraft from Alice')
    await f.page.getByRole('button', { name: 'Lưu nháp', exact: true }).click()
    await expect(f.page.getByText('Đã lưu nháp trên máy.', { exact: true })).toBeVisible()
    expect(await git(root, ['status', '--porcelain'])).toBe('')
    expect(
      await f.page.evaluate(
        (file: string) =>
          window.api.fs.writeFile(file, 'forbidden').then(
            () => false,
            () => true
          ),
        path.join(root, 'sections/02-analysis.md')
      )
    ).toBe(true)
    await f.page.getByRole('button', { name: 'Gửi bài', exact: true }).click()
    await expect(f.page.getByText('Đã gửi bài, chờ điều phối duyệt.', { exact: true })).toBeVisible()
    expect(await f.app.evaluate(() => (globalThis as any).__teamSubmission.slice(1, 3))).toEqual([
      'feature/alice-01-intro',
      'main'
    ])
    const leader = path.join(f.root, 'leader')
    await git(f.root, ['clone', remote, leader])
    await identity(leader)
    await fs.writeFile(path.join(leader, 'sections/02-analysis.md'), '# Updated by Bob\n')
    await git(leader, ['add', '.'])
    await git(leader, ['commit', '-m', 'Merge Bob section'])
    await git(leader, ['push', 'origin', 'main'])
    await f.page.getByRole('button', { name: 'Đồng bộ', exact: true }).click()
    await expect(f.page.getByText('Đã lấy bản mới từ nhóm.', { exact: true })).toBeVisible()
    expect(await fs.readFile(path.join(root, 'sections/02-analysis.md'), 'utf8')).toContain('Updated by Bob')
    await type('# Intro\n\nMine conflict\n', true)
    await f.page.getByRole('button', { name: 'Lưu nháp', exact: true }).click()
    await expect(f.page.getByText('Đã lưu nháp trên máy.', { exact: true })).toBeVisible()
    await fs.writeFile(path.join(leader, 'sections/01-intro.md'), '# Intro\n\nIncoming conflict\n')
    await git(leader, ['add', '.'])
    await git(leader, ['commit', '-m', 'Incoming main change'])
    await git(leader, ['push', 'origin', 'main'])
    await f.page.getByRole('button', { name: 'Đồng bộ', exact: true }).click()
    await expect(f.page.getByRole('button', { name: 'Giữ bản của tôi', exact: true })).toBeVisible()
    f.page.on('dialog', (dialog: any) => dialog.accept())
    await f.page.getByRole('button', { name: 'Giữ bản của tôi', exact: true }).click()
    await f.page.getByRole('button', { name: 'Hoàn tất đồng bộ', exact: true }).click()
    await expect(f.page.getByRole('button', { name: 'Giữ bản của tôi', exact: true })).toHaveCount(0)
    await expect.poll(() => git(root, ['status', '--porcelain'])).toBe('')
    expect(await fs.readFile(path.join(root, 'sections/01-intro.md'), 'utf8')).toContain('Mine conflict')
  } finally {
    await f.close()
    if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
