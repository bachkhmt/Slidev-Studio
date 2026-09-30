import React, { useState } from 'react'
import { Folder, Play, Trash2, ExternalLink, FileText, Clock, MoreHorizontal, Copy, Loader2 } from 'lucide-react'
import type { ProjectItem } from '../ipc-client'
import api from '../ipc-client'

interface ProjectCardProps {
  project: ProjectItem
  onOpen: (project: ProjectItem) => void
  onRemove: (id: string) => void
  onUpdateProject: (project: ProjectItem) => void
  onClone: (project: ProjectItem) => void
  cloning?: boolean
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)

    if (diffDay > 30) return date.toLocaleDateString()
    if (diffDay > 0) return `${diffDay} ngày trước`
    if (diffHour > 0) return `${diffHour} giờ trước`
    if (diffMin > 0) return `${diffMin} phút trước`
    return 'Vừa xong'
  } catch {
    return dateString
  }
}

export const ProjectCard: React.FC<ProjectCardProps> = ({ project, onOpen, onRemove, onUpdateProject, onClone, cloning = false }) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const [port, setPort] = useState(project.preferredPort ? String(project.preferredPort) : '')
  const handleShowInFolder = (e: React.MouseEvent) => {
    e.stopPropagation()
    api.fs.showInFolder(project.path)
  }

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(`Bạn có chắc muốn xoá dự án "${project.name}" và chuyển toàn bộ thư mục này vào Thùng rác không?\n\n${project.path}\n\nBạn có thể khôi phục thư mục từ Thùng rác.`)) {
      onRemove(project.id)
    }
  }

  const handleSavePort = async (event: React.MouseEvent) => {
    event.stopPropagation()
    const value = port.trim() ? Number(port) : undefined
    if (value !== undefined && (!Number.isInteger(value) || value < 1024 || value > 65535)) return
    const updated = await api.projects.updateProject(project.id, { preferredPort: value })
    if (updated) onUpdateProject(updated)
    setMenuOpen(false)
  }

  return (
    <div
      onClick={() => onOpen(project)}
      className="group relative flex flex-col justify-between p-5 bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800/80 hover:border-blue-500/50 rounded-xl cursor-pointer transition-all duration-200 shadow-lg hover:shadow-blue-500/10 hover:-translate-y-0.5"
    >
      <div>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 transition-colors">
              <Folder className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-base text-slate-100 truncate group-hover:text-blue-400 transition-colors">
              {project.name}
            </h3>
          </div>

          <div className="relative flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
            <button onClick={(event) => { event.stopPropagation(); setPort(project.preferredPort ? String(project.preferredPort) : ''); setMenuOpen((open) => !open) }} title="Tùy chọn dự án" className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-700 hover:text-slate-200"><MoreHorizontal className="h-4 w-4" /></button>
            {menuOpen && <div onClick={(event) => event.stopPropagation()} className="absolute right-0 top-8 z-30 w-56 rounded-xl border border-slate-700 bg-slate-900 p-3 opacity-100 shadow-xl"><label className="text-[11px] text-slate-400">Cổng riêng (trống = mặc định)</label><input type="number" min="1024" max="65535" value={port} onChange={(event) => setPort(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 font-mono text-xs text-slate-100" /><div className="mt-2 flex justify-end"><button onClick={handleSavePort} className="rounded bg-blue-600 px-2.5 py-1 text-xs text-white">Lưu</button></div></div>}
            <button
              onClick={(event) => { event.stopPropagation(); onClone(project) }}
              disabled={cloning}
              aria-label="Tạo bản sao để chỉnh sửa trên cổng riêng"
              title="Tạo bản sao để chỉnh sửa trên cổng riêng"
              className="p-1.5 rounded-md hover:bg-blue-500/20 text-slate-400 hover:text-blue-300 transition-colors disabled:opacity-50"
            >
              {cloning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              onClick={handleShowInFolder}
              title="Mở thư mục trong Finder / Explorer"
              className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
            <button
              onClick={handleRemove}
              title="Xoá dự án và chuyển thư mục vào Thùng rác"
              className="p-1.5 rounded-md hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-400 truncate mb-4 font-mono" title={project.path}>
          {project.path}
        </p>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            <FileText className="w-3 h-3 text-blue-400" />
            {project.entryFiles.length === 1
              ? project.entryFiles[0]
              : `${project.entryFiles.length} file trình chiếu`}
          </span>

          {project.preferredPort && (
            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              Port: {project.preferredPort}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatRelativeTime(project.lastOpenedAt)}
        </span>

        <button
          onClick={() => onOpen(project)}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-slate-50 font-medium text-xs transition-colors"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          Mở Slidev
        </button>
      </div>
    </div>
  )
}
