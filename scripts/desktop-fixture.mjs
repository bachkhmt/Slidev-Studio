import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL } from 'node:url'
import treeKill from 'tree-kill'
import { _electron } from 'playwright'

export async function launchFixture({
  offline = false,
  entry = path.resolve('out/main/index.js'),
  executablePath
} = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-e2e-'))
  const gitConfig = path.join(root, 'empty.gitconfig')
  await fs.writeFile(gitConfig, '')
  const gitEnv = { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: gitConfig, GIT_TERMINAL_PROMPT: '0' }
  const home = path.join(root, 'home')
  const projects = []
  for (const count of [30, 100, 300]) {
    const dir = path.join(root, `slides-${count}`)
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(
      path.join(dir, 'slides.md'),
      `---\ntheme: default\nfonts:\n  provider: none\n---\n` +
        Array.from(
          { length: count },
          (_, i) => `${i ? '\n---\n' : ''}\n# Slide ${i + 1}\n\nLocal performance fixture ${i + 1}\n`
        ).join('')
    )
    await fs.writeFile(path.join(dir, 'other.md'), '# Another file\n')
    await fs.writeFile(path.join(dir, 'data.json'), '{"title":"fixture"}\n')
    await fs.writeFile(path.join(dir, 'example.ts'), 'const value: number = 1\n')
    await fs.writeFile(
      path.join(dir, 'package.json'),
      '{"dependencies":{"@slidev/cli":"53.0.0","@slidev/theme-default":"0.25.0"}}'
    )
    const dependencies = path.resolve('.cache/slidev-fixture/node_modules')
    await fs.symlink(dependencies, path.join(dir, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
    projects.push({
      id: `fixture-${count}`,
      name: `slides-${count}`,
      path: dir,
      entryFiles: ['slides.md'],
      gitUrl: null,
      lastOpenedAt: new Date().toISOString(),
      trusted: true
    })
  }
  await fs.mkdir(path.join(home, '.slidev-studio'), { recursive: true })
  await fs.writeFile(
    path.join(home, '.slidev-studio/projects.json'),
    JSON.stringify({
      projects,
      settings: {
        settingsVersion: 2,
        server: { autoInstallDeps: false, startupTimeoutMs: 120000 },
        projects: { confirmBeforeCloseTab: false }
      }
    })
  )
  const wrapper = path.join(root, 'launch.cjs')
  await fs.writeFile(
    wrapper,
    `const {app,session}=require('electron'); globalThis.__studioTestImport=(url)=>import(url); require('node:os').homedir=()=>${JSON.stringify(home)}; app.setPath('userData',${JSON.stringify(path.join(root, 'profile'))}); ${offline ? `app.whenReady().then(()=>session.defaultSession.webRequest.onBeforeRequest((d,cb)=>{let u=new URL(d.url);cb({cancel:['http:','https:'].includes(u.protocol)&&!['localhost','127.0.0.1','[::1]'].includes(u.hostname)})}));` : ''} import(${JSON.stringify(pathToFileURL(entry).href)});`
  )
  const started = performance.now()
  const app = await _electron.launch({
    ...(executablePath ? { executablePath } : {}),
    args: executablePath ? [`--user-data-dir=${path.join(root, 'profile')}`] : [wrapper],
    env: {
      ...process.env,
      ...gitEnv,
      ...(executablePath ? { USERPROFILE: home } : {}),
      NODE_ENV: 'test',
      SLIDEV_STUDIO_TEST_DATA_DIR: path.join(home, '.slidev-studio')
    },
    timeout: 30000
  })
  const appProcess = app.process()
  const page = await app.firstWindow()
  page.setDefaultTimeout(15000)
  await page.getByRole('heading', { name: 'Slidev Studio', exact: true }).waitFor()
  return {
    app,
    page,
    root,
    home,
    projects,
    gitEnv,
    launchMs: performance.now() - started,
    async close() {
      await page
        .evaluate(
          async (ids) => {
            for (const id of ids) await window.api.process.stop(id)
          },
          projects.map((p) => p.id)
        )
        .catch(() => {})
      await Promise.race([app.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))])
      if (appProcess.exitCode === null && !appProcess.signalCode)
        await new Promise((r) => treeKill(appProcess.pid, 'SIGKILL', () => r()))
      // Explicitly unlink fixture junctions before recursively removing their parent.
      for (const project of projects) await fs.unlink(path.join(project.path, 'node_modules')).catch(() => {})
      await fs.rm(root, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 }).catch(() => {})
    }
  }
}
