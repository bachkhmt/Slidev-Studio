import path from 'path'
import type { AppSettings } from '../../shared/settings'

export function buildEnv(settings: AppSettings): NodeJS.ProcessEnv {
  const paths = [
    settings.system.nodePathOverride,
    process.env.PATH,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
    '/usr/sbin',
    '/sbin'
  ]
    .flatMap((value) => (value || '').split(path.delimiter))
    .map((value) => value.trim())
    .filter(Boolean)
  const seen = new Set<string>()
  const mergedPath = paths.filter((value) => {
    const key = process.platform === 'win32' ? value.toLowerCase() : value
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return {
    ...process.env,
    PATH: mergedPath.join(path.delimiter),
    NO_COLOR: '1',
    ...(settings.server.registry ? { npm_config_registry: settings.server.registry } : {})
  }
}
