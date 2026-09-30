import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { checkSlideMarkdown } from '../src/lib/markdownGuard'

describe('checkSlideMarkdown', () => {
  it('finds invalid YAML frontmatter', () => {
    expect(checkSlideMarkdown("---\ntitle: 'unfinished\n---\n\n# Slide")).toMatchObject({ ok: false, line: 2 })
  })

  it('pauses autosave while frontmatter is still open', () => {
    expect(checkSlideMarkdown('---\ntitle: unfinished')).toMatchObject({ ok: false, line: 1, reason: 'Frontmatter chưa được đóng bằng ---' })
  })

  it('finds an unclosed code fence', () => {
    expect(checkSlideMarkdown('# Slide\n\n```ts\nconst value = 1')).toMatchObject({ ok: false, line: 3, reason: 'Code fence chưa được đóng' })
  })

  it('finds an unclosed display math block', () => {
    expect(checkSlideMarkdown('# Slide\n$$\nx + y')).toMatchObject({ ok: false, line: 2, reason: 'Khối công thức $$ chưa được đóng' })
  })

  it('finds an unclosed PascalCase component', () => {
    expect(checkSlideMarkdown('# Slide\n\n<Block type="alert">\nText')).toMatchObject({ ok: false, line: 3, reason: 'Thẻ <Block> chưa được đóng' })
  })

  it('ignores tags in code fences and inline comparison text', () => {
    expect(checkSlideMarkdown('```html\n<Block>\n```\n\n`a < b`')).toEqual({ ok: true })
  })

  it.each([
    ['default', 'electron/templates/default/slides.md'],
    ['HCMUT project starter', 'electron/templates/hcmut-bach/slides.md']
  ])('accepts the %s deck', (_label, file) => {
    const markdown = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')
    expect(checkSlideMarkdown(markdown)).toEqual({ ok: true })
  })
})
