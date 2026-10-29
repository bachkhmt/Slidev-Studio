import fs from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
import { launchFixture } from './desktop-fixture.mjs'
const { version } = JSON.parse(await fs.readFile('package.json', 'utf8'))
const executablePath = path.resolve(process.argv[2] || `dist/releases/${version}/win-unpacked/Slidev Studio.exe`)
const f = await launchFixture({ executablePath })
try {
  const metadata = await f.app.evaluate(({ app }) => ({
    packaged: app.isPackaged,
    userData: app.getPath('userData'),
    appPath: app.getAppPath()
  }))
  assert.equal(metadata.packaged, true)
  assert.ok(
    metadata.userData.toLowerCase().startsWith(f.root.toLowerCase()),
    'Packaged smoke must use an isolated Chromium profile'
  )
  const registered = await f.page.evaluate(() => window.api.projects.list())
  assert.equal(registered.length, f.projects.length, 'Packaged smoke must use the temporary home')
  for (const project of registered)
    assert.equal(
      project.path,
      f.projects.find((p) => p.id === project.id)?.path,
      'Packaged project path must belong to the fixture'
    )
  await f.app.evaluate(({ session }) =>
    session.defaultSession.webRequest.onBeforeRequest((request, done) => {
      const url = new URL(request.url)
      done({
        cancel:
          ['http:', 'https:'].includes(url.protocol) && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      })
    })
  )
  assert.equal(await f.page.getByAltText('Logo Bách Khoa TP.HCM').count(), 1)
  await f.page.getByRole('heading', { name: 'slides-30', exact: true }).click()
  await f.page.locator('.monaco-editor').waitFor()
  await f.page.locator('.monaco-editor').click({ position: { x: 160, y: 100 } })
  await f.page.keyboard.press('Control+End')
  await f.page.keyboard.type('\nPackaged offline verification')
  await f.page.keyboard.press('Control+s')
  const start = Date.now()
  while (!(await fs.readFile(`${f.projects[0].path}/slides.md`, 'utf8')).includes('Packaged offline verification')) {
    if (Date.now() - start > 10000) throw new Error('Packaged save did not complete')
    await new Promise((r) => setTimeout(r, 20))
  }
  await f.page.getByRole('button', { name: 'data.json', exact: true }).click()
  const workerStart = Date.now()
  while (!f.page.workers().some((w) => w.url().includes('json.worker'))) {
    if (Date.now() - workerStart > 10000) throw new Error('Packaged worker did not load')
    await new Promise((r) => setTimeout(r, 30))
  }
  await f.page.getByRole('button', { name: 'example.ts', exact: true }).click()
  const tsStart = Date.now()
  while (!f.page.workers().some((w) => w.url().includes('ts.worker'))) {
    if (Date.now() - tsStart > 10000) throw new Error('Packaged TypeScript worker did not load')
    await new Promise((r) => setTimeout(r, 30))
  }
  const resources = path.dirname(metadata.appPath),
    templates = (await fs.readdir(path.join(resources, 'templates'), { withFileTypes: true }))
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .sort()
  assert.deepEqual(templates, [
    'apple-basic',
    'bricks',
    'default',
    'dl-assignment-markdown',
    'dl-assignment-report',
    'dracula',
    'frankfurt-academic',
    'git-collab',
    'hcmut-bach',
    'penguin',
    'seriph',
    'shibainu'
  ])
  assert.deepEqual(await fs.readFile(path.join(resources, 'icon.png')), await fs.readFile('build/icon.png'))
  await f.page.screenshot({ path: 'reports/packaged-app.png' })
  await fs.writeFile(
    'reports/packaged-smoke.json',
    JSON.stringify(
      {
        ...metadata,
        success: true,
        offlineEditor: true,
        localJsonWorker: true,
        localTypeScriptWorker: true,
        templates,
        logoMatches: true
      },
      null,
      2
    )
  )
  console.log('Packaged smoke passed')
} finally {
  await f.close()
}
process.exit(0)
