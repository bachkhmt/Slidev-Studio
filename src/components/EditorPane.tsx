import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import Editor, { type BeforeMount, type OnMount } from '@monaco-editor/react'
import { Save, Check, Clock } from 'lucide-react'
import api from '../ipc-client'
import type { AppSettings } from '../../shared/settings'
import type { SourceLocation } from '../lib/sourceLocator'
import { checkSlideMarkdown } from '../lib/markdownGuard'
import { getTheme } from '../themes/registry'

interface EditorPaneProps {
  readOnly?: boolean
  reloadToken?: number
  filePath?: string
  settings: AppSettings['editor']
  appThemeId: string
  flashMs: number
  onFileChange?: (file: string) => void
  onDirtyChange?: (dirty: boolean) => void
  onCursorChange?: (file: string, line: number) => void
  errorMarker?: { file: string; line: number; column?: number; message: string }
}

export interface EditorPaneHandle {
  reveal: (location: SourceLocation) => void
  flush: () => Promise<void>
}

function getLanguageByPath(filePath?: string): string {
  if (!filePath) return 'markdown'
  const lower = filePath.toLowerCase()
  if (lower.endsWith('.md')) return 'markdown'
  if (lower.endsWith('.vue')) return 'html'
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'typescript'
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) return 'javascript'
  if (lower.endsWith('.css')) return 'css'
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml'
  return 'markdown'
}

function defineTheme(monaco: any, themeId: string): string {
  const theme = getTheme(themeId)
  const name = `studio-${theme.id}`
  monaco.editor.defineTheme(name, {
    base: theme.monacoBase,
    inherit: true,
    rules: [],
    colors: {
      'editor.background': theme.bg,
      'editor.foreground': theme.fg,
      'editorLineNumber.foreground': theme.fgMuted,
      'editorCursor.foreground': theme.accent,
      'editor.selectionBackground': `${theme.accent}55`,
      'editor.inactiveSelectionBackground': `${theme.accent}30`,
      'editor.lineHighlightBackground': `${theme.surface}88`,
      'editorGutter.background': theme.bg
    }
  })
  return name
}

export const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>(({
  readOnly = false,
  reloadToken = 0,
  filePath,
  settings,
  appThemeId,
  flashMs,
  onFileChange,
  onDirtyChange,
  onCursorChange,
  errorMarker
}, ref) => {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const [guardProblem, setGuardProblem] = useState<{ line: number; reason: string }>()
  const [lineInfo, setLineInfo] = useState({ line: 1, col: 1 })
  const isDirtyRef = useRef(false)
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const filePathRef = useRef(filePath)
  const contentPathRef = useRef(filePath)
  const saveFileRef = useRef<(targetPath: string, text: string, retry?: number) => Promise<void>>(async () => {})
  const mountedRef = useRef(true)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const decorationRef = useRef<string[]>([])
  const pendingRevealRef = useRef<SourceLocation | null>(null)
  const currentContentRef = useRef('')
  const settingsRef = useRef(settings)
  const errorMarkerRef = useRef(errorMarker)
  const flashMsRef = useRef(flashMs)
  const onCursorChangeRef = useRef(onCursorChange)
  const readOnlyRef = useRef(readOnly)
  readOnlyRef.current = readOnly

  settingsRef.current = settings
  errorMarkerRef.current = errorMarker
  flashMsRef.current = flashMs
  onCursorChangeRef.current = onCursorChange
  filePathRef.current = filePath

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const applyReveal = useCallback((location: SourceLocation) => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco || loading) {
      pendingRevealRef.current = location
      return
    }
    const model = editor.getModel()
    if (!model) {
      pendingRevealRef.current = location
      return
    }
    const line = Math.max(1, Math.min(location.line, model.getLineCount()))
    const column = Math.max(1, Math.min(location.column || 1, model.getLineMaxColumn(line)))
    const endColumn = Math.min(model.getLineMaxColumn(line), column + Math.max(0, location.length || 0))
    editor.revealLineInCenterIfOutsideViewport(line)
    editor.setSelection(new monaco.Selection(line, column, line, Math.max(column, endColumn)))
    editor.focus()
    decorationRef.current = editor.deltaDecorations(decorationRef.current, [{
      range: new monaco.Range(line, column, line, Math.max(column, endColumn)),
      options: { className: 'jump-flash', isWholeLine: location.length === 0, stickiness: 1 }
    }])
    setTimeout(() => {
      if (editorRef.current) decorationRef.current = editorRef.current.deltaDecorations(decorationRef.current, [])
    }, flashMsRef.current)
    pendingRevealRef.current = null
  }, [loading])

  useImperativeHandle(ref, () => ({
    flush: async () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      while (isDirtyRef.current && contentPathRef.current) await saveFileRef.current(contentPathRef.current, currentContentRef.current, -1)
    },
    reveal: (location) => {
      if (location.file !== filePath) {
        pendingRevealRef.current = location
        onFileChange?.(location.file)
        return
      }
      applyReveal(location)
    }
  }), [applyReveal, filePath, onFileChange])

  useEffect(() => {
    if (!filePath) {
      setContent('')
      setGuardProblem(undefined)
      setIsDirty(false)
      isDirtyRef.current = false
      contentPathRef.current = undefined
      currentContentRef.current = ''
      onDirtyChange?.(false)
      return
    }
    let cancelled = false
    setLoading(true)
    contentPathRef.current = filePath
    currentContentRef.current = ''
    setContent('')
    setGuardProblem(undefined)
    setIsDirty(false)
    isDirtyRef.current = false
    onDirtyChange?.(false)
    api.fs.readFile(filePath).then((data) => {
      if (cancelled) return
      setContent(data)
      currentContentRef.current = data
      contentPathRef.current = filePath
      setIsDirty(false)
      isDirtyRef.current = false
      onDirtyChange?.(false)
      setSaveStatus('idle')
    }).catch((error: any) => {
      if (!cancelled) setContent(`// Không thể đọc file: ${error.message}`)
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => {
      cancelled = true
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
      const previousPath = contentPathRef.current
      if (isDirtyRef.current && previousPath) void saveFileRef.current(previousPath, currentContentRef.current)
    }
  }, [filePath, onDirtyChange, reloadToken])

  useEffect(() => {
    const flushDirty = () => {
      const targetPath = contentPathRef.current
      if (isDirtyRef.current && targetPath) void saveFileRef.current(targetPath, currentContentRef.current)
    }
    const handleVisibility = () => { if (document.visibilityState === 'hidden') flushDirty() }
    window.addEventListener('beforeunload', flushDirty)
    window.addEventListener('pagehide', flushDirty)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('beforeunload', flushDirty)
      window.removeEventListener('pagehide', flushDirty)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  useEffect(() => {
    const pending = pendingRevealRef.current
    if (!loading && pending && pending.file === filePath && editorRef.current) {
      requestAnimationFrame(() => applyReveal(pending))
    }
  }, [content, filePath, loading, applyReveal])

  const saveFile = useCallback(async (targetPath: string, textToSave: string, retry = 0) => {
    if (!targetPath || (readOnlyRef.current && retry !== -1)) return
    if (retry > 0 && (contentPathRef.current !== targetPath || currentContentRef.current !== textToSave)) return
    if (mountedRef.current && contentPathRef.current === targetPath) setSaveStatus('saving')
    try {
      await api.fs.writeFile(targetPath, textToSave)
      if (mountedRef.current && contentPathRef.current === targetPath && currentContentRef.current === textToSave) {
        setIsDirty(false)
        isDirtyRef.current = false
        onDirtyChange?.(false)
        setSaveStatus('saved')
        setGuardProblem(undefined)
        const model = editorRef.current?.getModel?.()
        if (model && monacoRef.current) monacoRef.current.editor.setModelMarkers(model, 'studio-guard', [])
        setTimeout(() => setSaveStatus((status) => status === 'saved' ? 'idle' : status), 2000)
      }
    } catch (error: any) {
      console.error('Lỗi khi ghi file:', error)
      if (mountedRef.current && contentPathRef.current === targetPath) {
        setSaveStatus('error')
        setSaveError(error?.message || 'Không thể ghi file')
      }
      if (retry === -1) throw error
      if (mountedRef.current && retry >= 0 && retry < 3) {
        setTimeout(() => {
          const stillNeedsRetry = contentPathRef.current === targetPath && isDirtyRef.current && currentContentRef.current === textToSave
          if (mountedRef.current && stillNeedsRetry) void saveFileRef.current(targetPath, textToSave, retry + 1)
        }, 3000)
      }
    }
  }, [onDirtyChange])
  saveFileRef.current = saveFile

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    if (readOnly || !isDirty || settings.autoSave !== 'afterDelay') return
    debounceTimerRef.current = setTimeout(() => {
      const targetPath = contentPathRef.current
      if (!targetPath || targetPath !== filePathRef.current) return
      if (settingsRef.current.autoSaveGuard && targetPath.toLowerCase().endsWith('.md')) {
        const check = checkSlideMarkdown(currentContentRef.current)
        const model = editorRef.current?.getModel?.()
        if (!check.ok) {
          setGuardProblem({ line: check.line, reason: check.reason })
          setSaveStatus('idle')
          if (model && monacoRef.current) monacoRef.current.editor.setModelMarkers(model, 'studio-guard', [{
            severity: monacoRef.current.MarkerSeverity.Warning,
            message: check.reason,
            startLineNumber: check.line,
            startColumn: 1,
            endLineNumber: check.line,
            endColumn: model.getLineMaxColumn(check.line)
          }])
          return
        }
        setGuardProblem(undefined)
        if (model && monacoRef.current) monacoRef.current.editor.setModelMarkers(model, 'studio-guard', [])
      }
      void saveFileRef.current(targetPath, currentContentRef.current)
    }, settings.autoSaveDelayMs)
    return () => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current) }
  }, [readOnly, isDirty, content, filePath, settings.autoSave, settings.autoSaveDelayMs, settings.autoSaveGuard])

  useEffect(() => {
    const monaco = monacoRef.current
    const model = editorRef.current?.getModel?.()
    if (!settings.autoSaveGuard || !filePath?.toLowerCase().endsWith('.md')) {
      setGuardProblem(undefined)
      if (model && monaco) monaco.editor.setModelMarkers(model, 'studio-guard', [])
    }
  }, [settings.autoSaveGuard, filePath])

  useEffect(() => {
    const monaco = monacoRef.current
    const model = editorRef.current?.getModel?.()
    if (!model || !monaco) return
    const marker = errorMarker && filePath && errorMarker.file.replace(/\\/g, '/').toLowerCase() === filePath.replace(/\\/g, '/').toLowerCase()
      ? errorMarker
      : undefined
    const markerLine = marker ? Math.max(1, Math.min(marker.line, model.getLineCount())) : 1
    const markerColumn = marker ? Math.max(1, Math.min(marker.column || 1, model.getLineMaxColumn(markerLine))) : 1
    monaco.editor.setModelMarkers(model, 'studio-compile', marker ? [{
      severity: monaco.MarkerSeverity.Error,
      message: marker.message,
      startLineNumber: markerLine,
      startColumn: markerColumn,
      endLineNumber: markerLine,
      endColumn: Math.min(model.getLineMaxColumn(markerLine), markerColumn + 1)
    }] : [])
    return () => { if (model && monaco) monaco.editor.setModelMarkers(model, 'studio-compile', []) }
  }, [errorMarker, filePath, content, loading])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
        const targetPath = contentPathRef.current
        if (!loading && targetPath && targetPath === filePathRef.current) void saveFileRef.current(targetPath, currentContentRef.current)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [loading])

  const handleEditorChange = (value?: string) => {
    if (readOnlyRef.current) return
    const next = value ?? ''
    currentContentRef.current = next
    setContent(next)
    setIsDirty(true)
    isDirtyRef.current = true
    onDirtyChange?.(true)
  }

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    const themeName = defineTheme(monaco, appThemeId)
    monaco.editor.setTheme(settingsRef.current.monacoTheme === 'follow-app' ? themeName : settingsRef.current.monacoTheme)
    editor.onDidChangeCursorPosition((event) => {
      setLineInfo({ line: event.position.lineNumber, col: event.position.column })
      if (filePathRef.current) onCursorChangeRef.current?.(filePathRef.current, event.position.lineNumber)
    })
    const marker = errorMarkerRef.current
    const model = editor.getModel()
    if (marker && model && marker.file.replace(/\\/g, '/').toLowerCase() === (filePath || '').replace(/\\/g, '/').toLowerCase()) {
      monaco.editor.setModelMarkers(model, 'studio-compile', [{
        severity: monaco.MarkerSeverity.Error,
        message: marker.message,
        startLineNumber: marker.line,
        startColumn: marker.column || 1,
        endLineNumber: marker.line,
        endColumn: model.getLineMaxColumn(marker.line)
      }])
    }
    editor.onDidBlurEditorWidget(() => {
      if (settingsRef.current.autoSave === 'onBlur' && isDirtyRef.current) {
        const targetPath = contentPathRef.current
        if (targetPath && targetPath === filePathRef.current) void saveFileRef.current(targetPath, currentContentRef.current)
      }
    })
    if (pendingRevealRef.current?.file === filePath) requestAnimationFrame(() => applyReveal(pendingRevealRef.current!))
  }

  const beforeMount: BeforeMount = (monaco) => {
    const themeName = defineTheme(monaco, appThemeId)
    monaco.editor.setTheme(settings.monacoTheme === 'follow-app' ? themeName : settings.monacoTheme)
  }

  useEffect(() => {
    if (!monacoRef.current) return
    const themeName = defineTheme(monacoRef.current, appThemeId)
    monacoRef.current.editor.setTheme(settings.monacoTheme === 'follow-app' ? themeName : settings.monacoTheme)
  }, [appThemeId, settings.monacoTheme])

  useEffect(() => {
    document.documentElement.style.setProperty('--jump-flash-ms', `${flashMs}ms`)
  }, [flashMs])

  const fileName = filePath ? filePath.split('/').pop() : 'Chưa chọn file'
  const language = getLanguageByPath(filePath)

  return <div className="flex h-full flex-col border-r border-slate-800 bg-slate-950">
    <div className="app-chrome flex items-center justify-between border-b border-slate-800 px-3 py-2 text-xs">
      <div className="flex min-w-0 items-center gap-2"><span className="truncate font-semibold text-slate-200">{fileName}{readOnly ? ' · Chỉ xem' : ''}</span>{isDirty && <span className="h-2 w-2 rounded-full bg-amber-400" title="Có thay đổi chưa ghi" />}<span className="hidden max-w-[200px] truncate font-mono text-[11px] text-slate-500 sm:inline" title={filePath}>{filePath}</span></div>
      <div className="flex items-center gap-2">{guardProblem && <span className="max-w-[290px] truncate text-[11px] text-amber-300" title={`${guardProblem.reason} — dòng ${guardProblem.line}`}>Chưa lưu (tạm dừng autosave): {guardProblem.reason} — dòng {guardProblem.line}</span>}{saveStatus === 'saving' && <span className="flex items-center gap-1 text-[11px] text-amber-400"><Clock className="h-3 w-3 animate-spin" />Đang lưu...</span>}{saveStatus === 'saved' && <span className="flex items-center gap-1 text-[11px] text-emerald-400"><Check className="h-3 w-3" />Đã tự động lưu</span>}{saveStatus === 'error' && <span title={saveError} className="max-w-[220px] truncate text-[11px] text-rose-400">Lỗi lưu — đang thử lại</span>}<button onClick={() => { if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current); const targetPath = contentPathRef.current; if (targetPath && targetPath === filePathRef.current) void saveFileRef.current(targetPath, currentContentRef.current) }} disabled={readOnly || !filePath || !isDirty} title="Lưu thủ công (Cmd+S / Ctrl+S)" className="flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-slate-300 transition-colors hover:bg-slate-700 hover:text-slate-50 disabled:opacity-40"><Save className="h-3.5 w-3.5" /><span className="text-[11px]">Lưu</span></button></div>
    </div>
    <div className="relative flex-1 overflow-hidden">
      {loading ? <div className="flex h-full items-center justify-center text-sm text-slate-500">Đang tải nội dung...</div> : !filePath ? <div className="flex h-full items-center justify-center text-sm text-slate-500">Chọn một file từ danh sách bên trái để chỉnh sửa</div> : <Editor
        height="100%" theme={settings.monacoTheme === 'follow-app' ? `studio-${appThemeId}` : settings.monacoTheme}
        path={filePath} defaultLanguage={language} value={content} onChange={handleEditorChange} onMount={handleEditorDidMount} beforeMount={beforeMount}
        options={{ readOnly, fontSize: settings.fontSize, lineNumbers: settings.lineNumbers ? 'on' : 'off', minimap: { enabled: settings.minimap, maxColumn: 40 }, wordWrap: settings.wordWrap, scrollBeyondLastLine: false, automaticLayout: true, tabSize: settings.tabSize, renderWhitespace: settings.renderWhitespace, fontFamily: settings.fontFamily, fontLigatures: settings.fontLigatures }}
      />}
    </div>
    <div className="app-chrome flex items-center justify-between border-t border-slate-800 px-3 py-1 font-mono text-[11px] text-slate-400"><div className="flex items-center gap-3"><span>Dòng {lineInfo.line}, Cột {lineInfo.col}</span><span>{language.toUpperCase()}</span><span>UTF-8</span></div><div>{settings.autoSave === 'off' ? 'Tự động lưu: tắt' : settings.autoSave === 'onBlur' ? 'Tự động lưu khi rời Editor' : `Tự động lưu (${settings.autoSaveDelayMs}ms)`}</div></div>
  </div>
})

EditorPane.displayName = 'EditorPane'
