import fs from 'node:fs/promises'
import path from 'node:path'
import { launchFixture } from './desktop-fixture.mjs'
const runs = []
for (let i = 0; i < 7; i++) {
  const fixture = await launchFixture({
    offline: true,
    entry: path.resolve('dist/releases/baseline/app.asar/out/main/index.js')
  })
  try {
    const started = performance.now()
    await fixture.page.getByRole('heading', { name: 'slides-30', exact: true }).click()
    let editor = false
    try {
      await fixture.page.locator('.monaco-editor textarea').first().waitFor({ timeout: 10000 })
      editor = true
    } catch {}
    const metrics = await fixture.app.evaluate(({ app }) =>
      app.getAppMetrics().map((m) => ({ type: m.type, memory: m.memory, cpu: m.cpu }))
    )
    const result = {
      iteration: i,
      warmup: i < 2,
      launchMs: fixture.launchMs,
      editorReady: editor,
      editorMs: performance.now() - started,
      metrics
    }
    if (!editor)
      result.limitation = 'Offline editor did not load within 10 seconds; typing and cached-tab metrics unavailable.'
    runs.push(result)
    console.log(`Baseline ${i + 1}/7: launch=${Math.round(result.launchMs)}ms, offlineEditor=${editor}`)
  } finally {
    await fixture.close()
  }
}
await fs.mkdir('reports', { recursive: true })
await fs.writeFile('reports/baseline.json', JSON.stringify({ recordedAt: new Date().toISOString(), runs }, null, 2))
console.log(
  JSON.stringify(
    runs.map(({ metrics, ...r }) => r),
    null,
    2
  )
)
