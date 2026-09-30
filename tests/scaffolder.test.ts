import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { renderTemplate } from '../electron/services/templateRender'

const template = `---
title: '{{TITLE}}'
author: '{{AUTHOR}}'
date: '{{DATE}}'
info: |
  ## {{TITLE}}
---

# {{TITLE}}
Tác giả: {{AUTHOR}}
`

describe('renderTemplate', () => {
  it.each([
    "Cây 'AI' của tôi",
    'A < B',
    '{{x}}',
    'Giá $& thêm',
    'Giá $$ lớn',
    'Nói "xin chào"',
    'Dòng: có hai chấm'
  ])('keeps %s as a valid YAML scalar and escapes body text', (value) => {
    const rendered = renderTemplate(template, { title: value, author: value, date: '2026/09/29' })
    const frontmatter = rendered.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1]
    expect(frontmatter).toBeTruthy()
    const parsed = parse(frontmatter!) as Record<string, unknown>
    expect(parsed.title).toBe(value)
    expect(parsed.author).toBe(value)
    expect(parsed.date).toBe('2026/09/29')
    const body = rendered.slice(rendered.indexOf('\n---', 4) + 4)
    expect(body).not.toContain('<')
    expect(body).not.toContain('{{')
    expect(body).not.toContain('}}')
    expect(body).toContain(value.includes('<') || value.includes('{{') || value.includes('}}') ? '&' : value)
  })
})
