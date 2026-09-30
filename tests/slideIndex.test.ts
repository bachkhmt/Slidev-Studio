import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { parseSlideIndex } from '../src/lib/slideIndex'

describe('parseSlideIndex', () => {
  it.each([
    ['default', 'electron/templates/default/slides.md', 3],
    ['frankfurt-academic', 'electron/templates/frankfurt-academic/slides.md', 5],
    ['hcmut-bach', 'electron/templates/hcmut-bach/slides.md', 5]
  ])('indexes all slides in %s', (_name, file, expectedCount) => {
    const sourcePath = path.resolve(process.cwd(), file)
    const markdown = fs.readFileSync(sourcePath, 'utf8')
    const index = parseSlideIndex(markdown, sourcePath)
    expect(index).toHaveLength(expectedCount)
    expect(index[0]).toMatchObject({ no: 1, file: sourcePath })
    expect(index.at(-1)?.no).toBe(expectedCount)
  })
})
