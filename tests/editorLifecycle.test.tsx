// @vitest-environment jsdom
import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../shared/settings'

vi.mock('../src/monaco', () => ({}))
const io = vi.hoisted(() => ({ readFile: vi.fn(), writeFile: vi.fn() }))
vi.mock('../src/ipc-client', () => ({ default: { fs: io } }))
vi.mock('@monaco-editor/react', () => ({
  default: (props: any) => (
    <textarea
      aria-label="editor"
      data-model-path={props.path}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    />
  )
}))
import { EditorPane, type EditorPaneHandle } from '../src/components/EditorPane'

const settings = { ...DEFAULT_SETTINGS.editor, autoSave: 'off' as const }
const props = { settings, appThemeId: 'studio-dark', flashMs: 1000 }
beforeEach(() => {
  io.readFile.mockReset().mockImplementation(async (p: string) => (p.endsWith('a.md') ? '# A' : '# B'))
  io.writeFile.mockReset().mockResolvedValue(true)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('document lifecycle', () => {
  it('locks team interaction while still flushing the authorized draft before Git runs', async () => {
    const ref = React.createRef<EditorPaneHandle>()
    const ui = render(<EditorPane {...props} ref={ref} projectRoot="/busy" filePath="/busy/a.md" />)
    await waitFor(() => expect((screen.getByLabelText('editor') as HTMLTextAreaElement).value).toBe('# A'))
    fireEvent.change(screen.getByLabelText('editor'), { target: { value: '# team draft' } })
    ui.rerender(<EditorPane {...props} ref={ref} projectRoot="/busy" filePath="/busy/a.md" interactionLocked />)
    fireEvent.change(screen.getByLabelText('editor'), { target: { value: '# late edit' } })
    await act(async () => ref.current!.flush())
    expect(io.writeFile.mock.calls).toEqual([['/busy/a.md', '# team draft']])
    expect((screen.getByLabelText('editor') as HTMLTextAreaElement).value).toBe('# team draft')
  })
  it('uses one Monaco model URI for mixed Windows path separators and casing', async () => {
    const ui = render(<EditorPane {...props} filePath="C:\\Project/a.md" />)
    await screen.findByLabelText('editor')
    const before = screen.getByLabelText('editor').getAttribute('data-model-path')
    expect(before).toBe('c:/project/a.md')
    ui.rerender(<EditorPane {...props} filePath="c:/project\\a.md" />)
    await waitFor(() => expect(screen.getByLabelText('editor').getAttribute('data-model-path')).toBe(before))
  })
  it('does not silently save when autosave is off and a file is switched', async () => {
    const ui = render(<EditorPane {...props} filePath="/project/a.md" />)
    await waitFor(() => expect((screen.getByLabelText('editor') as HTMLTextAreaElement).value).toBe('# A'))
    fireEvent.change(screen.getByLabelText('editor'), { target: { value: '# Draft A' } })
    ui.rerender(<EditorPane {...props} filePath="/project/b.md" />)
    await waitFor(() => expect((screen.getByLabelText('editor') as HTMLTextAreaElement).value).toBe('# B'))
    expect(io.writeFile).not.toHaveBeenCalled()
    ui.rerender(<EditorPane {...props} filePath="/project/a.md" />)
    await waitFor(() => expect((screen.getByLabelText('editor') as HTMLTextAreaElement).value).toBe('# Draft A'))
  })
  it('keeps an unsaved draft on unmount without writing it', async () => {
    const ui = render(<EditorPane {...props} filePath="/unmount/a.md" />)
    await screen.findByLabelText('editor')
    fireEvent.change(screen.getByLabelText('editor'), { target: { value: 'draft' } })
    ui.unmount()
    await act(async () => {})
    expect(io.writeFile).not.toHaveBeenCalled()
  })
  it('ignores a stale read when another file has been selected', async () => {
    let finish!: (value: string) => void
    io.readFile.mockImplementation((p: string) =>
      p.includes('late-a')
        ? new Promise<string>((r) => {
            finish = r
          })
        : Promise.resolve('# B')
    )
    const ui = render(<EditorPane {...props} filePath="/project/late-a.md" />)
    ui.rerender(<EditorPane {...props} filePath="/project/late-b.md" />)
    await screen.findByLabelText('editor')
    await act(async () => finish('# Late A'))
    expect((screen.getByLabelText('editor') as HTMLTextAreaElement).value).toBe('# B')
  })
  it('an older save acknowledgement cannot mark newer content clean', async () => {
    let finish!: () => void
    io.writeFile.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          finish = r
        })
    )
    render(<EditorPane {...props} filePath="/revision/a.md" />)
    await screen.findByLabelText('editor')
    fireEvent.change(screen.getByLabelText('editor'), { target: { value: 'v1' } })
    fireEvent.click(screen.getByTitle('Lưu thủ công (Cmd+S / Ctrl+S)'))
    await waitFor(() => expect(io.writeFile).toHaveBeenCalled())
    fireEvent.change(screen.getByLabelText('editor'), { target: { value: 'v2' } })
    await act(async () => finish())
    expect(screen.getByTitle('Có thay đổi chưa ghi')).toBeTruthy()
    expect((screen.getByLabelText('editor') as HTMLTextAreaElement).value).toBe('v2')
  })
})
