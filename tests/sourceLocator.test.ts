import { describe, expect, it } from 'vitest'
import { locateSource } from '../src/lib/sourceLocator'
import type { SourceClickPayload } from '../shared/preview-bridge'
import type { SlideSourceRange } from '../src/lib/slideIndex'

const markdown = [
  '# Heading phrase',
  '- List phrase',
  '',
  '| Name | Value |',
  '| --- | --- |',
  '| Cell phrase | 42 |',
  '',
  '```ts',
  'console.log("code phrase")',
  '```',
  '',
  'Formula $inline math phrase$'
].join('\n')
const file = '/tmp/slides.md'
const slide: SlideSourceRange = { no: 1, startLine: 1, contentStartLine: 1, endLine: 12, file }

function payload(clickedText: string, kind: SourceClickPayload['kind'], extra: Partial<SourceClickPayload> = {}): SourceClickPayload {
  return { slideNo: 1, clickedText, context: clickedText, occurrenceIndex: 0, kind, ...extra }
}

describe('locateSource', () => {
  it.each([
    ['heading', 'Heading phrase', 'heading', 1],
    ['list item', 'List phrase', 'list', 2],
    ['table cell', 'Cell phrase', 'table', 6],
    ['inline math sentence', 'inline math phrase', 'text', 12]
  ] as const)('locates %s', (_label, phrase, kind, expectedLine) => {
    expect(locateSource(payload(phrase, kind), slide, markdown, file)).toMatchObject({ file, line: expectedLine, confidence: 'exact' })
  })

  it('locates a line in a fenced code block by code metadata', () => {
    expect(locateSource(payload('code phrase', 'code', { codeLine: 0, codeBlockIndex: 0 }), slide, markdown, file)).toMatchObject({ file, line: 9, confidence: 'exact' })
  })
})
