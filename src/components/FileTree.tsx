import React, { useState } from 'react'
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

const TreeNode: React.FC<{
  node: FileNode
  depth?: number
  activeFilePath?: string
  onSelectFile: (filePath: string) => void
}> = ({ node, depth = 0, activeFilePath, onSelectFile }) => {
  const [isOpen, setIsOpen] = useState(true)

  if (node.isDirectory) {
    return (
      <div>
        <div
          onClick={() => setIsOpen(!isOpen)}
          style={{ paddingLeft: `${depth * 14 + 8}px` }}
          className="flex items-center gap-1.5 py-1.5 pr-2 rounded-md hover:bg-slate-800/70 text-slate-300 hover:text-slate-100 cursor-pointer text-xs select-none transition-colors"
        >
          {isOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          )}
          {isOpen ? (
            <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
          ) : (
            <Folder className="w-4 h-4 text-amber-400/80 shrink-0" />
          )}
          <span className="truncate font-medium">{node.name}</span>
        </div>

        {isOpen && node.children && (
          <div>
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                activeFilePath={activeFilePath}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  const isActive = activeFilePath === node.path

  return (
    <div
      onClick={() => onSelectFile(node.path)}
      style={{ paddingLeft: `${depth * 14 + 20}px` }}
      className={`flex items-center gap-2 py-1.5 pr-2 rounded-md cursor-pointer text-xs select-none transition-colors ${
        isActive
          ? 'bg-blue-600/20 text-blue-400 font-semibold border-l-2 border-blue-500'
          : 'text-slate-300 hover:bg-slate-800/60 hover:text-slate-100'
      }`}
      title={node.path}
    >
      {getFileIcon(node.name)}
      <span className="truncate">{node.name}</span>
    </div>
  )
}

export const FileTree: React.FC<FileTreeProps> = ({ nodes, activeFilePath, onSelectFile, onRefresh }) => {
  return (
    <div className="flex flex-col h-full bg-slate-950/70 border-r border-slate-800/80 text-slate-200">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400">
        <span>Tài nguyên dự án</span>
        <button
          onClick={onRefresh}
          title="Làm mới danh sách file"
          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
        {nodes.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500">Không có file nào</div>
        ) : (
          nodes.map((node) => (
            <TreeNode
              key={node.path}
              node={node}
              activeFilePath={activeFilePath}
              onSelectFile={onSelectFile}
            />
          ))
        )}
      </div>
    </div>
  )
}
