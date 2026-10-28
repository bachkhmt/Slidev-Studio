// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FileTree } from '../src/components/FileTree'
const list = vi.hoisted(() =>
  vi.fn(async () => [{ name: 'child.md', path: '/root/folder/child.md', isDirectory: false }])
)
vi.mock('../src/ipc-client', () => ({ default: { fs: { listDirectory: list } } }))
afterEach(cleanup)
it('keeps folders collapsed and loads their contents only on expansion', async () => {
  render(
    <FileTree
      nodes={[
        {
          name: 'folder',
          path: '/root/folder',
          isDirectory: true,
          children: [{ name: 'child.md', path: '/root/folder/child.md', isDirectory: false }]
        }
      ]}
      onRefresh={() => {}}
      onSelectFile={() => {}}
    />
  )
  expect(screen.queryByText('child.md')).toBeNull()
  expect(list).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('folder'))
  expect(await screen.findByText('child.md')).toBeTruthy()
})
