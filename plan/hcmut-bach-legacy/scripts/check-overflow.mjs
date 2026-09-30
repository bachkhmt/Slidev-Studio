#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import net from 'node:net'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { existsSync, realpathSync } from 'node:fs'

const options = parseArgs(process.argv.slice(2))
const project = path.resolve(options.project ?? process.cwd())
const entry = path.resolve(project, options.entry ?? 'slides.md')
const timeoutMs = Number(options.timeout ?? 90_000)
const maxSlides = Number(options['max-slides'] ?? 500)

if (!existsSync(entry)) fail(`Không tìm thấy entry Slidev: ${entry}`)

let playwright
try {
  const projectRequire = createRequire(path.join(project, 'package.json'))
  playwright = projectRequire('playwright-chromium')
} catch {
  fail(`Chưa có playwright-chromium trong ${project}. Chạy: npm install -D playwright-chromium`)
}

const externalUrl = options.url ? new URL(options.url) : undefined
let child
let browser
const viteOutput = []
const consoleErrors = []

try {
  let baseUrl
  if (externalUrl) {
    baseUrl = externalUrl.origin
  } else {
    const port = await findFreePort()
    const cli = path.join(project, 'node_modules', '.bin', 'slidev')
    if (!existsSync(cli)) fail(`Không tìm thấy Slidev CLI: ${cli}. Chạy npm install trong project.`)
    const cliEntry = realpathSync(cli)
    child = spawn(process.execPath, [cliEntry, entry, '--port', String(port), '--open=false'], {
      cwd: project,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0' },
    })
    child.stdout.on('data', (chunk) => appendOutput(viteOutput, chunk))
    child.stderr.on('data', (chunk) => appendOutput(viteOutput, chunk))
    baseUrl = `http://localhost:${port}`
    await waitForServer(baseUrl, child, timeoutMs, viteOutput)
  }

  browser = await playwright.chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 })
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => {
    // Slidev's screen-wake-lock request is denied by headless Chromium by design.
    if (!error.message.includes('Wake Lock permission request denied')) consoleErrors.push(error.message)
  })

  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
  const firstFrame = page.locator('.slidev-page[data-slidev-no="1"] .slidev-layout.hb[data-hb-page]')
  await firstFrame.waitFor({ state: 'visible', timeout: timeoutMs })
  await page.waitForTimeout(300)

  const totalFromFooter = await firstFrame.locator('.hb-num').first().textContent().catch(() => null)
  const matchedTotal = totalFromFooter?.match(/\/\s*(\d+)/)
  const total = Number(options.slides ?? matchedTotal?.[1] ?? 0)
  if (!total) throw new Error('Không lấy được tổng slide từ footer; truyền --slides N nếu slide đầu dùng layout full.')

  const overflows = []
  const uninstrumented = []
  const bulletFailures = []
  let hiddenBulletCount = 0
  for (let slideNo = 1; slideNo <= Math.min(total, maxSlides); slideNo++) {
    await page.goto(`${baseUrl}/${slideNo}`, { waitUntil: 'domcontentloaded', timeout: timeoutMs })
    const frame = page.locator(`.slidev-page[data-slidev-no="${slideNo}"] .slidev-layout.hb[data-hb-page]`)
    await frame.waitFor({ state: 'visible', timeout: timeoutMs })
    await page.waitForTimeout(180)
    const result = await frame.evaluate((node) => ({
      page: Number(node.getAttribute('data-hb-page')),
      overflow: Number(node.getAttribute('data-hb-overflow-px')),
      hiddenBullets: [...node.querySelectorAll('li.slidev-vclick-hidden')].map((item) => ({
        text: item.textContent?.trim() ?? '',
        pseudoOpacity: Number.parseFloat(getComputedStyle(item, '::before').opacity),
      })),
    }))
    if (!Number.isFinite(result.overflow)) {
      uninstrumented.push(slideNo)
    } else if (result.overflow > 0) {
      overflows.push({ slide: slideNo, pixels: result.overflow })
    }
    hiddenBulletCount += result.hiddenBullets.length
    for (const bullet of result.hiddenBullets) {
      if (bullet.pseudoOpacity > 0.01) bulletFailures.push({ slide: slideNo, text: bullet.text })
    }
    process.stdout.write(`\rĐã kiểm tra ${slideNo}/${total}`)
  }
  process.stdout.write('\n')

  if (total > maxSlides) console.warn(`Đã dừng ở ${maxSlides}/${total}; tăng --max-slides để kiểm tra phần còn lại.`)
  if (uninstrumented.length) console.warn(`Không đọc được chỉ số overflow ở slide: ${uninstrumented.join(', ')}`)
  if (overflows.length) {
    console.error(`Phát hiện nội dung tràn footer ở ${overflows.length} slide:`)
    for (const item of overflows) console.error(`  Slide ${item.slide}: tràn ${item.pixels}px`)
  } else {
    console.log(`Không phát hiện slide tràn footer trong ${Math.min(total, maxSlides)} slide.`)
  }
  if (bulletFailures.length) {
    console.error('Pseudo-bullet vẫn hiện dù nội dung đang ẩn bởi v-click:')
    for (const bullet of bulletFailures) console.error(`  Slide ${bullet.slide}: ${bullet.text}`)
  } else if (hiddenBulletCount) {
    console.log(`Pseudo-bullet ẩn đúng cùng ${hiddenBulletCount} mục v-click.`)
  } else {
    console.log('Deck không có bullet ẩn để kiểm tra tương thích v-click.')
  }
  if (consoleErrors.length) {
    console.warn(`Browser ghi nhận ${consoleErrors.length} console error(s):`)
    for (const error of [...new Set(consoleErrors)]) console.warn(`  ${error}`)
  }
  if (overflows.length || bulletFailures.length) process.exitCode = 1
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  if (viteOutput.length) console.error(`\nSlidev log:\n${viteOutput.join('')}`)
  process.exitCode = 1
} finally {
  await browser?.close().catch(() => {})
  if (child && child.exitCode === null) {
    child.kill('SIGTERM')
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), delay(4000)])
    if (child.exitCode === null) child.kill('SIGKILL')
  }
}

function parseArgs(args) {
  const parsed = {}
  for (let index = 0; index < args.length; index++) {
    const token = args[index]
    if (!token.startsWith('--')) fail(`Đối số không hợp lệ: ${token}`)
    const [key, inlineValue] = token.slice(2).split('=', 2)
    const value = inlineValue ?? args[++index]
    if (value === undefined || value.startsWith('--')) fail(`Thiếu giá trị cho --${key}`)
    parsed[key] = value
  }
  return parsed
}

function fail(message) {
  console.error(message)
  process.exit(2)
}

function appendOutput(lines, chunk) {
  lines.push(chunk.toString())
  if (lines.join('').length > 12_000) lines.splice(0, Math.ceil(lines.length / 2))
}

async function findFreePort() {
  const server = net.createServer()
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  await new Promise((resolve) => server.close(resolve))
  return port
}

async function waitForServer(url, process, timeout, logs) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if (process.exitCode !== null) throw new Error(`Slidev thoát với mã ${process.exitCode}.\n${logs.join('')}`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch { /* Vite is still starting. */ }
    await delay(250)
  }
  throw new Error(`Hết thời gian chờ Slidev khởi động tại ${url}.`)
}
