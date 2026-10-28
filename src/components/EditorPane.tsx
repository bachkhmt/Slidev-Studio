import '../monaco'
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useMemo,
  useSyncExternalStore
} from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import { documents } from '../state/documents'
import { modelCache } from '../state/modelCache'
import { documentKey } from '../state/documentStore'
import type { AppSettings } from '../../shared/settings'
import type { SourceLocation } from '../lib/sourceLocator'
import { getTheme } from '../themes/registry'

interface EditorPaneProps {
  projectRoot?: string
  active?: boolean
  readOnly?: boolean
  interactionLocked?: boolean
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

export const EditorPane = forwardRef<EditorPaneHandle, EditorPaneProps>((props, ref) => {
  const {
    filePath = '',
    settings,
    readOnly = false,
    interactionLocked = false,
    reloadToken = 0,
    active = true,
    appThemeId,
    flashMs,
    onFileChange,
    onDirtyChange,
    onCursorChange,
    errorMarker
  } = props
  const latest = useRef(props)
  latest.current = props
  const subscribe = useCallback((fn: () => void) => documents.subscribe(filePath, fn), [filePath])
  const getSnapshot = useCallback(() => documents.get(filePath), [filePath])
  const doc = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [editorInstance, setEditorInstance] = useState<any>(null)
  const editorRef = useRef<any>(null),
    monacoRef = useRef<any>(null)
  const pendingReveal = useRef<SourceLocation | null>(null)
  const flash = useRef<{ model: any; ids: string[]; timer: ReturnType<typeof setTimeout> }>()
  const disposables = useRef<Array<{ dispose: () => void }>>([])
  const [display, setDisplay] = useState<{ path: string; content: string }>()
  const isDirty = doc.revision !== doc.savedRevision
  useEffect(() => {
    documents.configure(settings)
  }, [settings])
  useEffect(() => {
    if (filePath && active) {
      documents.setWritable(filePath, !readOnly)
      void documents.load(filePath, reloadToken > 0)
    }
  }, [filePath, readOnly, reloadToken, active])
  useEffect(() => {
    const refresh = () => {
      if (latest.current.filePath && latest.current.active !== false) void documents.load(latest.current.filePath)
    }
    window.addEventListener('focus', refresh)
    return () => window.removeEventListener('focus', refresh)
  }, [])
  useEffect(() => {
    onDirtyChange?.(isDirty)
  }, [isDirty, onDirtyChange])
  useEffect(() => {
    if (filePath && !doc.loading) setDisplay({ path: filePath, content: doc.content })
  }, [filePath, doc.loading, doc.content])
  const save = useCallback(() => {
    if (latest.current.filePath && !latest.current.readOnly && !latest.current.interactionLocked)
      void documents.save(latest.current.filePath).catch(() => {})
  }, [])
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        e.key.toLowerCase() === 's' &&
        !latest.current.readOnly &&
        !latest.current.interactionLocked
      ) {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [save])
  const reveal = useCallback((location: SourceLocation) => {
    if (latest.current.filePath !== location.file || !editorRef.current || documents.get(location.file).loading) {
      pendingReveal.current = location
      if (latest.current.filePath !== location.file) latest.current.onFileChange?.(location.file)
      return
    }
    const editor = editorRef.current,
      monaco = monacoRef.current,
      model = editor.getModel()
    if (!model) return
    const line = Math.max(1, Math.min(location.line, model.getLineCount()))
    const column = Math.max(1, Math.min(location.column || 1, model.getLineMaxColumn(line)))
    editor.revealLineInCenterIfOutsideViewport(line)
    editor.setSelection(
      new monaco.Selection(line, column, line, Math.min(model.getLineMaxColumn(line), column + (location.length || 0)))
    )
    editor.focus()
    if (flash.current) {
      clearTimeout(flash.current.timer)
      if (!flash.current.model.isDisposed()) flash.current.model.deltaDecorations(flash.current.ids, [])
    }
    const ids = model.deltaDecorations(
      [],
      [
        {
          range: new monaco.Range(
            line,
            column,
            line,
            Math.min(model.getLineMaxColumn(line), column + Math.max(0, location.length || 0))
          ),
          options: { className: 'jump-flash', isWholeLine: !location.length }
        }
      ]
    )
    flash.current = {
      model,
      ids,
      timer: setTimeout(() => {
        if (!model.isDisposed()) model.deltaDecorations(ids, [])
      }, latest.current.flashMs)
    }
    pendingReveal.current = null
  }, [])
  useImperativeHandle(
    ref,
    () => ({
      reveal,
      flush: () =>
        latest.current.projectRoot
          ? documents.flushProject(latest.current.projectRoot)
          : documents.save(latest.current.filePath || '')
    }),
    [reveal]
  )
  const trackModel = useCallback(() => {
    const path = latest.current.filePath,
      editor = editorRef.current
    if (path && editor?.getModel()) modelCache.touch(path, editor.getModel(), editor.saveViewState())
  }, [])
  const displayPath = display ? documentKey(display.path) : undefined
  useEffect(() => {
    if (!displayPath || !monacoRef.current) return
    const model = monacoRef.current.editor.getModel(monacoRef.current.Uri.parse(displayPath))
    if (model) {
      const view = modelCache.viewFor(model)
      modelCache.touch(displayPath, model)
      if (view) editorRef.current?.restoreViewState(view)
    }
    if (pendingReveal.current && documentKey(pendingReveal.current.file) === displayPath) reveal(pendingReveal.current)
  }, [displayPath, editorInstance, reveal])
  useEffect(() => {
    const monaco = monacoRef.current
    if (monaco)
      monaco.editor.setTheme(
        settings.monacoTheme === 'follow-app' ? defineTheme(monaco, appThemeId) : settings.monacoTheme
      )
  }, [appThemeId, settings.monacoTheme])
  useEffect(() => {
    document.documentElement.style.setProperty('--jump-flash-ms', `${flashMs}ms`)
  }, [flashMs])
  useEffect(() => {
    const model = editorRef.current?.getModel(),
      monaco = monacoRef.current
    if (!model || !monaco) return
    const marker =
      errorMarker && errorMarker.file.replace(/\\/g, '/').toLowerCase() === filePath.replace(/\\/g, '/').toLowerCase()
        ? errorMarker
        : undefined
    const line = marker ? Math.min(marker.line, model.getLineCount()) : 1
    monaco.editor.setModelMarkers(
      model,
      'studio-compile',
      marker
        ? [
            {
              severity: monaco.MarkerSeverity.Error,
              message: marker.message,
              startLineNumber: line,
              endLineNumber: line,
              startColumn: Math.max(1, Math.min(marker.column || 1, model.getLineMaxColumn(line))),
              endColumn: model.getLineMaxColumn(line)
            }
          ]
        : []
    )
  }, [errorMarker, filePath, display?.path, editorInstance])
  useEffect(() => {
    const model = editorRef.current?.getModel(),
      monaco = monacoRef.current
    if (!model || !monaco) return
    const guard = doc.guard,
      line = guard ? Math.min(guard.line, model.getLineCount()) : 1
    monaco.editor.setModelMarkers(
      model,
      'studio-guard',
      guard
        ? [
            {
              severity: monaco.MarkerSeverity.Warning,
              message: guard.reason,
              startLineNumber: line,
              endLineNumber: line,
              startColumn: 1,
              endColumn: model.getLineMaxColumn(line)
            }
          ]
        : []
    )
  }, [doc.guard, displayPath, editorInstance])
  useEffect(
    () => () => {
      disposables.current.forEach((d) => d.dispose())
      disposables.current = []
      if (flash.current) {
        clearTimeout(flash.current.timer)
        if (!flash.current.model.isDisposed()) flash.current.model.deltaDecorations(flash.current.ids, [])
      }
      setTimeout(() => modelCache.prune(), 0)
    },
    []
  )
  const mounted: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor
      monacoRef.current = monaco
      setEditorInstance(editor)
      monaco.editor.setTheme(
        latest.current.settings.monacoTheme === 'follow-app'
          ? defineTheme(monaco, latest.current.appThemeId)
          : latest.current.settings.monacoTheme
      )
      disposables.current.push(
        editor.onDidBlurEditorWidget(() => {
          if (latest.current.filePath) documents.blur(latest.current.filePath)
        })
      )
      disposables.current.push(
        editor.onWillChangeModel(() => modelCache.remember(editor.getModel(), editor.saveViewState()))
      )
      disposables.current.push(
        editor.onDidChangeModel(() => {
          modelCache.prune()
          const view = modelCache.viewFor(editor.getModel())
          if (view) editor.restoreViewState(view)
        })
      )
      trackModel()
      if (pendingReveal.current) reveal(pendingReveal.current)
    },
    [reveal, trackModel]
  )
  const options = useMemo(
    () => ({
      readOnly: readOnly || interactionLocked || doc.loading || !!doc.readError,
      fontSize: settings.fontSize,
      lineNumbers: settings.lineNumbers ? ('on' as const) : ('off' as const),
      minimap: { enabled: settings.minimap, maxColumn: 40 },
      wordWrap: settings.wordWrap,
      scrollBeyondLastLine: false,
      automaticLayout: true,
      tabSize: settings.tabSize,
      renderWhitespace: settings.renderWhitespace,
      fontFamily: settings.fontFamily,
      fontLigatures: settings.fontLigatures
    }),
    [settings, readOnly, interactionLocked, doc.loading, doc.readError]
  )
  const onChange = useCallback((value?: string) => {
    const current = latest.current
    if (current.filePath && !current.readOnly && !current.interactionLocked)
      documents.edit(current.filePath, value || '')
  }, [])
  return (
    <div className="flex h-full flex-col border-r border-slate-800 bg-slate-950">
      <div className="app-chrome flex items-center justify-between border-b border-slate-800 px-3 py-2 text-xs">
        <span className="truncate font-semibold text-slate-200">
          {filePath.split(/[\\/]/).pop() || 'Chưa chọn file'}
          {readOnly ? ' · Chỉ xem' : ''}{' '}
          {isDirty && (
            <span title="Có thay đổi chưa ghi" className="text-amber-400">
              ●
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {doc.guard && (
            <span className="text-amber-300" title={doc.guard.reason}>
              Tạm dừng tự lưu · dòng {doc.guard.line}
            </span>
          )}
          {doc.saving && <span className="text-amber-400">Đang lưu...</span>}
          {doc.error && (
            <span role="alert" title={doc.error} className="text-rose-400">
              {doc.error}
            </span>
          )}
          {doc.readError && <button onClick={() => void documents.load(filePath, true)}>Thử đọc lại</button>}
          {!isDirty && !doc.loading && <span className="text-emerald-400">Đã lưu</span>}
          <button
            onClick={save}
            disabled={readOnly || interactionLocked || !isDirty || doc.loading}
            title="Lưu thủ công (Cmd+S / Ctrl+S)"
            className="rounded bg-slate-800 px-2.5 py-1 disabled:opacity-40"
          >
            Lưu
          </button>
        </div>
      </div>
      <div className="relative flex-1 overflow-hidden">
        {display && (
          <Editor
            height="100%"
            path={displayPath}
            defaultLanguage={getLanguageByPath(display.path)}
            language={getLanguageByPath(display.path)}
            value={display.content}
            keepCurrentModel
            saveViewState={false}
            onChange={onChange}
            onMount={mounted}
            options={options}
            theme={settings.monacoTheme === 'follow-app' ? `studio-${appThemeId}` : settings.monacoTheme}
          />
        )}
        {doc.loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950 text-slate-500">
            Đang tải nội dung...
          </div>
        )}
      </div>
      <EditorStatus editor={editorInstance} filePath={filePath} onCursorChange={onCursorChange} settings={settings} />
    </div>
  )
})
const EditorStatus = React.memo(
  ({
    editor,
    filePath,
    onCursorChange,
    settings
  }: {
    editor: any
    filePath: string
    onCursorChange?: (file: string, line: number) => void
    settings: AppSettings['editor']
  }) => {
    const [position, setPosition] = useState({ line: 1, col: 1 })
    useEffect(() => {
      if (!editor) return
      const disposable = editor.onDidChangeCursorPosition((e: any) => {
        setPosition({ line: e.position.lineNumber, col: e.position.column })
        onCursorChange?.(filePath, e.position.lineNumber)
      })
      return () => disposable.dispose()
    }, [editor, filePath, onCursorChange])
    return (
      <div className="app-chrome flex justify-between border-t border-slate-800 px-3 py-1 font-mono text-[11px] text-slate-400">
        <span>
          Dòng {position.line}, Cột {position.col} · {getLanguageByPath(filePath).toUpperCase()} · UTF-8
        </span>
        <span>
          {settings.autoSave === 'off'
            ? 'Tự động lưu: tắt'
            : settings.autoSave === 'onBlur'
              ? 'Tự động lưu khi rời Editor'
              : `Tự động lưu (${settings.autoSaveDelayMs}ms)`}
        </span>
      </div>
    )
  }
)
EditorPane.displayName = 'EditorPane'
