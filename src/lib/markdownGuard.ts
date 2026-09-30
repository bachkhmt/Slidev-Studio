import { parseDocument } from 'yaml'

export type MarkdownGuardResult = { ok: true } | { ok: false; line: number; reason: string }

export function checkSlideMarkdown(text: string): MarkdownGuardResult {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  let fence: { marker: string; length: number; line: number } | null = null
  const separators: number[] = []
  const codeMask: boolean[] = []
  for (let i = 0; i < lines.length; i++) {
    codeMask[i] = Boolean(fence)
    const match = lines[i].match(/^\s{0,3}(`{3,}|~{3,})/)
    if (!match) continue
    const marker = match[1][0]
    if (!fence) fence = { marker, length: match[1].length, line: i + 1 }
    else if (marker === fence.marker && match[1].length >= fence.length) fence = null
  }
  if (fence) return { ok: false, line: fence.line, reason: 'Code fence chưa được đóng' }

  fence = null
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^\s{0,3}(`{3,}|~{3,})/)
    if (match) {
      const marker = match[1][0]
      if (!fence) fence = { marker, length: match[1].length, line: i + 1 }
      else if (marker === fence.marker && match[1].length >= fence.length) fence = null
      continue
    }
    if (!fence && /^\s*---\s*$/.test(lines[i])) separators.push(i)
  }

  for (let i = 0; i + 1 < separators.length; i++) {
    const start = separators[i]
    const end = separators[i + 1]
    const block = lines.slice(start + 1, end)
    if (!block.some((line) => /^\s*[\w-]+\s*:/.test(line)) || !block.some((line) => line.trim())) continue
    const parsed = parseDocument(block.join('\n'))
    if (parsed.errors.length) {
      const error = parsed.errors[0] as Error & { linePos?: Array<{ line: number }> }
      return { ok: false, line: start + 2 + Math.max(0, (error.linePos?.[0]?.line || 1) - 1), reason: 'YAML trong frontmatter chưa hợp lệ' }
    }
  }

  const lastSeparator = separators.at(-1)
  if (lastSeparator !== undefined) {
    const trailing = lines.slice(lastSeparator + 1)
    const nonEmpty = trailing.filter((line) => line.trim() && !line.trim().startsWith('#'))
    if (nonEmpty.length && nonEmpty.some((line) => /^\s*[\w-]+\s*:/.test(line))) {
      return { ok: false, line: lastSeparator + 1, reason: 'Frontmatter chưa được đóng bằng ---' }
    }
  }

  let mathLine: number | undefined
  lines.forEach((line, index) => {
    if (!codeMask[index] && line.trim() === '$$') mathLine = mathLine === undefined ? index + 1 : undefined
  })
  if (mathLine !== undefined) return { ok: false, line: mathLine, reason: 'Khối công thức $$ chưa được đóng' }

  const componentStack: Array<{ name: string; line: number }> = []
  for (let index = 0; index < lines.length; index++) {
    if (codeMask[index]) continue
    const withoutInlineCode = lines[index].replace(/(`+)[^`]*?\1/g, '')
    const tagPattern = /<\/?([A-Z][A-Za-z0-9]*)\b[^>]*>/g
    for (const match of withoutInlineCode.matchAll(tagPattern)) {
      const tag = match[0]
      const name = match[1]
      if (tag.startsWith('</')) {
        const top = componentStack.at(-1)
        if (top?.name === name) componentStack.pop()
      } else if (!/\/\s*>$/.test(tag)) componentStack.push({ name, line: index + 1 })
    }
  }
  if (componentStack.length) {
    const unclosed = componentStack.at(-1)!
    return { ok: false, line: unclosed.line, reason: `Thẻ <${unclosed.name}> chưa được đóng` }
  }
  return { ok: true }
}
