import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { Download, Loader2, Play, Settings, Square, Terminal, Wrench } from 'lucide-react'
import api, { type FileNode } from '../ipc-client'
import { WorkspaceTabs } from '../components/WorkspaceTabs'
import { FileTree } from '../components/FileTree'
import { PdfPreview } from '../components/PdfPreview'
import { documents } from '../state/documents'
import { useSettings } from '../settings/SettingsContext'
import type { CompilerInfo, ReportSnapshot } from '../../shared/reports'
import type { ProjectWorkspaceProps } from './ProjectWorkspace'

const EditorPane = React.lazy(() =>
  import('../components/EditorPane').then((module) => ({ default: module.EditorPane }))
)

export function ReportWorkspace(props: ProjectWorkspaceProps) {
  const tab = props.openTabs.find((item) => item.project.id === props.activeTabId) || props.openTabs[0]
  const { project } = tab
  const isMarkdown = project.kind === 'markdown-report'
  const { settings, effectiveThemeId } = useSettings()
  const [tree, setTree] = useState<FileNode[]>([])
  const [snapshot, setSnapshot] = useState<ReportSnapshot>({ projectId: project.id, state: 'idle', logs: [] })
  const [compiler, setCompiler] = useState<CompilerInfo>({ available: isMarkdown })
  const [checking, setChecking] = useState(!isMarkdown)
  const [installing, setInstalling] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [pdf, setPdf] = useState<Uint8Array | null>(null)
  const [reference, setReference] = useState(false)
  const [message, setMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [autoCompile, setAutoCompile] = useState(isMarkdown)
  const initialPreview = useRef(false)
  const mounted = useRef(true)
  const action = useRef(false)
  const lastAutoRevision = useRef('')
  const activeDocument = useSyncExternalStore(
    useCallback((listener) => documents.subscribe(tab.activeFilePath, listener), [tab.activeFilePath]),
    useCallback(() => documents.get(tab.activeFilePath), [tab.activeFilePath])
  )
  const busy = actionBusy || snapshot.state === 'compiling'
  const refreshTree = useCallback(async () => {
    try {
      const nodes = await api.fs.listDirectory(project.path)
      if (mounted.current) setTree(nodes)
    } catch (error: any) {
      if (mounted.current) setActionError(error.message)
    }
  }, [project.path])
  useEffect(() => {
    mounted.current = true
    void refreshTree()
    void api.reports
      .status(project.id)
      .then((state) => {
        if (mounted.current) setSnapshot(state)
      })
      .catch((error) => {
        if (mounted.current) setActionError(error.message)
      })
    if (!isMarkdown) void api.reports
      .compiler()
      .then((info) => {
        if (mounted.current) setCompiler(info)
      })
      .catch((error) => {
        if (mounted.current) setActionError(error.message)
      })
      .finally(() => {
        if (mounted.current) setChecking(false)
      })
    const unsubscribe = api.reports.onChange((state) => {
      if (state.projectId === project.id && mounted.current) setSnapshot(state)
    })
    return () => {
      mounted.current = false
      unsubscribe()
    }
  }, [project.id, refreshTree, isMarkdown])
  useEffect(() => {
    let active = true
    void (async () => {
      let data = await api.reports.readPdf(project.id, tab.activeEntryFile)
      const isReference = !data
      if (!data) data = await api.reports.readPdf(project.id, tab.activeEntryFile, true)
      if (active) {
        setPdf(data)
        setReference(isReference && !!data)
      }
    })().catch((error) => {
      if (active) setActionError(error.message)
    })
    return () => {
      active = false
    }
  }, [project.id, tab.activeEntryFile, snapshot.compiledAt])

  const compile = useCallback(
    async (flush = true) => {
      if (action.current) return null
      action.current = true
      setActionBusy(true)
      setActionError('')
      setMessage('')
      try {
        if (flush) await documents.flushProject(project.path)
        const state = await api.reports.compile(project.id, tab.activeEntryFile)
        if (mounted.current) {
          setSnapshot(state)
          if (state.state === 'error') setConsoleOpen(true)
        }
        return state
      } catch (error: any) {
        if (mounted.current) setActionError(error.message)
        return null
      } finally {
        action.current = false
        if (mounted.current) setActionBusy(false)
      }
    },
    [project.id, project.path, tab.activeEntryFile]
  )
  useEffect(() => {
    if (!isMarkdown || props.visible === false || activeDocument.loading || initialPreview.current) return
    initialPreview.current = true
    void compile(false)
  }, [isMarkdown, props.visible, activeDocument.loading, compile])
  useEffect(() => {
    if (
      props.visible === false ||
      !autoCompile ||
      busy ||
      !compiler.available ||
      activeDocument.loading ||
      !activeDocument.savedRevision ||
      activeDocument.revision !== activeDocument.savedRevision
    )
      return
    const revision = `${tab.activeFilePath}:${activeDocument.savedRevision}`
    if (lastAutoRevision.current === revision) return
    const timer = setTimeout(() => {
      lastAutoRevision.current = revision
      void compile(false)
    }, isMarkdown ? 250 : 1200)
    return () => clearTimeout(timer)
  }, [props.visible, autoCompile, busy, compiler.available, activeDocument, tab.activeFilePath, compile, isMarkdown])
  const install = async () => {
    setInstalling(true)
    setActionError('')
    try {
      const info = await api.reports.installCompiler()
      if (mounted.current) {
        setCompiler(info)
        setMessage('Đã cài bộ biên dịch. Bấm Lưu & biên dịch để tạo PDF của bạn.')
      }
    } catch (error: any) {
      if (mounted.current) setActionError(error.message)
    } finally {
      if (mounted.current) setInstalling(false)
    }
  }
  const exportPdf = async () => {
    const result = await compile()
    if (result?.state !== 'ready' || !mounted.current) return
    setActionBusy(true)
    try {
      const output = await api.reports.exportPdf(project.id, tab.activeEntryFile)
      if (output && mounted.current) setMessage(`Đã lưu PDF: ${output}`)
    } catch (error: any) {
      if (mounted.current) setActionError(error.message)
    } finally {
      if (mounted.current) setActionBusy(false)
    }
  }
  const selectFile = (file: string) => {
    if (!/\.(tex|bib|sty|cls|txt|md|json|ya?ml|csv|toml)$/i.test(file) && !/\.gitignore$/i.test(file)) {
      setMessage(`File ảnh/PDF được giữ nguyên. Chọn file ${isMarkdown ? '.md' : '.tex'} để chỉnh sửa nội dung báo cáo.`)
      return
    }
    setMessage('')
    props.onUpdateTab(project.id, { activeFilePath: file })
  }
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-950 text-slate-100">
      <WorkspaceTabs
        tabs={props.openTabs}
        activeId={project.id}
        onSelect={props.onSelectTab}
        onClose={props.onCloseTab}
        onHome={props.onGoHome}
      />
      <header className="app-chrome flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 bg-slate-900/90 px-4 py-3 text-xs">
        <div>
          <h1 className="text-sm font-semibold">{project.name}</h1>
          <span className="text-slate-400">Báo cáo {isMarkdown ? 'Markdown' : 'LaTeX'} · {tab.activeEntryFile} · A4 / PDF</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-slate-300">
            <input type="checkbox" checked={autoCompile} onChange={(event) => setAutoCompile(event.target.checked)} />
            {isMarkdown ? 'Tự cập nhật khi lưu' : 'Biên dịch khi lưu'}
          </label>
          <button
            disabled={busy || installing || !compiler.available}
            onClick={() => void compile()}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 font-medium disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}{isMarkdown ? 'Lưu & cập nhật PDF' : 'Lưu & biên dịch'}
          </button>
          {snapshot.state === 'compiling' && (
            <button
              onClick={() => void api.reports.cancel(project.id).catch((error) => setActionError(error.message))}
              className="flex items-center gap-1 text-rose-300"
            >
              <Square className="h-3 w-3" />
              {isMarkdown ? 'Hủy cập nhật' : 'Hủy biên dịch'}
            </button>
          )}
          <button
            disabled={busy || installing || !compiler.available}
            onClick={() => void exportPdf()}
            className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 disabled:opacity-40"
          >
            <Download className="h-4 w-4" />
            Xuất PDF
          </button>
          <button title="Nhật ký biên dịch" onClick={() => setConsoleOpen((open) => !open)}>
            <Terminal className="h-4 w-4" />
          </button>
          <button title="Cài đặt" onClick={props.onOpenSettings}>
            <Settings className="h-4 w-4" />
          </button>
        </div>
      </header>
      {!isMarkdown && !checking && !compiler.available && (
        <div className="flex items-center justify-between gap-3 border-b border-blue-800 bg-blue-950/40 px-4 py-3 text-xs text-blue-100">
          <p>
            Cài bộ biên dịch một lần để tạo PDF. Lần đầu biên dịch cần mạng để tải gói LaTeX; các lần sau dùng lại bộ
            nhớ đệm.
          </p>
          <button
            disabled={installing}
            onClick={() => void install()}
            className="flex shrink-0 items-center gap-2 rounded bg-blue-600 px-3 py-2 disabled:opacity-50"
          >
            {installing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
            {installing ? 'Đang cài…' : 'Cài bộ biên dịch'}
          </button>
        </div>
      )}
      {(actionError || snapshot.error) && (
        <div
          role="alert"
          className="border-b border-rose-800 bg-rose-950/40 px-4 py-2 text-xs text-rose-200 whitespace-pre-wrap"
        >
          {actionError || snapshot.error}
        </div>
      )}
      {message && (
        <div role="status" className="border-b border-slate-700 px-4 py-2 text-xs text-emerald-300 break-all">
          {message}
        </div>
      )}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2 text-xs text-slate-400">
        <span>
          {reference
            ? (isMarkdown ? 'Đang tạo bản PDF từ main.md…' : 'Bản xem trước của template. Biên dịch để cập nhật nội dung bạn đã sửa.')
            : snapshot.state === 'compiling'
              ? 'Đang biên dịch; giữ PDF thành công gần nhất.'
              : snapshot.state === 'error' || snapshot.state === 'cancelled'
                ? 'PDF của lần biên dịch thành công trước.'
                : pdf
                  ? (isMarkdown ? 'PDF từ Markdown' : 'PDF đã biên dịch')
                  : 'Chưa có PDF'}
        </span>
        {snapshot.state === 'compiling' && (
          <span className="flex items-center gap-1 text-amber-300">
            <Loader2 className="h-3 w-3 animate-spin" />
            Đang biên dịch
          </span>
        )}
      </div>
      <PanelGroup direction="horizontal" autoSaveId={`report-layout-${project.id}`} className="min-h-0 flex-1">
        <Panel defaultSize={16} minSize={10} maxSize={30}>
          <FileTree
            nodes={tree}
            activeFilePath={tab.activeFilePath}
            onSelectFile={selectFile}
            onRefresh={() => void refreshTree()}
          />
        </Panel>
        <PanelResizeHandle className="w-1 bg-slate-800 hover:bg-blue-500" />
        <Panel defaultSize={40} minSize={20}>
          <React.Suspense fallback={<div className="p-4 text-xs text-slate-400">Đang mở trình soạn thảo…</div>}>
            <EditorPane
              markdownReport={isMarkdown}
              projectRoot={project.path}
              active={props.visible}
              filePath={tab.activeFilePath}
              settings={settings.editor}
              appThemeId={effectiveThemeId}
              flashMs={settings.preview.sourceJump.flashMs}
              onFileChange={selectFile}
            />
          </React.Suspense>
        </Panel>
        <PanelResizeHandle className="w-1 bg-slate-800 hover:bg-blue-500" />
        <Panel defaultSize={44} minSize={25}>
          <PdfPreview data={pdf} />
        </Panel>
      </PanelGroup>
      {consoleOpen && (
        <div
          aria-label="Nhật ký LaTeX"
          className="h-40 shrink-0 overflow-auto border-t border-slate-700 bg-black/50 p-3 font-mono text-[11px] text-slate-400"
        >
          <pre className="whitespace-pre-wrap">{snapshot.logs.join('\n') || 'Chưa có nhật ký biên dịch.'}</pre>
        </div>
      )}
    </div>
  )
}
