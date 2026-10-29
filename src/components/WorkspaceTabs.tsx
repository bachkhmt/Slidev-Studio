import { isReportKind } from '../../shared/projectKinds'
import React from 'react'
import { ArrowLeft, FileText, X } from 'lucide-react'
import type { OpenTab } from '../pages/ProjectWorkspace'

export function WorkspaceTabs({
  tabs,
  activeId,
  onSelect,
  onClose,
  onHome
}: {
  tabs: OpenTab[]
  activeId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onHome: () => void
}) {
  return (
    <div
      role="tablist"
      aria-label="Dự án đang mở"
      className="app-chrome flex items-center bg-slate-900 border-b border-slate-800 px-2 pt-1.5 gap-1 overflow-x-auto select-none"
    >
      <button
        onClick={onHome}
        title="Về màn hình chính (Home Dashboard)"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg bg-slate-800/50 hover:bg-slate-800 text-slate-400 text-xs mr-1 shrink-0"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Home
      </button>
      {tabs.map((tab) => (
        <div
          key={tab.project.id}
          role="tab"
          aria-label={tab.project.name}
          aria-selected={tab.project.id === activeId}
          tabIndex={0}
          onClick={() => onSelect(tab.project.id)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onSelect(tab.project.id)
            }
          }}
          className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs cursor-pointer border-t-2 shrink-0 max-w-[220px] ${tab.project.id === activeId ? 'bg-slate-950 border-blue-500 text-slate-100' : 'border-transparent text-slate-400 hover:bg-slate-800/60'}`}
        >
          {isReportKind(tab.project.kind) ? (
            <FileText className="h-3.5 w-3.5 text-blue-400" />
          ) : (
            <span
              className={`h-2 w-2 rounded-full ${tab.status === 'running' ? 'bg-emerald-400' : tab.status === 'starting' || tab.status === 'installing' ? 'bg-amber-400 animate-pulse' : tab.status === 'error' ? 'bg-rose-400' : 'bg-slate-600'}`}
            />
          )}
          <span className="truncate">{tab.project.name}</span>
          {tab.serverPort && <span className="text-[10px] text-slate-500 font-mono">:{tab.serverPort}</span>}
          <button
            title="Đóng tab này"
            onClick={(event) => {
              event.stopPropagation()
              onClose(tab.project.id)
            }}
            className="rounded p-0.5 text-slate-400 hover:bg-slate-800"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )
}
