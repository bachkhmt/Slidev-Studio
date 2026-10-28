import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { expect, it } from 'vitest'
import { resolveSlidevRunner } from '../electron/utils/slidevRunner'
it('runs the local CLI directly through Node instead of a shell shim', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-runner-'))
  try {
    await fs.outputFile(path.join(root, 'node_modules/.bin/slidev.cmd'), '@echo off')
    await fs.outputJson(path.join(root, 'node_modules/@slidev/cli/package.json'), { bin: { slidev: 'bin/slidev.mjs' } })
    await fs.outputFile(path.join(root, 'node_modules/@slidev/cli/bin/slidev.mjs'), '')
    const runner = resolveSlidevRunner(root)!
    expect(runner.command).toBe('node')
    expect(runner.prefixArgs).toEqual([path.join(root, 'node_modules/@slidev/cli/bin/slidev.mjs')])
  } finally {
    await fs.remove(root)
  }
})
