import { describe, expect, it } from 'vitest'
import { CompileErrorAggregator } from '../electron/services/compileErrorParser'

function collect(lines: string[]) {
  const parser = new CompileErrorAggregator()
  return [...lines.flatMap((line) => parser.push(line)), ...parser.flush()]
}

describe('CompileErrorAggregator', () => {
  it('collects Vue compiler details and identifies a virtual slide source', () => {
    const events = collect([
      'Internal server error: Element is missing end tag.',
      'Plugin: vite:vue',
      'File: /work/slides.md__slidev_5.md:12:3',
      '  10 | <Block>',
      '  11 |   content',
      '  12 | </div>',
      ''
    ])
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'error', file: '/work/slides.md', line: 12, column: 3, slideNo: 5 })
    expect((events[0] as { summary: string }).summary).toContain('Element is missing end tag')
  })

  it('collects YAML frontmatter errors', () => {
    const events = collect([
      '[vite] Internal server error: YAMLException: bad indentation',
      'Plugin: vite:vue',
      'File: /work/slides.md__slidev_1.md:3:7',
      '  2 | title: test',
      '  3 |   author: name',
      ''
    ])
    expect(events[0]).toMatchObject({ type: 'error', slideNo: 1, file: '/work/slides.md', line: 3, column: 7 })
  })

  it('collects unresolved import errors', () => {
    const events = collect([
      'Failed to resolve import "./Missing.vue" from "slides.md".',
      'Plugin: vite:import-analysis',
      'File: /work/slides.md:8:4',
      ''
    ])
    expect(events[0]).toMatchObject({ type: 'error', file: '/work/slides.md', line: 8, column: 4 })
  })

  it('emits a success event for page reload', () => {
    const parser = new CompileErrorAggregator()
    expect(parser.push('[vite] page reload slides.md')).toEqual([{ type: 'ok' }])
  })
})
