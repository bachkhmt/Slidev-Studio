export interface SlideSourceRange {
  no: number
  startLine: number
  contentStartLine: number
  endLine: number
  file: string
  src?: string
}

function fenceState(line: string, current: string | null): string | null {
  const match = line.match(/^\s{0,3}(`{3,}|~{3,})/)
  if (!match) return current
  const marker = match[1][0]
  if (!current) return marker
  return marker === current[0] && match[1].length >= current.length ? null : current
}

function isSeparator(line: string): boolean {
  return /^\s*---\s*$/.test(line)
}

function looksLikeFrontmatter(lines: string[]): boolean {
  const content = lines.filter((line) => line.trim() && !line.trim().startsWith('#'))
  return content.length > 0 && content.some((line) => /^[\w-]+\s*:/.test(line.trim())) && content.every((line) => /^[\w-]+\s*:|^\s+[-\w"'.#]+\s*:|^\s*[-\w"'.#]+\s*$/.test(line))
}

function resolveSibling(entryFile: string, reference: string): string {
  if (!reference || reference.startsWith('/') || /^[a-z]:\//i.test(reference) || /^[a-z]+:\/\//i.test(reference)) return reference || entryFile
  const normalized = entryFile.replace(/\\/g, '/')
  const parent = normalized.slice(0, normalized.lastIndexOf('/') + 1)
  const combined = `${parent}${reference}`
  const drive = combined.match(/^([a-z]:)\//i)?.[1] || ''
  const parts = (drive ? combined.slice(drive.length + 1) : combined).split('/')
  const output: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') output.pop()
    else output.push(part)
  }
  return `${drive ? `${drive}/` : combined.startsWith('/') ? '/' : ''}${output.join('/')}`
}

export function parseSlideIndex(markdown: string, entryFile: string): SlideSourceRange[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const separators: number[] = []
  let fence: string | null = null
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (!fence && isSeparator(line)) separators.push(index)
    fence = fenceState(line, fence)
  }

  let firstBody = 0
  let firstSlideStart = 0
  let delimiterCursor = 0
  if (separators[0] === 0 && separators.length > 1) {
    firstBody = separators[1] + 1
    firstSlideStart = firstBody
    delimiterCursor = 2
  }

  const ranges: SlideSourceRange[] = []
  let start = firstSlideStart
  let contentStart = firstSlideStart
  let no = 1
  let cursor = delimiterCursor
  while (cursor < separators.length) {
    const boundary = separators[cursor]
    const previous = {
      no,
      startLine: start + 1,
      contentStartLine: contentStart + 1,
      endLine: Math.max(start + 1, boundary),
      file: entryFile
    }
    ranges.push(previous)
    let nextStart = boundary + 1
    let nextContentStart = nextStart
    let src: string | undefined
    const nextDelimiter = separators[cursor + 1]
    if (nextDelimiter !== undefined && looksLikeFrontmatter(lines.slice(nextStart, nextDelimiter))) {
      const frontmatter = lines.slice(nextStart, nextDelimiter).join('\n')
      src = frontmatter.match(/^\s*src\s*:\s*["']?([^\s"']+)/m)?.[1]
      nextStart = nextDelimiter + 1
      nextContentStart = nextStart
      cursor += 1
    }
    start = nextStart
    contentStart = nextContentStart
    no++
    cursor++
    if (start < lines.length) {
      const metaSrc = src ? resolveSibling(entryFile, src) : undefined
      ranges[ranges.length - 1].endLine = Math.max(ranges[ranges.length - 1].startLine, boundary)
      ;(ranges[ranges.length - 1] as SlideSourceRange & { nextSrc?: string }).nextSrc = metaSrc
    }
  }
  if (start < lines.length || ranges.length === 0) {
    const last = separators[separators.length - 1]
    const possibleStart = last !== undefined && last >= start ? last + 1 : start
    const lastRange: SlideSourceRange = {
      no,
      startLine: possibleStart + 1,
      contentStartLine: possibleStart + 1,
      endLine: lines.length,
      file: entryFile
    }
    ranges.push(lastRange)
  }

  // Per-slide src frontmatter belongs to the slide beginning after that block.
  for (let index = 0; index < ranges.length; index++) {
    const range = ranges[index] as SlideSourceRange & { nextSrc?: string }
    if (range.nextSrc && ranges[index + 1]) {
      ranges[index + 1].src = range.nextSrc
      ranges[index + 1].file = range.nextSrc
      const next = ranges[index + 1]
      const frontmatterOpen = lines[next.startLine - 1] === '---'
      if (frontmatterOpen) {
        const close = lines.findIndex((line, lineNo) => lineNo >= next.startLine && isSeparator(line))
        if (close >= 0) next.contentStartLine = close + 2
      }
    }
    delete range.nextSrc
  }
  if (firstBody > 0 && ranges[0]) ranges[0].contentStartLine = firstBody + 1
  return ranges
}

export function resolveSlideFile(entryFile: string, projectPath: string, file: string): string {
  const value = file.replace(/\\/g, '/')
  if (value.startsWith('/') || /^[a-z]:\//i.test(value)) return value
  const base = value.startsWith('./') || value.startsWith('../')
    ? entryFile.slice(0, entryFile.lastIndexOf('/') + 1)
    : `${projectPath.replace(/\\/g, '/')}/`
  const combined = `${base}${value}`
  const drive = combined.match(/^([a-z]:)\//i)?.[1] || ''
  const parts = (drive ? combined.slice(drive.length + 1) : combined).split('/')
  const output: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') output.pop()
    else output.push(part)
  }
  return `${drive ? `${drive}/` : combined.startsWith('/') ? '/' : ''}${output.join('/')}`
}
