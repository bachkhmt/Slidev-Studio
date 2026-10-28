import fs from 'fs-extra'
import os from 'os'
import path from 'path'
import { expect, it, vi } from 'vitest'
const calls = vi.hoisted(() => ({ args: [] as string[] }))
vi.mock('electron', () => ({ ipcMain: {}, BrowserWindow: {} }))
vi.mock('../electron/services/projectStore', async () => {
  const { DEFAULT_SETTINGS } = await import('../shared/settings')
  return { projectStore: { getSettings: () => DEFAULT_SETTINGS } }
})
vi.mock('../electron/utils/pathGuard', () => ({
  assertInsideAllowedRoot: (p: string) => p,
  assertRegisteredProjectRoot: (p: string) => p
}))
vi.mock('../electron/utils/slidevRunner', () => ({
  resolveSlidevRunner: () => ({ command: 'node', prefixArgs: ['slidev.mjs'] })
}))
vi.mock('execa', () => ({
  execa: (_cmd: string, args: string[]) => {
    calls.args = args
    return Object.assign(Promise.resolve({ exitCode: 0 }), { stdout: { on: () => {} }, stderr: { on: () => {} } })
  }
}))
import { runSingleExport } from '../electron/ipc/export.ipc'
it('uses the per-slide PDF route when a range is requested, preserving full-document export otherwise', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-export-range-'))
  try {
    await runSingleExport(root, 'slides.md', 'pdf', { range: '1-3' }, () => {})
    expect(calls.args).toContain('--per-slide')
    expect(calls.args.slice(calls.args.indexOf('--range'), calls.args.indexOf('--range') + 2)).toEqual([
      '--range',
      '1-3'
    ])
    await runSingleExport(root, 'slides.md', 'pdf', {}, () => {})
    expect(calls.args).not.toContain('--per-slide')
  } finally {
    await fs.remove(root)
  }
})
