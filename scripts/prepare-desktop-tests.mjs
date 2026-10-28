import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
await fs.mkdir('.cache/slidev-fixture', { recursive: true })
for (const file of ['package.json', 'package-lock.json'])
  await fs.copyFile(`tests/fixtures/slidev-runtime/${file}`, `.cache/slidev-fixture/${file}`)
const child = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci'], {
  cwd: path.resolve('.cache/slidev-fixture'),
  stdio: 'inherit',
  shell: process.platform === 'win32'
})
child.on('exit', (code) => (process.exitCode = code || 0))
