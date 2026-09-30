import fs from 'fs-extra'
import path from 'path'

export function validateSettingsImportFields(input: unknown, cwd = process.cwd()): { settings: Record<string, any>; warnings: string[] } {
  const source = (input as any)?.settings || input || {}
  const clean = structuredClone(source) as Record<string, any>
  const warnings: string[] = []
  const has = (object: any, key: string): boolean => !!object && typeof object === 'object' && Object.prototype.hasOwnProperty.call(object, key)
  const nodePath = clean?.system?.nodePathOverride
  if (has(clean?.system, 'nodePathOverride') && (typeof nodePath !== 'string' || !!nodePath)) {
    try {
      if (typeof nodePath !== 'string') throw new Error()
      const absolute = path.resolve(nodePath)
      const isDirectory = fs.statSync(absolute).isDirectory()
      const executable = process.platform === 'win32' ? 'node.exe' : 'node'
      if (!isDirectory || !fs.existsSync(path.join(absolute, executable))) throw new Error()
    } catch {
      if (clean.system && typeof clean.system === 'object') delete clean.system.nodePathOverride
      warnings.push('Đã bỏ qua system.nodePathOverride: thư mục phải tồn tại và chứa node/node.exe.')
    }
  }
  const registry = clean?.server?.registry
  if (has(clean?.server, 'registry')) {
    let valid = registry === ''
    if (typeof registry === 'string' && registry) {
      try { valid = new URL(registry).protocol === 'https:' } catch { valid = false }
    }
    if (!valid) {
      if (clean.server && typeof clean.server === 'object') delete clean.server.registry
      warnings.push('Đã bỏ qua server.registry: chỉ chấp nhận URL HTTPS hoặc chuỗi rỗng.')
    }
  }
  const extraArgs = clean?.server?.extraArgs
  if (has(clean?.server, 'extraArgs') && (typeof extraArgs !== 'string' || extraArgs.length > 200 || /[\u0000-\u001f\u007f]/.test(extraArgs))) {
    if (clean.server && typeof clean.server === 'object') delete clean.server.extraArgs
    warnings.push('Đã bỏ qua server.extraArgs: không chấp nhận ký tự điều khiển và tối đa 200 ký tự.')
  }
  const outputDir = clean?.export?.outputDir
  if (has(clean?.export, 'outputDir')) {
    try {
      if (typeof outputDir !== 'string' || !outputDir.trim()) throw new Error()
      if (!fs.statSync(path.resolve(cwd, outputDir)).isDirectory()) throw new Error()
    } catch {
      if (clean.export && typeof clean.export === 'object') delete clean.export.outputDir
      warnings.push('Đã bỏ qua export.outputDir: thư mục đích phải tồn tại.')
    }
  }
  return { settings: clean, warnings }
}
