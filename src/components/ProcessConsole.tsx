import React, { useRef, useEffect, useState } from 'react'
import { Terminal, Trash2, Copy, Check, ChevronDown } from 'lucide-react'

export interface LogEntry {
  text: string
  type: 'stdout' | 'stderr'
  time?: string
  seq?: number
}

interface ProcessConsoleProps {
  logs: LogEntry[]
  onClear: () => void
  onClose?: () => void
}

export const ProcessConsole: React.FC<ProcessConsoleProps> = ({ logs, onClear, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState<boolean>(true)
  const [copied, setCopied] = useState<boolean>(false)
  const wasAtBottomRef = useRef(true)
  const visibleLogs = logs.slice(-500)

  useEffect(() => {
    if (autoScroll && wasAtBottomRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const handleScroll = () => {
    const container = containerRef.current
    if (!container) return
    wasAtBottomRef.current = container.scrollHeight - container.scrollTop - container.clientHeight < 48
  }

  const handleCopy = () => {
    const allText = logs.map((l) => (l.time ? `[${l.time}] ${l.text}` : l.text)).join('\n')
    navigator.clipboard.writeText(allText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 border-t border-slate-800 text-slate-300 font-mono text-xs">
      {/* Console Header */}
      <div className="app-chrome flex items-center justify-between px-3 py-1.5 bg-slate-900/90 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Terminal className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-semibold text-slate-300">Terminal & DevServer Logs</span>
          <span className="text-[11px] text-slate-500">({logs.length} dòng)</span>
        </div>

        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-blue-500 focus:ring-0 w-3 h-3"
            />
            Cuộn tự động
          </label>

          <button
            onClick={handleCopy}
            title="Sao chép toàn bộ log"
            className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Đã chép' : 'Chép'}</span>
          </button>

          <button
            onClick={onClear}
            title="Xoá màn hình console"
            className="flex items-center gap-1 px-2 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span>Xoá</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              title="Đóng console"
              className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Log lines container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto p-3 space-y-1 select-text"
        onScroll={handleScroll}
      >
        {logs.length === 0 ? (
          <div className="text-slate-600 italic">Chưa có log nào được ghi nhận.</div>
        ) : (
          visibleLogs.map((log, index) => (
            <div
              key={log.seq ?? `${log.time || ''}-${index}-${log.text.slice(0, 24)}`}
              className={`leading-relaxed break-all ${
                log.type === 'stderr'
                  ? 'text-rose-400'
                  : log.text.includes('ready in') || log.text.includes('http://localhost')
                  ? 'text-emerald-400 font-bold'
                  : 'text-slate-300'
              }`}
            >
              {log.time && <span className="text-slate-600 mr-2 select-none">[{log.time}]</span>}
              {log.text}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
