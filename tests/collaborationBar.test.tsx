// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/settings'
import { DocumentStore } from '../src/state/documentStore'
const api = vi.hoisted(() => ({
  inspect: vi.fn(),
  selectSection: vi.fn(),
  previewEntry: vi.fn(),
  saveDraft: vi.fn(),
  sync: vi.fn(),
  submit: vi.fn()
}))
vi.mock('../src/ipc-client', () => ({ default: { collab: api } }))
vi.mock('../src/components/GitHubLogin', () => ({
  GitHubLogin: (props: any) => {
    const callback = React.useRef(props.onAccount)
    callback.current = props.onAccount
    React.useEffect(() => {
      callback.current?.({ login: 'alice', clientId: 'fixture' })
    }, [])
    return null
  }
}))
import { CollaborationBar } from '../src/components/CollaborationBar'
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
const manifest = {
  title: 'Team',
  coordinator: 'leader',
  mainBranch: 'main',
  branchPattern: 'feature/{owner}-{sectionId}',
  sections: [
    { id: 'intro', file: 'sections/intro.md', owner: 'alice' },
    { id: 'analysis', file: 'sections/analysis.md', owner: 'bob' }
  ]
}
const status = (sectionId: string | null) => ({
  manifest,
  sectionId,
  branch: sectionId ? 'feature/alice-intro' : 'main',
  changedFiles: [],
  forbiddenFiles: [],
  conflicts: [],
  merging: false,
  ahead: 0,
  behindMain: 0,
  mergedSections: []
})
it('selects the assigned section from a clean read-only main file before previewing it', async () => {
  const io = { readFile: vi.fn(async () => '# shared'), writeFile: vi.fn(async () => {}) },
    docs = new DocumentStore(io)
  docs.configure({ ...DEFAULT_SETTINGS.editor, autoSave: 'off' })
  await docs.load('/team/slides.md')
  docs.setWritable('/team/slides.md', false)
  let current = status(null)
  api.inspect.mockImplementation(async () => current)
  api.selectSection.mockImplementation(async () => {
    current = status('intro')
    return current
  })
  api.previewEntry.mockResolvedValue('.slidev-collab-intro.md')
  const preview = vi.fn()
  render(
    <CollaborationBar
      projectId="team"
      flush={() => docs.flushProject('/team')}
      onStatus={() => {}}
      onAccount={() => {}}
      onBusy={() => {}}
      onReload={() => {}}
      onExport={() => {}}
      onPreview={preview}
    />
  )
  const select = await screen.findByRole('combobox', { name: 'Phần phụ trách' })
  await waitFor(() => expect((select as HTMLSelectElement).disabled).toBe(false))
  fireEvent.change(select, { target: { value: 'intro' } })
  await waitFor(() => expect(api.selectSection).toHaveBeenCalledWith('team', 'intro'))
  await waitFor(() => expect(preview).toHaveBeenCalledWith('.slidev-collab-intro.md', 'sections/intro.md'))
  expect(io.writeFile).not.toHaveBeenCalled()
  docs.reset()
})
