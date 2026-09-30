import React, { useState, useEffect } from 'react'
import {
  FileText,
  Image as ImageIcon,
  FileCode,
  Layers,
  FolderOpen,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Boxes,
  Wrench
} from 'lucide-react'
import api from '../ipc-client'
import type { ExportBatchResult, ExportFormat, ExportOptions } from '../env'

interface ExportDialogProps {
  collaborationProjectId?: string
  isOpen: boolean
  onClose: () => void
  projectPath: string
  entryFiles: string[]
  currentEntryFile: string
  defaultFormat: ExportFormat
  defaultOptions: ExportOptions
  outputDir: string
  openFolderAfterExport: boolean
}

interface BatchProgress {
  current: number
  total: number
  file: string
}

const formats: Array<{
  id: ExportFormat
  title: string
  desc: string
  icon: React.ReactNode
}> = [
  {
    id: 'pdf',
    title: 'PDF Document',
    desc: 'In slide sang file PDF chất lượng cao',
    icon: <FileText className="w-5 h-5 text-rose-400" />
  },
  {
    id: 'pptx',
    title: 'PowerPoint (PPTX)',
    desc: 'Mỗi slide được giữ nguyên dưới dạng ảnh',
    icon: <Layers className="w-5 h-5 text-amber-400" />
  },
  {
    id: 'pptx-editable',
    title: 'PowerPoint có thể sửa',
    desc: 'Văn bản và hình khối thành phần tử PowerPoint',
    icon: <Boxes className="w-5 h-5 text-orange-300" />
  },
  {
    id: 'png',
    title: 'Hình ảnh PNG',
    desc: 'Xuất từng trang slide thành ảnh PNG',
    icon: <ImageIcon className="w-5 h-5 text-purple-400" />
  },
  {
    id: 'md',
    title: 'Markdown',
    desc: 'Tệp Markdown kèm ảnh của từng slide',
    icon: <FileCode className="w-5 h-5 text-cyan-400" />
  },
  {
    id: 'build',
    title: 'Static Web (dist)',
    desc: 'Build trang web tĩnh HTML/CSS/JS để deploy',
    icon: <FileCode className="w-5 h-5 text-blue-400" />
  }
]

export const ExportDialog: React.FC<ExportDialogProps> = ({
  collaborationProjectId,
  isOpen,
  onClose,
  projectPath,
  entryFiles,
  currentEntryFile,
  defaultFormat,
  defaultOptions,
  outputDir,
  openFolderAfterExport
}) => {
  const [format, setFormat] = useState<ExportFormat>('pdf')
  const [selectedEntry, setSelectedEntry] = useState<string>(currentEntryFile)
  const [exportAll, setExportAll] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [resultPath, setResultPath] = useState<string | null>(null)
  const [batchResults, setBatchResults] = useState<ExportBatchResult[]>([])
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [depsState, setDepsState] = useState<'checking' | 'missing' | 'ready' | 'installing' | 'failed'>('checking')
  const [range, setRange] = useState('')
  const [dark, setDark] = useState(false)
  const [withClicks, setWithClicks] = useState(false)
  const [omitBackground, setOmitBackground] = useState(false)
  const [timeoutSeconds, setTimeoutSeconds] = useState('')

  useEffect(() => {
    setSelectedEntry(currentEntryFile)
  }, [currentEntryFile])

  useEffect(() => {
    if (!isOpen) return
    setFormat(collaborationProjectId && !['pdf', 'pptx', 'build'].includes(defaultFormat) ? 'pdf' : defaultFormat)
    if (collaborationProjectId) setExportAll(false)
    setRange(defaultOptions.range || '')
    setDark(!!defaultOptions.dark)
    setWithClicks(!!defaultOptions.withClicks)
    setOmitBackground(!!defaultOptions.omitBackground)
    setTimeoutSeconds(defaultOptions.timeout ? String(Math.ceil(defaultOptions.timeout / 1000)) : '')
  }, [collaborationProjectId, isOpen, defaultFormat, defaultOptions.range, defaultOptions.dark, defaultOptions.withClicks, defaultOptions.omitBackground, defaultOptions.timeout])

  useEffect(() => {
    if (!isOpen) {
      setLogs([])
      setResultPath(null)
      setBatchResults([])
      setBatchProgress(null)
      setError(null)
      setIsExporting(false)
      return
    }

    let mounted = true
    setDepsState('checking')
    api.export.checkDeps(projectPath)
      .then(({ ok }) => { if (mounted) setDepsState(ok ? 'ready' : 'missing') })
      .catch(() => { if (mounted) setDepsState('failed') })
    return () => { mounted = false }
  }, [isOpen, projectPath])

  useEffect(() => {
    const cleanupLog = api.export.onLog((text) => {
      if (text) setLogs((prev) => [...prev, text])
    })
    const cleanupProgress = api.export.onBatchProgress((progress) => setBatchProgress(progress))
    return () => {
      cleanupLog()
      cleanupProgress()
    }
  }, [])

  if (!isOpen) return null

  const handleStartExport = async () => {
    setIsExporting(true)
    setError(null)
    setResultPath(null)
    setBatchResults([])
    setBatchProgress(null)
    const files = exportAll ? entryFiles : [selectedEntry]
    setLogs([`Bắt đầu xuất ${exportAll ? `${files.length} file` : selectedEntry} sang ${format.toUpperCase()}...`])

    try {
      if (format !== 'build') {
        const { ok } = await api.export.checkDeps(projectPath)
        if (!ok) {
          setDepsState('missing')
          throw new Error('Cần cài playwright-chromium trước khi xuất định dạng này. Hãy bấm “Cài ngay” rồi thử lại.')
        }
      }

      const parsedTimeout = Number(timeoutSeconds)
      const options: ExportOptions = {
        ...(range.trim() ? { range: range.trim() } : {}),
        ...(dark ? { dark: true } : {}),
        withClicks,
        ...(omitBackground ? { omitBackground: true } : {}),
        outputDir,
        ...(timeoutSeconds.trim() && Number.isFinite(parsedTimeout) && parsedTimeout > 0
          ? { timeout: Math.floor(parsedTimeout * 1000) }
          : {})
      }

      if (exportAll) {
        const results = await api.export.runBatch(projectPath, files, format, options)
        setBatchResults(results)
        const successes = results.filter((result) => result.success).length
        if (openFolderAfterExport) {
          const firstOutput = results.find((result) => result.success && result.outputPath)?.outputPath
          if (firstOutput) handleOpenOutput(firstOutput)
        }
        if (successes === results.length) {
          setLogs((prev) => [...prev, `[Export] Hoàn tất ${successes}/${results.length} file.`])
        } else {
          setLogs((prev) => [...prev, `[Export] Hoàn tất ${successes}/${results.length} file; có file xuất lỗi.`])
        }
      } else {
        const result = collaborationProjectId
          ? await api.collab.exportMain(collaborationProjectId, format, options)
          : await api.export.run(projectPath, selectedEntry, format, options)
        setResultPath(result.outputPath)
        if (openFolderAfterExport) handleOpenOutput(result.outputPath)
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi khi thực thi lệnh xuất Slidev')
    } finally {
      setIsExporting(false)
    }
  }

  const handleInstallDeps = async () => {
    setDepsState('installing')
    setError(null)
    try {
      await api.export.installDeps(projectPath)
      setDepsState('ready')
    } catch (err: any) {
      setDepsState('failed')
      setError(err.message || 'Không thể cài playwright-chromium')
    }
  }

  const handleOpenOutput = (outputPath: string) => {
    api.fs.showInFolder(outputPath)
  }

  const needsBrowser = format !== 'build'
  const progressPercent = batchProgress && batchProgress.total > 0
    ? Math.round((batchProgress.current / batchProgress.total) * 100)
    : 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400"><Layers className="w-5 h-5" /></div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">Xuất bài thuyết trình</h2>
              <p className="text-xs text-slate-400">Chọn định dạng và tuỳ chỉnh cách xuất</p>
            </div>
          </div>
          <button onClick={onClose} disabled={isExporting} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {entryFiles.length > 1 && (
            <div className="space-y-3">
              <label className="flex items-center gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  checked={exportAll}
                  onChange={(event) => setExportAll(event.target.checked)}
                  disabled={isExporting}
                  className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
                />
                Xuất tất cả file trình chiếu ({entryFiles.length} file)
              </label>
              {exportAll ? (
                <p className="text-xs text-slate-500">Các file sẽ được xuất lần lượt để tránh dùng quá nhiều bộ nhớ.</p>
              ) : (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">File trình chiếu</label>
                  <select value={selectedEntry} onChange={(event) => setSelectedEntry(event.target.value)} disabled={isExporting} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500">
                    {entryFiles.map((file) => <option key={file} value={file}>{file}</option>)}
                  </select>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Định dạng đầu ra</label>{collaborationProjectId && <p className="mb-3 text-xs text-blue-300">Xuất bản tổng đã được duyệt trên nhánh tổng mới nhất; bản nháp đang làm của bạn được giữ. Kết quả trong thư mục export/ của dự án.</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {formats.filter((f) => !collaborationProjectId || ['pdf', 'pptx', 'build'].includes(f.id)).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => !isExporting && setFormat(item.id)}
                  aria-pressed={format === item.id}
                  className={`text-left p-3.5 rounded-xl border transition-all ${format === item.id ? 'bg-blue-600/10 border-blue-500 text-slate-100 ring-1 ring-blue-500/50' : 'bg-slate-800/40 border-slate-800 hover:border-slate-700 text-slate-300'}`}
                >
                  <span className="flex items-center gap-2.5 mb-1.5">{item.icon}<span className="font-medium text-sm">{item.title}</span></span>
                  <span className="block text-xs text-slate-400">{item.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {needsBrowser && depsState !== 'ready' && (
            <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-800/50 flex items-start gap-3">
              {depsState === 'installing' || depsState === 'checking'
                ? <Loader2 className="w-5 h-5 text-amber-400 shrink-0 mt-0.5 animate-spin" />
                : <Wrench className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />}
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-200">Cần playwright-chromium để xuất file</p>
                <p className="text-xs text-amber-100/70 mt-1">Thư viện này chỉ cần cài một lần trong dự án để kết xuất PDF, ảnh, PowerPoint và Markdown.</p>
                <button
                  onClick={handleInstallDeps}
                  disabled={depsState === 'checking' || depsState === 'installing' || isExporting}
                  className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-medium"
                >
                  {depsState === 'installing' ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Đang cài...</> : 'Cài ngay'}
                </button>
              </div>
            </div>
          )}

          <details className="group rounded-xl border border-slate-800 bg-slate-800/30">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-300 flex items-center justify-between">
              Tuỳ chọn nâng cao <span className="text-slate-500 group-open:rotate-180 transition-transform">⌄</span>
            </summary>
            <div className="px-4 pb-4 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-xs text-slate-400">Khoảng slide
                <input value={range} onChange={(event) => setRange(event.target.value)} placeholder="1,4-5,6" disabled={isExporting || format === 'build'} className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-200 placeholder:text-slate-600 disabled:opacity-40" />
              </label>
              <label className="text-xs text-slate-400">Timeout (giây)
                <input type="number" min="1" value={timeoutSeconds} onChange={(event) => setTimeoutSeconds(event.target.value)} placeholder="Mặc định: 30" disabled={isExporting || format === 'build'} className="mt-1 w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 disabled:opacity-40" />
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={dark} onChange={(event) => setDark(event.target.checked)} disabled={isExporting || format === 'build'} />Xuất theo theme tối</label>
              <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={withClicks} onChange={(event) => setWithClicks(event.target.checked)} disabled={isExporting || format === 'build'} />Mỗi bước click thành một trang</label>
              <label className="flex items-center gap-2 text-xs text-slate-300 sm:col-span-2"><input type="checkbox" checked={omitBackground} onChange={(event) => setOmitBackground(event.target.checked)} disabled={isExporting || format !== 'png'} />Bỏ nền browser (chỉ áp dụng với PNG)</label>
            </div>
          </details>

          {batchProgress && isExporting && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-300"><span>Đang xuất {batchProgress.current}/{batchProgress.total}</span><span className="font-mono text-slate-500 truncate ml-3">{batchProgress.file}</span></div>
              <div className="h-2 rounded-full bg-slate-800 overflow-hidden"><div className="h-full bg-blue-500 transition-all" style={{ width: `${progressPercent}%` }} /></div>
            </div>
          )}

          {resultPath && (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-300">Xuất file thành công!</p>
                <p className="text-xs text-emerald-200/70 break-all font-mono mt-0.5">{resultPath}</p>
                <button onClick={() => handleOpenOutput(resultPath)} className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"><FolderOpen className="w-3.5 h-3.5" />Mở thư mục chứa file</button>
              </div>
            </div>
          )}

          {batchResults.length > 0 && (
            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <div className="px-4 py-2 bg-slate-800/70 text-xs font-semibold text-slate-300">Kết quả xuất hàng loạt</div>
              <div className="divide-y divide-slate-800 max-h-52 overflow-y-auto">
                {batchResults.map((result) => (
                  <div key={result.file} className="flex items-start gap-2.5 p-3">
                    {result.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-200">{result.file}</p>
                      <p className={`text-[11px] mt-0.5 break-all font-mono ${result.success ? 'text-slate-500' : 'text-rose-300'}`}>{result.outputPath || result.error}</p>
                    </div>
                    {result.success && result.outputPath && <button onClick={() => handleOpenOutput(result.outputPath!)} title="Mở vị trí đầu ra" className="p-1.5 rounded hover:bg-slate-800 text-slate-400"><FolderOpen className="w-3.5 h-3.5" /></button>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800/60 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div><p className="text-sm font-semibold text-rose-300">Xuất file thất bại</p><p className="text-xs text-rose-200/80 mt-1 font-mono break-all">{error}</p></div>
            </div>
          )}

          {logs.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Nhật ký tiến trình</label>
              <div className="h-32 overflow-y-auto p-2.5 bg-black/60 border border-slate-800 rounded-lg font-mono text-[11px] text-slate-400 space-y-1 select-text">
                {logs.map((log, index) => <div key={index} className="break-all">{log}</div>)}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800 bg-slate-900/50">
          <button onClick={onClose} disabled={isExporting} className="px-4 py-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-sm font-medium">Đóng</button>
          <button onClick={handleStartExport} disabled={isExporting || (needsBrowser && depsState !== 'ready')} className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium shadow-lg shadow-blue-600/20">
            {isExporting ? <><Loader2 className="w-4 h-4 animate-spin" /><span>Đang xử lý...</span></> : <span>Bắt đầu xuất</span>}
          </button>
        </div>
      </div>
    </div>
  )
}
