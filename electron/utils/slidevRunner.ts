import fs from 'fs-extra'
import path from 'path'

export interface SlidevRunner {
  command: string
  prefixArgs: string[]
}

export function resolveSlidevRunner(projectPath: string): SlidevRunner | null {
  const packagePath = path.join(projectPath, 'node_modules', '@slidev', 'cli', 'package.json')
  try {
    const packageJson = fs.readJsonSync(packagePath)
    const bin = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.slidev
    if (typeof bin === 'string') {
      const binPath = path.resolve(path.dirname(packagePath), bin)
      if (fs.existsSync(binPath)) return { command: 'node', prefixArgs: [binPath] }
    }
  } catch {
    /* Dependencies may not have been installed yet. */
  }
  const localBin = path.join(
    projectPath,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'slidev.cmd' : 'slidev'
  )
  if (fs.existsSync(localBin)) return { command: localBin, prefixArgs: [] }
  return null
}
