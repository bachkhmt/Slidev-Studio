import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import fs from 'fs-extra'
import path from 'path'

type TwoslashPatchResult = 'patched' | 'already-patched' | 'not-found' | 'unsupported'

/**
 * @shikijs/vitepress-twoslash assumes every FloatingVue VMenu exposes an
 * internal Popper component. FloatingVue 5.4 no longer guarantees that shape.
 * Keep this narrowly scoped patch in Studio so it still applies when a project
 * installs dependencies with --ignore-scripts (which intentionally skips its
 * postinstall scripts, including patch-package).
 */
export function patchTwoslashFloatingVue(projectPath: string): TwoslashPatchResult {
  const projectRequire = createRequire(path.join(projectPath, 'package.json'))
  let clientPath: string
  try {
    clientPath = projectRequire.resolve('@shikijs/vitepress-twoslash/client')
  } catch {
    return 'not-found'
  }

  let source: string
  try {
    source = fs.readFileSync(clientPath, 'utf8')
  } catch {
    return 'not-found'
  }

  const alreadyPatched = source.includes('const methods = PopperTs?.methods;')
  if (!alreadyPatched) {
    const unsafeBlock = /if \(rest\.length >= 2 && rest\[0\] === "VMenu"\) try \{[\s\S]*?catch \(e\) \{\s*console\.error\("Failed to patch FloatingVue", e\);\s*\}/
    if (!unsafeBlock.test(source)) return 'unsupported'

    const safeBlock = [
      'if (rest.length >= 2 && rest[0] === "VMenu") {',
      '\tconst PopperTs = rest[1]?.components?.Popper?.extends;',
      '\tconst methods = PopperTs?.methods;',
      '\tif (methods?.show && methods?.hide) {',
      '\t\tconst _show = methods.show;',
      '\t\tmethods.show = function(...args) {',
      '\t\t\tif (!isDragging) return _show.apply(this, args);',
      '\t\t};',
      '\t\tconst _hide = methods.hide;',
      '\t\tmethods.hide = function(...args) {',
      '\t\t\tif (!isDragging) return _hide.apply(this, args);',
      '\t\t};',
      '\t}',
      '}'
    ].join('\n')

    try {
      source = source.replace(unsafeBlock, safeBlock)
      fs.writeFileSync(clientPath, source)
    } catch {
      return 'unsupported'
    }
  }

  const cacheMarker = path.join(projectPath, 'node_modules', '.slidev-studio', 'twoslash-floating-vue-cache-hash')
  const contentHash = createHash('sha256').update(source).digest('hex')
  let previousHash = ''
  try { previousHash = fs.readFileSync(cacheMarker, 'utf8').trim() } catch { /* First compatibility pass for this installed package. */ }
  if (previousHash !== contentHash) {
    try {
      fs.removeSync(path.join(projectPath, 'node_modules', '.vite', 'deps'))
      fs.ensureDirSync(path.dirname(cacheMarker))
      fs.writeFileSync(cacheMarker, contentHash)
    } catch { /* Vite can still rebuild its cache on the next launch. */ }
  }

  return alreadyPatched ? 'already-patched' : 'patched'
}
