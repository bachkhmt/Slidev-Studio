import type { SourceClickPayload } from '../../shared/preview-bridge'
import type { SlideSourceRange } from './slideIndex'

export interface SourceLocation {
  file: string
  line: number
  column: number
  length: number
  confidence: 'exact' | 'fuzzy' | 'slide'
}

function normalizeText(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase().replace(/\s+/g, ' ').trim()
}

interface NormalizedLine { text: string; columns: number[] }

function normalizeMarkdownLine(input: string): NormalizedLine {
  let start = 0
  let line = input
  const prefix = line.match(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/)
  if (prefix) { start = prefix[0].length; line = line.slice(start) }
  let output = ''
  const columns: number[] = []
  let index = 0
  while (index < line.length) {
    const rest = line.slice(index)
    const link = rest.match(/^!?\[([^\]]*)\]\([^)]*\)/)
    if (link) {
      const labelOffset = link[0].indexOf('[') + 1
      for (let i = 0; i < link[1].length; i++) { output += link[1][i]; columns.push(start + index + labelOffset + i) }
      index += link[0].length
      continue
    }
    const html = rest.match(/^<[^>]*>/)
    if (html) { index += html[0].length; continue }
    if (/^(?:\*\*|__|~~|`|\*|_|\$)/.test(rest)) {
      index += rest.startsWith('**') || rest.startsWith('__') || rest.startsWith('~~') ? 2 : 1
      continue
    }
    output += line[index]
    columns.push(start + index)
    index++
  }
  let normalized = ''
  const mapped: number[] = []
  for (let sourceIndex = 0; sourceIndex < output.length; sourceIndex++) {
    const character = output[sourceIndex]
    if (/\s/.test(character)) {
      if (normalized && !normalized.endsWith(' ')) {
        normalized += ' '
        mapped.push(columns[sourceIndex] ?? 0)
      }
      continue
    }
    const transformed = normalizeText(character)
    for (let index = 0; index < transformed.length; index++) {
      normalized += transformed[index]
      mapped.push(columns[sourceIndex] ?? 0)
    }
  }
  if (normalized.endsWith(' ')) { normalized = normalized.slice(0, -1); mapped.pop() }
  return { text: normalized, columns: mapped }
}

function fenceLocations(lines: string[]): Array<{ open: number; close: number }> {
  const result: Array<{ open: number; close: number }> = []
  let active: { open: number; marker: string; size: number } | null = null
  lines.forEach((line, index) => {
    const match = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (!match) return
    if (!active) active = { open: index, marker: match[1][0], size: match[1].length }
    else if (match[1][0] === active.marker && match[1].length >= active.size) {
      result.push({ open: active.open, close: index })
      active = null
    }
  })
  return result
}

function fuzzyScore(context: string, line: string, clicked: string): number {
  const contextTokens = new Set(normalizeText(context).split(/[^a-z0-9]+/).filter((token) => token.length > 2))
  const lineTokens = new Set(normalizeText(line).split(/[^a-z0-9]+/).filter((token) => token.length > 2))
  const union = new Set([...contextTokens, ...lineTokens])
  const intersection = [...contextTokens].filter((token) => lineTokens.has(token)).length
  const jaccard = union.size ? intersection / union.size : 0
  const phrase = normalizeText(clicked)
  return jaccard + (phrase && normalizeText(line).includes(phrase) ? 0.6 : 0)
}

export function locateSource(payload: SourceClickPayload, slide: SlideSourceRange | undefined, markdown: string, fallbackFile: string): SourceLocation {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const file = slide?.file || fallbackFile
  const first = Math.max(1, slide?.contentStartLine || slide?.startLine || payload.slideMeta?.start || 1)
  const last = Math.min(lines.length, slide?.endLine || lines.length)
  const from = first - 1
  const to = Math.max(from, last)
  const clicked = normalizeText(payload.clickedText || '')

  if (payload.kind === 'code' && payload.codeLine !== undefined) {
    const fences = fenceLocations(lines.slice(from, to))
    const block = fences[payload.codeBlockIndex || 0]
    if (block) {
      const line = Math.min(last, first + block.open + 1 + payload.codeLine)
      return { file, line, column: 1, length: 0, confidence: 'exact' }
    }
  }

  if (clicked) {
    const matches: SourceLocation[] = []
    for (let lineNo = from; lineNo < to; lineNo++) {
      const normalized = normalizeMarkdownLine(lines[lineNo])
      let cursor = 0
      while ((cursor = normalized.text.indexOf(clicked, cursor)) !== -1) {
        matches.push({ file, line: lineNo + 1, column: (normalized.columns[cursor] ?? 0) + 1, length: payload.clickedText.length, confidence: 'exact' })
        cursor += Math.max(1, clicked.length)
      }
    }
    if (matches.length) return matches[Math.min(payload.occurrenceIndex || 0, matches.length - 1)]
  }

  let best: { line: number; score: number; column: number } | null = null
  for (let lineNo = from; lineNo < to; lineNo++) {
    const score = fuzzyScore(payload.context || '', lines[lineNo], payload.clickedText || '')
    if (!best || score > best.score) {
      const plain = normalizeMarkdownLine(lines[lineNo]).text
      const phraseIndex = clicked ? plain.indexOf(clicked) : -1
      best = { line: lineNo + 1, score, column: phraseIndex >= 0 ? phraseIndex + 1 : 1 }
    }
  }
  if (best && best.score >= 0.2) return { file, line: best.line, column: best.column, length: payload.clickedText.length, confidence: 'fuzzy' }
  return { file, line: Math.min(first, lines.length), column: 1, length: 0, confidence: 'slide' }
}
