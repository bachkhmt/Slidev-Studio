import fs from 'node:fs/promises'
import path from 'node:path'
import { launchFixture } from './desktop-fixture.mjs'
const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
const baseline = process.argv.includes('--baseline-online')
const runs = []
for (let iteration = 0; iteration < 7; iteration++) {
  const f = await launchFixture({
    offline: false,
    ...(baseline ? { entry: path.resolve('dist/releases/baseline/app.asar/out/main/index.js') } : {})
  })
  try {
    const sizes = []
    for (const size of [30, 100, 300]) {
      if (size !== 30) await f.page.getByTitle('Về màn hình chính (Home Dashboard)').click()
      const start = performance.now()
      await f.page.getByRole('heading', { name: `slides-${size}`, exact: true }).click()
      await f.page.locator('.monaco-editor .view-lines').first().waitFor()
      await frames(f.page)
      const editorMs = performance.now() - start
      while (
        (await f.page.evaluate((id) => window.api.process.getStatus(id).then((s) => s?.status), `fixture-${size}`)) !==
        'running'
      ) {
        if (performance.now() - start > 120000) throw new Error(`Server ${size} did not start`)
        await new Promise((r) => setTimeout(r, 100))
      }
      const serverMs = performance.now() - start
      await f.page
        .locator('.monaco-editor')
        .first()
        .click({ position: { x: 160, y: 100 } })
      await f.page.keyboard.press('Control+End')
      await f.page.evaluate(() => {
        window.__typingSamples = []
        if (!window.__typingListener) {
          window.__typingListener = true
          document.addEventListener(
            'keydown',
            () => {
              const start = performance.now()
              requestAnimationFrame(() =>
                requestAnimationFrame(() => window.__typingSamples.push(performance.now() - start))
              )
            },
            true
          )
        }
      })
      const typing = []
      for (let i = 0; i < 20; i++) {
        await f.page.keyboard.type('a')
        await f.page.waitForFunction((n) => window.__typingSamples.length > n, i)
        typing.push(await f.page.evaluate(() => window.__typingSamples.at(-1)))
      }
      sizes.push({ size, editorMs, serverMs, typingMs: typing })
    }
    const switches = []
    for (const name of ['slides-100', 'slides-300', 'slides-100', 'slides-300', 'slides-100']) {
      await f.page.evaluate(() => {
        window.__tabLatency = null
        document.addEventListener(
          'click',
          () => {
            const start = performance.now()
            requestAnimationFrame(() => requestAnimationFrame(() => (window.__tabLatency = performance.now() - start)))
          },
          { once: true, capture: true }
        )
      })
      await f.page.getByTitle('Đóng tab này').locator('..').filter({ hasText: name }).click()
      await f.page.waitForFunction(() => window.__tabLatency !== null)
      switches.push(await f.page.evaluate(() => window.__tabLatency))
    }
    const metrics = await f.app.evaluate(({ app }) =>
      app.getAppMetrics().map((m) => ({ type: m.type, memory: m.memory, cpu: m.cpu }))
    )
    runs.push({ iteration, warmup: iteration < 2, launchMs: f.launchMs, sizes, cachedSwitchMs: switches, metrics })
    console.log(`Measured ${iteration + 1}/7`)
  } finally {
    await f.close()
  }
}
const percentile = (values, p) => [...values].sort((a, b) => a - b)[Math.max(0, Math.ceil(values.length * p) - 1)]
const measured = runs.filter((r) => !r.warmup)
const typing = measured.flatMap((r) => r.sizes.flatMap((s) => s.typingMs)),
  tabs = measured.flatMap((r) => r.cachedSwitchMs)
const summary = {
  launchMedianMs: percentile(
    measured.map((r) => r.launchMs),
    0.5
  ),
  typingP95Ms: percentile(typing, 0.95),
  cachedTabP95Ms: percentile(tabs, 0.95),
  method:
    'Renderer event-to-two-animation-frames latency, excluding Playwright transport. Two warmups and five measured runs; raw samples retained.',
  targets: { typingUnder50: percentile(typing, 0.95) < 50, cachedTabUnder300: percentile(tabs, 0.95) < 300 }
}
await fs.mkdir('reports', { recursive: true })
await fs.writeFile(
  baseline ? 'reports/baseline-online.json' : 'reports/optimized.json',
  JSON.stringify({ recordedAt: new Date().toISOString(), summary, runs }, null, 2)
)
console.log(JSON.stringify(summary, null, 2))
process.exit(0)
