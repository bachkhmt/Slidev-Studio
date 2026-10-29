import fs from 'node:fs/promises'
import path from 'node:path'
import { launchFixture } from './desktop-fixture.mjs'

const runtime = path.resolve('.cache/report-runtime'),
  binary = path.join(runtime, process.platform === 'win32' ? 'tectonic.exe' : 'tectonic'),
  cache = path.join(runtime, 'tex-cache')
await fs.mkdir(runtime, { recursive: true })
const exists = await fs.access(binary).then(
  () => true,
  () => false
)
const f = await launchFixture({
  environment: {
    ...(exists ? { SLIDEV_STUDIO_TEST_TECTONIC: binary } : {}),
    SLIDEV_STUDIO_TEST_TEX_CACHE: cache
  }
})
try {
  if (!exists) {
    console.log('Installing the pinned Tectonic runtime through the application API…')
    await f.page.evaluate(() => window.api.reports.installCompiler())
    const managed = path.join(f.home, '.slidev-studio/runtimes/tectonic/0.17.0', path.basename(binary))
    await fs.copyFile(managed, binary)
    if (process.platform !== 'win32') await fs.chmod(binary, 0o755)
  }
  const project = await f.page.evaluate(
    (targetDir) =>
      window.api.scaffold.create({
        name: 'warmup-report',
        templateId: 'dl-assignment-report',
        targetDir,
        title: 'Report runtime warmup',
        author: 'Report tests'
      }),
    f.root
  )
  const off = await f.page.exposeFunction('__reportPreparationLog', (state) => {
    if (state.logs?.length) console.log(state.logs.at(-1))
  })
  void off
  await f.page.evaluate(() => window.api.reports.onChange((state) => window.__reportPreparationLog(state)))
  const result = await f.page.evaluate((id) => window.api.reports.compile(id, 'main.tex'), project.id)
  if (result.state !== 'ready') throw new Error(result.error || 'Report preparation failed')
  console.log(`Report runtime and TeX cache ready: ${runtime}`)
} finally {
  await f.close()
}
