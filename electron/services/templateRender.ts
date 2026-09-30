export interface TemplateValues {
  title: string
  author: string
  date: string
}

const PLACEHOLDERS = /\{\{(TITLE|AUTHOR|DATE)\}\}/g

function valueFor(values: TemplateValues, key: string): string {
  return values[key.toLowerCase() as keyof TemplateValues]
}

function yamlString(value: string): string {
  return JSON.stringify(value)
}

function escapeVueText(value: string): string {
  return value.replace(/</g, '&lt;').replace(/\{\{/g, '&#123;&#123;').replace(/\}\}/g, '&#125;&#125;')
}

export function renderTemplate(content: string, values: TemplateValues): string {
  const normalized = content.replace(/\r\n/g, '\n')
  const match = normalized.match(/^(---\n)([\s\S]*?)(\n---(?:\n|$))/)
  if (!match) {
    return normalized.replace(PLACEHOLDERS, (_placeholder, key: string) => escapeVueText(valueFor(values, key)))
  }

  const frontmatter = match[2].replace(/(['"])\{\{(TITLE|AUTHOR|DATE)\}\}\1/g, (_placeholder, _quote: string, key: string) => yamlString(valueFor(values, key)))
    .replace(PLACEHOLDERS, (_placeholder, key: string) => yamlString(valueFor(values, key)))
  const body = normalized.slice(match[0].length).replace(PLACEHOLDERS, (_placeholder, key: string) => escapeVueText(valueFor(values, key)))
  return `${match[1]}${frontmatter}${match[3]}${body}`
}
