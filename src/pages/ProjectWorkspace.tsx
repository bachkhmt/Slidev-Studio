import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  ArrowLeft,
  RefreshCw,
  Square,
  Play,
  Terminal,
  Download,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  X,
  FileText,
  RefreshCcwDot,
  Loader2
} from 'lucide-react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import type { ImperativePanelHandle, ImperativePanelGroupHandle } from 'react-resizable-panels'
import { FileTree } from '../components/FileTree'
import { EditorPane } from '../components/EditorPane'
import { PreviewPane, PreviewPaneHandle } from '../components/PreviewPane'
import { ProcessConsole, LogEntry } from '../components/ProcessConsole'
import { ExportDialog } from '../components/ExportDialog'
import api, { ProjectItem, FileNode, ProcessStatusType } from '../ipc-client'
import { useSettings } from '../settings/SettingsContext'
import { processStore, useProcessSnapshot } from '../state/processStore'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { CollaborationBar } from '../components/CollaborationBar'
import { isSectionFile, type CollabStatus } from '../../shared/collab'
import type { SourceClickPayload } from '../../shared/preview-bridge'
import { parseSlideIndex, resolveSlideFile } from '../lib/slideIndex'
import { locateSource } from '../lib/sourceLocator'
import type { EditorPaneHandle } from '../components/EditorPane'

export interface OpenTab {
  project: ProjectItem
  activeEntryFile: string
  activeFilePath: string
  serverPort?: number
  serverUrl?: string
  lanUrl?: string
  status: ProcessStatusType
  logs: LogEntry[]
  error?: string
}

interface ProjectWorkspaceProps {
  openTabs: OpenTab[]
  activeTabId: string
  onSelectTab: (id: string) => void
  onCloseTab: (id: string) => void
  onGoHome: () => void
  onUpdateTab: (id: string, updater: Partial<OpenTab> | ((prev: OpenTab) => OpenTab)) => void
  onOpenSettings: () => void
}

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({
  openTabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onGoHome,
  onUpdateTab,
  onOpenSettings
}) => {
  const selectedTab = openTabs.find((t) => t.project.id === activeTabId) || openTabs[0]
  const processSnapshot = useProcessSnapshot(selectedTab?.project.id)
  const liveStatus = processSnapshot.status
  const currentTab = useMemo(() => selectedTab ? {
    ...selectedTab,
    status: liveStatus?.status || selectedTab.status,
    serverPort: liveStatus?.port ?? selectedTab.serverPort,
    serverUrl: liveStatus?.url ?? selectedTab.serverUrl,
    lanUrl: liveStatus?.lanUrl ?? selectedTab.lanUrl,
    error: liveStatus ? liveStatus.error : selectedTab.error,
    logs: processSnapshot.logs
  } : selectedTab, [selectedTab, liveStatus, processSnapshot.logs])
  const projectId = currentTab?.project.id
  const projectPath = currentTab?.project.path
  const activeEntryFile = selectedTab?.activeEntryFile

  const [collab, setCollab] = useState<{ projectId: string; status: CollabStatus | null } | null>(null)
  const [collabBusy, setCollabBusy] = useState(false)
  const [collabLogin, setCollabLogin] = useState('')
  const [editorReload, setEditorReload] = useState(0)
  const collabStatus = collab?.projectId === projectId ? collab.status : undefined
  const assignedSection = collabStatus?.manifest.sections.find((s) => s.id === collabStatus.sectionId)
  const relativeEditorFile = selectedTab?.activeFilePath?.replace(/\\/g, '/').slice((projectPath?.replace(/\\/g, '/').length || 0) + 1) || ''
  const editorReadOnly = collabBusy || collabStatus === undefined || (!!collabStatus && (!assignedSection || assignedSection.owner.toLowerCase() !== collabLogin.toLowerCase() || !isSectionFile(assignedSection, relativeEditorFile)))

  const [fileTree, setFileTree] = useState<FileNode[]>([])
  const [isFileTreeCollapsed, setIsFileTreeCollapsed] = useState<boolean>(false)
  const [consoleVisibility, setConsoleVisibility] = useState(() => ({
    projectId,
    open: projectId ? localStorage.getItem(`slidev-console-open-${projectId}`) === 'true' : false
  }))
  const isConsoleOpen = consoleVisibility.projectId === projectId && consoleVisibility.open
  const [isExportOpen, setIsExportOpen] = useState<boolean>(false)
  const [isPortEditing, setIsPortEditing] = useState(false)
  const [portDraft, setPortDraft] = useState('')
  const [serverRestartNeeded, setServerRestartNeeded] = useState(() => localStorage.getItem('studio-server-settings-pending') === 'true')
  const [sourceToast, setSourceToast] = useState('')
  const [restoreTarget, setRestoreTarget] = useState<{ projectId: string; suffix?: string; slideNo?: number } | null>(null)
  const [isRecompiling, setIsRecompiling] = useState(false)
  const fileTreePanelRef = useRef<ImperativePanelHandle>(null)
  const editorPanelRef = useRef<ImperativePanelHandle>(null)
  const previewPanelRef = useRef<ImperativePanelHandle>(null)
  const consolePanelRef = useRef<ImperativePanelHandle>(null)
  const horizontalGroupRef = useRef<ImperativePanelGroupHandle>(null)
  const verticalGroupRef = useRef<ImperativePanelGroupHandle>(null)
  const previewRef = useRef<PreviewPaneHandle>(null)
  const editorRef = useRef<EditorPaneHandle>(null)
  const pendingRestoreRef = useRef<{ projectId: string; suffix?: string; slideNo?: number } | null>(null)
  const cursorSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sourceJumpSuppressionRef = useRef<{ file: string; line: number; expiresAt: number } | null>(null)
  const { settings, effectiveThemeId } = useSettings()
  const activeRestoreTarget = restoreTarget?.projectId === projectId
    ? restoreTarget
    : currentTab?.status === 'running' && pendingRestoreRef.current?.projectId === projectId
      ? pendingRestoreRef.current
      : null
  const compileError = processSnapshot.compileError

  const resolveProjectFile = useCallback((file: string) => {
    const normalized = file.replace(/\\/g, '/')
    if (normalized.startsWith('/') || /^[a-z]:\//i.test(normalized)) return normalized
    return `${projectPath?.replace(/\\/g, '/').replace(/\/$/, '')}/${normalized.replace(/^\.\//, '')}`
  }, [projectPath])

  const compileErrorMarker = useMemo(() => {
    if (!compileError?.file || !compileError.line) return undefined
    return { file: resolveProjectFile(compileError.file), line: compileError.line, column: compileError.column, message: compileError.summary }
  }, [compileError, resolveProjectFile])

  const gotoCompileError = useCallback(async () => {
    if (!compileError || !projectPath || !activeEntryFile) return
    const entryPath = `${projectPath.replace(/\\/g, '/').replace(/\/$/, '')}/${activeEntryFile}`
    let file = compileError.file ? resolveProjectFile(compileError.file) : entryPath
    let line = compileError.line
    if (!line && compileError.slideNo) {
      try {
        const entryText = await api.fs.readFile(entryPath)
        const slide = parseSlideIndex(entryText, entryPath).find((item) => item.no === compileError.slideNo)
        line = slide?.contentStartLine || 1
        file = entryPath
      } catch { line = 1; file = entryPath }
    }
    editorPanelRef.current?.expand()
    editorRef.current?.reveal({ file, line: line || 1, column: compileError.column || 1, length: 0, confidence: 'exact' })
  }, [activeEntryFile, compileError, projectPath, resolveProjectFile])

  const handleEditorCursorChange = useCallback((file: string, line: number) => {
    if (!settings.preview.sourceJump.syncEditorToPreview || !activeEntryFile || !projectPath) return
    const normalizedFile = file.replace(/\\/g, '/').toLocaleLowerCase()
    const suppressed = sourceJumpSuppressionRef.current
    if (suppressed && Date.now() < suppressed.expiresAt && suppressed.file === normalizedFile && suppressed.line === line) {
      sourceJumpSuppressionRef.current = null
      return
    }
    if (cursorSyncTimerRef.current) clearTimeout(cursorSyncTimerRef.current)
    cursorSyncTimerRef.current = setTimeout(async () => {
      const entryFile = `${projectPath.replace(/\\/g, '/').replace(/\/$/, '')}/${activeEntryFile}`
      try {
        const entryText = await api.fs.readFile(entryFile)
        const index = parseSlideIndex(entryText, entryFile)
        let target = index.find((slide) => normalizedFile === slide.file.replace(/\\/g, '/').toLocaleLowerCase())
        if (normalizedFile === entryFile.toLocaleLowerCase()) {
          target = index.find((slide) => line >= slide.contentStartLine && line <= slide.endLine)
        } else if (target) {
          const sourceSlides = index.filter((slide) => normalizedFile === slide.file.replace(/\\/g, '/').toLocaleLowerCase())
          if (sourceSlides.length > 1) {
            const sourceText = await api.fs.readFile(file)
            const sourceSlide = parseSlideIndex(sourceText, file).find((slide) => line >= slide.contentStartLine && line <= slide.endLine)
            if (sourceSlide) target = sourceSlides[sourceSlide.no - 1] || target
          }
        }
        if (target) previewRef.current?.goto(target.no)
      } catch (error) {
        console.warn('Không thể đồng bộ con trỏ Editor với Preview:', error)
      }
    }, 250)
  }, [activeEntryFile, projectPath, settings.preview.sourceJump.syncEditorToPreview])

  useEffect(() => () => {
    if (cursorSyncTimerRef.current) clearTimeout(cursorSyncTimerRef.current)
  }, [])

  useEffect(() => {
    if (!projectId) return
    const open = localStorage.getItem(`slidev-console-open-${projectId}`) === 'true'
    setConsoleVisibility({ projectId, open })
    setIsFileTreeCollapsed(fileTreePanelRef.current?.isCollapsed() ?? false)
  }, [projectId])

  useEffect(() => {
    const panel = consolePanelRef.current
    if (!panel) return
    if (isConsoleOpen) {
      if (panel.isCollapsed()) panel.expand(25)
    } else if (!panel.isCollapsed()) {
      panel.collapse()
    }
  }, [isConsoleOpen, projectId])

  // Load File Tree
  const refreshFileTree = useCallback(async () => {
    if (!projectPath) return
    try {
      const tree = await api.fs.listTree(projectPath)
      setFileTree(tree)
    } catch (err) {
      console.error('Lỗi nạp cây thư mục:', err)
    }
  }, [projectPath])

  useEffect(() => {
    refreshFileTree()
  }, [refreshFileTree])

  useEffect(() => {
    if (currentTab?.status !== 'running' || !currentTab.serverUrl || !projectId) return
    const pending = pendingRestoreRef.current
    if (!pending || pending.projectId !== projectId) return
    pendingRestoreRef.current = null
    setRestoreTarget(pending)
  }, [currentTab?.status, currentTab?.serverUrl, projectId])

  // Start Slidev Dev server if currently idle or stopped
  const startDevServer = useCallback(
    async (entry?: string) => {
      if (!activeEntryFile) return
      const entryFile = entry || activeEntryFile
      onUpdateTab(projectId, { status: 'starting', error: undefined })

      try {
        const res = await api.process.start(projectId, projectPath, entryFile)
        onUpdateTab(projectId, {
          status: 'running',
          serverPort: res.port,
          serverUrl: res.url,
          lanUrl: res.lanUrl,
          error: undefined
        })
      } catch (err: any) {
        onUpdateTab(projectId, {
          status: 'error',
          error: err.message || 'Không thể khởi động Slidev dev server'
        })
      }
    },
    [activeEntryFile, projectId, projectPath, onUpdateTab]
  )

  const stopDevServer = async () => {
    if (!projectId) return
    await api.process.stop(projectId)
    onUpdateTab(projectId, { status: 'stopped' })
  }

  const restartDevServer = async () => {
    if (!currentTab) return
    const currentSlide = previewRef.current?.getCurrentSlideNo()
    const currentSuffix = previewRef.current?.getCurrentSuffix()
    pendingRestoreRef.current = !settings.preview.restoreSlideAfterRestart ? null : currentSlide
      ? { projectId, slideNo: currentSlide, suffix: currentSuffix || undefined }
      : currentSuffix ? { projectId, suffix: currentSuffix } : null
    onUpdateTab(projectId, { status: 'starting', error: undefined })
    try {
      const res = await api.process.restart(projectId, projectPath, currentTab.activeEntryFile)
      onUpdateTab(projectId, {
        status: 'running',
        serverPort: res.port,
        serverUrl: res.url,
        lanUrl: res.lanUrl,
        error: undefined
      })
      setServerRestartNeeded(false)
      localStorage.setItem('studio-server-settings-pending', 'false')
    } catch (err: any) {
      onUpdateTab(projectId, {
        status: 'error',
        error: err.message || 'Không thể restart máy chủ'
      })
    }
  }

  const handleSourceClick = useCallback(async (payload: SourceClickPayload) => {
    if (!activeEntryFile || !projectPath) return
    try {
      const entryFile = `${projectPath.replace(/\/$/, '')}/${activeEntryFile}`
      const entryText = await api.fs.readFile(entryFile)
      const entryIndex = parseSlideIndex(entryText, entryFile)
      const indexedSlide = entryIndex.find((slide) => slide.no === payload.slideNo)
      const metadataFile = payload.slideMeta?.filepath
      const file = metadataFile
        ? resolveSlideFile(entryFile, projectPath, metadataFile)
        : indexedSlide?.file || entryFile
      const markdown = file === entryFile ? entryText : await api.fs.readFile(file)
      const targetIndex = file === entryFile ? entryIndex : parseSlideIndex(markdown, file)
      let slide = targetIndex.find((item) => item.no === payload.slideNo) || indexedSlide
      if (!slide) slide = { no: payload.slideNo, startLine: 1, contentStartLine: 1, endLine: markdown.split(/\r?\n/).length, file }
      slide = { ...slide, file }
      if (payload.slideMeta?.start && payload.slideMeta.start > 0) {
        slide = { ...slide, startLine: payload.slideMeta.start, contentStartLine: payload.slideMeta.start }
      }
      const location = locateSource(payload, slide, markdown, file)
      sourceJumpSuppressionRef.current = {
        file: location.file.replace(/\\/g, '/').toLocaleLowerCase(),
        line: location.line,
        expiresAt: Date.now() + 2500
      }
      editorPanelRef.current?.expand()
      editorRef.current?.reveal(location)
      if (location.confidence === 'slide') setSourceToast(`Không xác định được vị trí chính xác — đã đưa bạn tới đầu slide ${payload.slideNo}.`)
      else if (location.confidence === 'fuzzy') setSourceToast(`Đã mở vị trí gần đúng trong slide ${payload.slideNo}.`)
      else setSourceToast(`Đã mở dòng ${location.line} trong ${location.file.split('/').pop()}.`)
      setTimeout(() => setSourceToast(''), 3600)
    } catch (error: any) {
      setSourceToast(`Không thể tìm source: ${error.message || 'lỗi đọc Markdown'}`)
      setTimeout(() => setSourceToast(''), 3600)
    }
  }, [activeEntryFile, projectPath])

  const savePreferredPort = async () => {
    if (!currentTab) return
    const value = portDraft.trim() ? Number(portDraft) : undefined
    if (value !== undefined && (!Number.isInteger(value) || value < 1024 || value > 65535)) return
    const updated = await api.projects.updateProject(currentTab.project.id, { preferredPort: value })
    if (updated) onUpdateTab(currentTab.project.id, (tab) => ({ ...tab, project: updated }))
    setIsPortEditing(false)
  }

  const recompileDevServer = async () => {
    if (!currentTab || !projectId) return
    const suffix = previewRef.current?.getCurrentSuffix()
    const slideNo = previewRef.current?.getCurrentSlideNo()
    pendingRestoreRef.current = slideNo ? { projectId, suffix: suffix || undefined, slideNo } : suffix ? { projectId, suffix } : null
    setRestoreTarget(null)
    setIsRecompiling(true)
    onUpdateTab(projectId, { status: 'starting', error: undefined })
    try {
      const res = await api.process.recompile(projectId, projectPath, currentTab.activeEntryFile)
      onUpdateTab(projectId, {
        status: 'running',
        serverPort: res.port,
        serverUrl: res.url,
        lanUrl: res.lanUrl,
        error: undefined
      })
    } catch (err: any) {
      pendingRestoreRef.current = null
      setRestoreTarget(null)
      onUpdateTab(projectId, {
        status: 'error',
        error: err.message || 'Không thể buộc biên dịch lại Slidev'
      })
    } finally {
      setIsRecompiling(false)
    }
  }

  const setConsoleOpen = (open: boolean) => {
    if (projectId) localStorage.setItem(`slidev-console-open-${projectId}`, String(open))
    setConsoleVisibility({ projectId, open })
    const panel = consolePanelRef.current
    if (panel) {
      if (open && panel.isCollapsed()) panel.expand(25)
      if (!open && !panel.isCollapsed()) panel.collapse()
    }
  }

  const resetHorizontalLayout = (includeFileTree = false) => {
    const treeSize = includeFileTree
      ? 18
      : fileTreePanelRef.current?.isCollapsed()
        ? 0
        : Math.max(18, fileTreePanelRef.current?.getSize() || 18)
    if (includeFileTree) fileTreePanelRef.current?.expand()
    const remainingSize = 100 - treeSize
    horizontalGroupRef.current?.setLayout([treeSize, remainingSize / 2, remainingSize / 2])
  }

  const resetVerticalLayout = () => {
    setConsoleOpen(true)
    verticalGroupRef.current?.setLayout([75, 25])
  }

  // Handle entry file change (e.g. from slides-academic.md to slides-scholarly.md)
  const handleChangeEntryFile = async (newEntry: string) => {
    if (newEntry === currentTab.activeEntryFile) return
    onUpdateTab(projectId, {
      activeEntryFile: newEntry,
      activeFilePath: `${projectPath}/${newEntry}`
    })
    await startDevServer(newEntry)
  }

  if (!currentTab) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-950 text-slate-400">
        <p className="mb-4">Không có dự án nào đang mở</p>
        <button
          onClick={onGoHome}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs"
        >
          Quay về Dashboard
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Multi-Project Tab Bar */}
      <div className="app-chrome flex items-center bg-slate-900 border-b border-slate-800 px-2 pt-1.5 gap-1 overflow-x-auto select-none">
        <button
          onClick={onGoHome}
          title="Về màn hình chính (Home Dashboard)"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg bg-slate-800/50 hover:bg-slate-800 text-slate-400 hover:text-slate-50 text-xs font-medium transition-colors mr-1 shrink-0"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Home</span>
        </button>

        {openTabs.map((tab) => {
          const isActive = tab.project.id === activeTabId
          return (
            <div
              key={tab.project.id}
              onClick={() => onSelectTab(tab.project.id)}
              className={`group flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs cursor-pointer border-t-2 transition-all shrink-0 max-w-[220px] ${
                isActive
                  ? 'bg-slate-950 border-blue-500 text-slate-100 font-medium shadow-sm'
                  : 'bg-slate-900/60 border-transparent text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${
                  tab.status === 'running'
                    ? 'bg-emerald-400 ring-2 ring-emerald-400/20'
                    : tab.status === 'starting' || tab.status === 'installing'
                    ? 'bg-amber-400 animate-pulse'
                    : tab.status === 'error'
                    ? 'bg-rose-400'
                    : 'bg-slate-600'
                }`}
                title={`Trạng thái: ${tab.status}`}
              />

              <span className="truncate">{tab.project.name}</span>

              {tab.serverPort && (
                <span className="text-[10px] text-slate-500 font-mono">:{tab.serverPort}</span>
              )}

              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseTab(tab.project.id)
                }}
                title="Đóng tab này"
                className="p-0.5 rounded hover:bg-slate-800 opacity-60 group-hover:opacity-100 text-slate-400 hover:text-slate-50"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )
        })}
      </div>

      {/* Main Workspace Navigation & Toolbar */}
      <header className="app-chrome flex items-center justify-between px-4 py-2 bg-slate-900/90 border-b border-slate-800 text-xs">
        <div className="flex items-center gap-3">
          {/* File Tree toggle */}
          <button
            onClick={() => {
              const panel = fileTreePanelRef.current
              if (!panel) return
              if (panel.isCollapsed()) panel.expand()
              else panel.collapse()
            }}
            title={isFileTreeCollapsed ? 'Mở thanh cây thư mục' : 'Thu gọn thanh cây thư mục'}
            className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-slate-50 transition-colors"
          >
            {isFileTreeCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>

          {/* Project Title */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-100 text-sm">{currentTab.project.name}</span>
            <div className="relative">
              <button onClick={() => { setPortDraft(currentTab.project.preferredPort ? String(currentTab.project.preferredPort) : ''); setIsPortEditing((open) => !open) }} title="Cổng riêng cho dự án" className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 hover:text-slate-100">{currentTab.project.preferredPort ? `Port ${currentTab.project.preferredPort}` : 'Mặc định'}</button>
              {isPortEditing && <div className="absolute left-0 top-7 z-50 w-56 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-xl"><label className="text-[11px] text-slate-400">Cổng dự án (để trống dùng mặc định)</label><input type="number" min="1024" max="65535" value={portDraft} onChange={(event) => setPortDraft(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 font-mono text-xs text-slate-100" /><div className="mt-2 flex justify-end gap-2"><button onClick={() => setIsPortEditing(false)} className="px-2 py-1 text-xs text-slate-400">Hủy</button><button onClick={savePreferredPort} className="rounded bg-blue-600 px-2 py-1 text-xs text-white">Áp dụng</button></div></div>}
            </div>
          </div>

          {/* Entry file selector (for multi-entry projects) */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-lg border border-slate-700/60">
            <FileText className="w-3.5 h-3.5 text-blue-400" />
            {!collabStatus && currentTab.project.entryFiles.length > 1 ? (
              <select
                value={currentTab.activeEntryFile}
                onChange={(e) => handleChangeEntryFile(e.target.value)}
                className="bg-transparent text-slate-200 text-xs font-mono focus:outline-none cursor-pointer"
              >
                {currentTab.project.entryFiles.map((file) => (
                  <option key={file} value={file} className="bg-slate-900 text-white">
                    {file}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-slate-300 font-mono text-xs">
                {currentTab.activeEntryFile}
              </span>
            )}
          </div>

          {/* Status Badge */}
          <div className="flex items-center gap-1.5">
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium flex items-center gap-1.5 ${
                currentTab.status === 'running'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                  : currentTab.status === 'starting'
                  ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  : currentTab.status === 'installing'
                  ? 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                  : currentTab.status === 'error'
                  ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  currentTab.status === 'running'
                    ? 'bg-emerald-400'
                    : currentTab.status === 'starting' || currentTab.status === 'installing'
                    ? 'bg-amber-400 animate-ping'
                    : currentTab.status === 'error'
                    ? 'bg-rose-400'
                    : 'bg-slate-500'
                }`}
              />
              {currentTab.status === 'running'
                ? `Running (Port ${currentTab.serverPort})`
              : currentTab.status === 'starting'
                ? isRecompiling ? 'Recompiling (--force)...' : 'Starting DevServer...'
                : currentTab.status === 'installing'
                ? 'Installing dependencies...'
                : currentTab.status === 'error'
                ? 'Server Error'
                : 'Server Stopped'}
            </span>
          </div>
        </div>

        {/* Server Controls & Action Buttons */}
        <div className="flex items-center gap-2">
          {currentTab.status === 'running' ? (
            <>
              <button
                onClick={restartDevServer}
                title="Khởi động lại Slidev Server"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-slate-50 transition-colors border border-slate-700"
              >
                <RefreshCw className="w-3.5 h-3.5 text-blue-400" />
                <span>Restart</span>
              </button>
              <button
                onClick={recompileDevServer}
                title="Khác Restart: buộc Vite bỏ cache và đóng gói dependency lại (--force)"
                disabled={isRecompiling}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 hover:text-slate-50 transition-colors border border-slate-700"
              >
                <RefreshCcwDot className="w-3.5 h-3.5 text-amber-400" />
                <span>{isRecompiling ? 'Recompiling...' : 'Recompile'}</span>
              </button>
              <button
                onClick={stopDevServer}
                title="Dừng Slidev Server"
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-400 transition-colors border border-slate-700"
              >
                <Square className="w-3.5 h-3.5 fill-current text-rose-400" />
                <span>Stop</span>
              </button>
            </>
          ) : currentTab.status === 'starting' || currentTab.status === 'installing' ? (
            <button disabled className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800 text-slate-400 font-medium opacity-80">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>{currentTab.status === 'installing' ? 'Installing…' : 'Starting…'}</span>
            </button>
          ) : (
            <button
              onClick={() => startDevServer()}
              title="Chạy Slidev Server"
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Start</span>
            </button>
          )}

          <div className="h-4 w-[1px] bg-slate-800 mx-1" />

          {/* Export Button */}
          <button
            onClick={() => setIsExportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-slate-50 font-medium transition-colors border border-blue-500/30"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Slide</span>
          </button>

          {/* Console Drawer Toggle */}
          <button
            onClick={() => setConsoleOpen(!isConsoleOpen)}
            title="Bật/Tắt Terminal & Dev Console"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors border ${
              isConsoleOpen
                ? 'bg-slate-800 border-blue-500 text-blue-400'
                : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-50'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>Console</span>
            {currentTab.logs.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-700 text-slate-300">
                {currentTab.logs.length}
              </span>
            )}
          </button>

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            title="Cài đặt"
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-50 transition-colors"
          >
            <SettingsIcon className="w-4 h-4" />
          </button>
        </div>
      </header>

      <CollaborationBar key={projectId} projectId={projectId}
        flush={async () => { await editorRef.current?.flush() }}
        onStatus={(status) => setCollab({ projectId, status })}
        onAccount={(login) => setCollabLogin(login)}
        onBusy={setCollabBusy}
        onReload={() => { setEditorReload((n) => n + 1); void refreshFileTree() }}
        onExport={() => setIsExportOpen(true)}
        onPreview={async (entry, file) => {
          onUpdateTab(projectId, { activeEntryFile: entry, ...(file ? { activeFilePath: `${projectPath}/${file}` } : {}) })
          await startDevServer(entry)
        }} />
      {serverRestartNeeded && <div className="flex items-center justify-between border-b border-amber-700/50 bg-amber-950/30 px-4 py-2 text-xs text-amber-200"><span>Cấu hình máy chủ đã thay đổi. Khởi động lại để áp dụng.</span><button onClick={restartDevServer} className="rounded bg-amber-600 px-3 py-1 font-medium text-white hover:bg-amber-500">Restart server</button></div>}

      <PanelGroup
        key={projectId}
        ref={verticalGroupRef}
        direction="vertical"
        autoSaveId={`workspace-v-${projectId}`}
        className="flex-1 min-h-0 min-w-0"
      >
        <Panel defaultSize={100} minSize={40} className="min-h-0 min-w-0 overflow-hidden">
          <PanelGroup
            ref={horizontalGroupRef}
            direction="horizontal"
            autoSaveId={`workspace-h-${projectId}`}
            className="h-full w-full min-h-0 min-w-0"
          >
            <Panel
              ref={fileTreePanelRef}
              defaultSize={18}
              minSize={0}
              maxSize={35}
              collapsible
              collapsedSize={0}
              onCollapse={() => setIsFileTreeCollapsed(true)}
              onExpand={() => setIsFileTreeCollapsed(false)}
              onResize={(size) => {
                if (size <= 0.1 && !isFileTreeCollapsed) setIsFileTreeCollapsed(true)
                if (size > 0.1 && isFileTreeCollapsed) setIsFileTreeCollapsed(false)
              }}
              className="min-h-0 min-w-0 overflow-hidden"
            >
              <FileTree
                nodes={fileTree}
                activeFilePath={currentTab.activeFilePath}
                onSelectFile={(path) => onUpdateTab(projectId, { activeFilePath: path })}
                onRefresh={refreshFileTree}
              />
            </Panel>
            <PanelResizeHandle
              hitAreaMargins={{ coarse: 12, fine: 4 }}
              onDoubleClick={() => resetHorizontalLayout(true)}
              className="group relative z-10 w-[3px] shrink-0 bg-slate-800 hover:bg-blue-500/70 active:bg-blue-500 transition-colors cursor-col-resize"
              title="Kéo để đổi kích thước · nhấp đúp để đặt lại"
            >
              <div className="absolute inset-y-0 -left-1 -right-1" />
            </PanelResizeHandle>
            <Panel ref={editorPanelRef} defaultSize={41} minSize={20} className="min-h-0 min-w-0 overflow-hidden">
              <EditorPane ref={editorRef} readOnly={editorReadOnly} reloadToken={editorReload} filePath={currentTab.activeFilePath} settings={settings.editor} appThemeId={effectiveThemeId} flashMs={settings.preview.sourceJump.flashMs} errorMarker={compileErrorMarker} onCursorChange={handleEditorCursorChange} onFileChange={(file) => onUpdateTab(projectId, { activeFilePath: file })} />
            </Panel>
            <PanelResizeHandle
              hitAreaMargins={{ coarse: 12, fine: 4 }}
              onDoubleClick={() => resetHorizontalLayout()}
              className="group relative z-10 w-[3px] shrink-0 bg-slate-800 hover:bg-blue-500/70 active:bg-blue-500 transition-colors cursor-col-resize"
              title="Kéo để đổi kích thước · nhấp đúp để đặt lại"
            >
              <div className="absolute inset-y-0 -left-1 -right-1" />
            </PanelResizeHandle>
            <Panel ref={previewPanelRef} defaultSize={41} minSize={20} className="min-h-0 min-w-0 overflow-hidden">
              <ErrorBoundary label="Preview">
              <PreviewPane
                ref={previewRef}
                url={currentTab.serverUrl}
                lanUrl={currentTab.lanUrl}
                status={currentTab.status}
                error={currentTab.error}
                compileError={processSnapshot.compileError}
                onGotoError={() => void gotoCompileError()}
                onDismissCompileError={() => processStore.dismissCompileError(projectId)}
                isRecompiling={isRecompiling}
                restoreSuffix={activeRestoreTarget?.suffix || null}
                restoreSlideNo={settings.preview.restoreSlideAfterRestart ? activeRestoreTarget?.slideNo || null : null}
                onRestoreComplete={() => {
                  setRestoreTarget((target) => target?.projectId === projectId ? null : target)
                }}
                onRetry={() => startDevServer()}
                onOpenConsole={() => setConsoleOpen(true)}
                onSourceClick={handleSourceClick}
              />
              </ErrorBoundary>
            </Panel>
          </PanelGroup>
        </Panel>

        {isConsoleOpen && (
          <PanelResizeHandle
            hitAreaMargins={{ coarse: 12, fine: 4 }}
            onDoubleClick={resetVerticalLayout}
            className="group relative z-10 h-[3px] shrink-0 bg-slate-800 hover:bg-blue-500/70 active:bg-blue-500 transition-colors cursor-row-resize"
            title="Kéo để đổi chiều cao · nhấp đúp để đặt lại"
          >
            <div className="absolute -top-1 -bottom-1 inset-x-0" />
          </PanelResizeHandle>
        )}
        <Panel
          ref={consolePanelRef}
          defaultSize={0}
          minSize={10}
          maxSize={60}
          collapsible
          collapsedSize={0}
          onCollapse={() => {
            if (projectId) localStorage.setItem(`slidev-console-open-${projectId}`, 'false')
            setConsoleVisibility({ projectId, open: false })
          }}
          onExpand={() => {
            if (projectId) localStorage.setItem(`slidev-console-open-${projectId}`, 'true')
            setConsoleVisibility({ projectId, open: true })
          }}
          className="min-h-0 min-w-0 overflow-hidden"
        >
          {isConsoleOpen && (
            <ProcessConsole
              logs={currentTab.logs}
              onClear={() => projectId && processStore.clearLogs(projectId)}
              onClose={() => setConsoleOpen(false)}
            />
          )}
        </Panel>
      </PanelGroup>

      {/* Export Dialog */}
      <ExportDialog
        isOpen={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        collaborationProjectId={collabStatus ? projectId : undefined}
        projectPath={currentTab.project.path}
        entryFiles={collabStatus ? ['slides.md'] : currentTab.project.entryFiles}
        currentEntryFile={collabStatus ? 'slides.md' : currentTab.activeEntryFile}
        defaultFormat={settings.export.defaultFormat}
        defaultOptions={settings.export.defaultOptions}
        outputDir={settings.export.outputDir}
        openFolderAfterExport={settings.export.openFolderAfterExport}
      />
      {sourceToast && <div className="fixed bottom-5 left-1/2 z-[70] -translate-x-1/2 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs text-slate-100 shadow-xl">{sourceToast}</div>}
    </div>
  )
}
