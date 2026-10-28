import fs from 'node:fs/promises'
import { launchFixture } from './desktop-fixture.mjs'
const f = await launchFixture({ offline: true }),
  results = []
async function waitFor(predicate, timeout = 30000) {
  const start = performance.now()
  while (!(await predicate())) {
    if (performance.now() - start > timeout) throw new Error('Preview timeout')
    await new Promise((r) => setTimeout(r, 20))
  }
}
try {
  for (const count of [30, 100, 300]) {
    if (count !== 30) await f.page.getByTitle('Về màn hình chính (Home Dashboard)').click()
    const start = performance.now()
    await f.page.getByRole('heading', { name: `slides-${count}`, exact: true }).click()
    let status
    await waitFor(async () => {
      status = await f.page.evaluate((id) => window.api.process.getStatus(id), `fixture-${count}`)
      return status?.status === 'running'
    }, 120000)
    const serverReadyMs = performance.now() - start
    const text = async () =>
      f.app.evaluate(async ({ webContents }, url) => {
        const guest = webContents
          .getAllWebContents()
          .find((w) => w.getType() === 'webview' && w.getURL().startsWith(url))
        return guest ? guest.executeJavaScript('document.body.innerText').catch(() => '') : ''
      }, status.url)
    await waitFor(async () => (await text()).includes('Slide 1'))
    const previewReadyMs = performance.now() - start
    const file = `${f.projects.find((p) => p.id === `fixture-${count}`).path}/slides.md`,
      original = await fs.readFile(file, 'utf8'),
      updates = []
    for (let i = 0; i < 7; i++) {
      const marker = `Measured-${count}-${i}`,
        stamp = performance.now()
      await fs.writeFile(file, original.replace('# Slide 1', `# ${marker}`))
      await waitFor(async () => (await text()).includes(marker))
      updates.push({ iteration: i, warmup: i < 2, hmrMs: performance.now() - stamp })
    }
    results.push({ count, serverReadyMs, previewReadyMs, updates })
    console.log(`Preview measured: ${count} slides`)
  }
} finally {
  await f.close()
}
await fs.writeFile(
  'reports/preview-performance.json',
  JSON.stringify(
    {
      method:
        'Disk write to visible guest DOM; excludes editor autosave debounce. Two warmups and five measured updates per size.',
      results
    },
    null,
    2
  )
)
process.exit(0)
