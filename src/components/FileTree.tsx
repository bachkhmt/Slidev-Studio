import React, { useState, useEffect } from 'react'
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  File,
  Image as ImageIcon,
  ChevronRight,
  ChevronDown,
  RefreshCw
} from 'lucide-react'
import api from '../ipc-client'
import { VirtualRows } from './VirtualRows'
import type { FileNode } from '../ipc-client'

interface FileTreeProps {
  nodes: FileNode[]
  activeFilePath?: string
  onSelectFile: (filePath: string) => void
  onRefresh: () => void
}

function getFileIcon(name: string): React.ReactNode {
  const lower = name.toLowerCase()
  if (lower.endsWith('.md')) {
    return <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
  }
  if (lower.endsWith('.vue')) {
    return <FileCode className="w-4 h-4 text-emerald-500 shrink-0" />
  }
  if (lower.endsWith('.ts') || lower.endsWith('.js') || lower.endsWith('.json')) {
    return <FileCode className="w-4 h-4 text-amber-400 shrink-0" />
  }
  if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.svg') || lower.endsWith('.webp')) {
    return <ImageIcon className="w-4 h-4 text-purple-400 shrink-0" />
  }
  return <File className="w-4 h-4 text-slate-400 shrink-0" />
}

export const FileTree: React.FC<FileTreeProps> = ({ nodes, activeFilePath, onSelectFile, onRefresh }) => {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [children, setChildren] = useState<Record<string, FileNode[]>>({})
  const [error, setError] = useState('')
  const version = React.useRef(0)
  useEffect(() => {
    version.current++
    setChildren({})
    setExpanded(new Set())
  }, [nodes])
  const rows: Array<{ node: FileNode; depth: number }> = []
  const walk = (items: FileNode[], depth: number) => {
    for (const node of items) {
      rows.push({ node, depth })
      if (node.isDirectory && expanded.has(node.path)) walk(children[node.path] || [], depth + 1)
    }
  }
  walk(nodes, 0)
  const toggle = async (node: FileNode) => {
    if (!node.isDirectory) {
      onSelectFile(node.path)
      return
    }
    if (expanded.has(node.path)) {
      setExpanded((old) => {
        const next = new Set(old)
        next.delete(node.path)
        return next
      })
      return
    }
    const requestVersion = version.current
    try {
      if (!children[node.path]) {
        const loaded = await api.fs.listDirectory(node.path)
        if (requestVersion !== version.current) return
        setChildren((old) => ({ ...old, [node.path]: loaded }))
      }
      setExpanded((old) => new Set([...old, node.path]))
      setError('')
    } catch (e: any) {
      setError(e.message || 'Không thể mở thư mục')
    }
  }
  return (
    <div className="flex flex-col h-full bg-slate-950/70 border-r border-slate-800/80 text-slate-200">
      <div className="flex justify-between px-3 py-2.5 border-b border-slate-800 text-xs text-slate-400">
        <span>Tài nguyên dự án</span>
        <button onClick={onRefresh} title="Làm mới danh sách file">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      {error && (
        <div role="alert" className="p-2 text-xs text-rose-400">
          {error}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <VirtualRows
          label="Tài nguyên dự án"
          items={rows}
          render={({ node, depth }) => (
            <button
              aria-label={node.name}
              aria-expanded={node.isDirectory ? expanded.has(node.path) : undefined}
              onClick={() => void toggle(node)}
              title={node.path}
              style={{ paddingLeft: depth * 14 + 8 }}
              className={`flex w-full h-7 items-center gap-1.5 pr-2 text-xs text-left rounded hover:bg-slate-800 ${activeFilePath === node.path ? 'bg-blue-600/20 text-blue-400' : 'text-slate-300'}`}
            >
              {node.isDirectory ? (
                <>
                  <span>{expanded.has(node.path) ? '▾' : '▸'}</span>
                  <Folder className="w-4 h-4 text-amber-400 shrink-0" />
                </>
              ) : (
                getFileIcon(node.name)
              )}
              <span className="truncate">{node.name}</span>
            </button>
          )}
        />
      </div>
    </div>
  )
}
