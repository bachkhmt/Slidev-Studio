import { execFileSync } from 'node:child_process'
import { parse } from 'yaml'

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' })
const { BASE_SHA, HEAD_SHA, PR_AUTHOR } = process.env
if (!/^[a-f0-9]{40}$/.test(BASE_SHA || '') || !/^[a-f0-9]{40}$/.test(HEAD_SHA || '') || !PR_AUTHOR) throw new Error('Thiếu SHA/author hợp lệ.')
// Trust assignments from the base branch, never from the submitted manifest.
const manifest = JSON.parse(git('show', `${BASE_SHA}:slidev-collab.json`))
const changed = git('diff', '--no-renames', '--name-only', '-z', BASE_SHA, HEAD_SHA).split('\0').filter(Boolean)
const mine = manifest.sections.filter((s) => s.owner.toLowerCase() === PR_AUTHOR.toLowerCase())
const coordinator = manifest.coordinator?.toLowerCase() === PR_AUTHOR.toLowerCase()
const forbidden = changed.filter((file) => !mine.some((s) => file === s.file || file.startsWith(`sections-assets/${s.id}/`)))
if (!coordinator && forbidden.length) throw new Error(`Sửa ngoài phần phân công: ${forbidden.join(', ')}`)
const globalKeys = ['theme', 'title', 'fonts', 'addons', 'defaults', 'css', 'mdc', 'highlighter', 'vite', 'drawings', 'routerMode', 'download', 'export', 'colorSchema', 'aspectRatio', 'canvasWidth']
for (const file of changed) {
  const info = git('ls-tree', HEAD_SHA, '--', file).trim()
  if (info.startsWith('120000')) throw new Error(`Không chấp nhận symlink: ${file}`)
}
// Validate every section in the submitted structure, including coordinator changes.
const submitted = JSON.parse(git('show', `${HEAD_SHA}:slidev-collab.json`))
for (const section of submitted.sections) {
  const markdown = git('show', `${HEAD_SHA}:${section.file}`)
  const head = markdown.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  const fm = head ? parse(head[1]) || {} : {}
  if (globalKeys.some((key) => key in fm)) throw new Error(`Cấu hình toàn cục trong ${section.file}`)
}
console.log(`Phạm vi hợp lệ cho @${PR_AUTHOR}: ${changed.length} file.`)
