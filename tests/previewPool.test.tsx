// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
vi.mock('../src/components/PreviewPane', () => ({
  PreviewPane: React.forwardRef((p: any, _r) => <div data-testid="guest">{p.url}</div>)
}))
import { PreviewPool } from '../src/components/PreviewPool'
afterEach(cleanup)
it('keeps at most two previews and evicts the least recently used project', () => {
  const tabs = ['a', 'b', 'c'].map((id) => ({
    project: { id, name: id, path: `/${id}`, entryFiles: ['slides.md'] },
    activeEntryFile: 'slides.md',
    activeFilePath: `/${id}/slides.md`,
    status: 'running',
    serverUrl: `http://localhost:3030/${id}`,
    logs: []
  })) as any
  const props = { tabs, visible: true, status: 'running' as const, onRetry: () => {}, onOpenConsole: () => {} }
  const ui = render(<PreviewPool {...props} projectId="a" url={tabs[0].serverUrl} />)
  ui.rerender(<PreviewPool {...props} projectId="b" url={tabs[1].serverUrl} />)
  expect(screen.getAllByTestId('guest')).toHaveLength(2)
  ui.rerender(<PreviewPool {...props} projectId="c" url={tabs[2].serverUrl} />)
  expect(screen.getAllByTestId('guest')).toHaveLength(2)
  expect(screen.queryByText(tabs[0].serverUrl)).toBeNull()
})
