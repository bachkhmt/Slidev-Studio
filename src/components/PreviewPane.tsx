import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import {
  RotateCw, ExternalLink, ChevronLeft, ChevronRight, Presentation, AlertCircle, Loader2,
  GalleryHorizontal, Rows3, PanelsTopLeft, ZoomIn, ZoomOut
} from 'lucide-react'
import type { ProcessStatusType } from '../ipc-client'
import { useSettings } from '../settings/SettingsContext'
import { getTheme } from '../themes/registry'
import type { SourceClickPayload } from '../../shared/preview-bridge'

interface PreviewPaneProps {
  url?: string
  lanUrl?: string
  status: ProcessStatusType
  error?: string
  compileError?: { summary: string; raw: string; file?: string; line?: number; column?: number; slideNo?: number }
  isRecompiling?: boolean
  restoreSuffix?: string | null
  restoreSlideNo?: number | null
  onRestoreComplete?: () => void
  onRetry: () => void
  onOpenConsole: () => void
  onGotoError?: () => void
  onDismissCompileError?: () => void
  onSourceClick?: (payload: SourceClickPayload) => void
}

export interface PreviewPaneHandle {
  getCurrentSuffix: () => string | null
  getCurrentSlideNo: () => number
  goto: (slideNo: number) => void
}

const routeUrl = (base: string, mode: string, no: number) => {
  const root = base.replace(/\/$/, '')
  const slideNo = Math.max(1, no)
  return mode === 'paged' ? `${root}/${slideNo}` : `${root}/overview?mode=preview&slideNo=${slideNo}`
}

export const PreviewPane = forwardRef<PreviewPaneHandle, PreviewPaneProps>(({
  url, lanUrl, status, error, compileError, isRecompiling = false, restoreSuffix,
  restoreSlideNo, onRestoreComplete, onRetry, onOpenConsole, onGotoError, onDismissCompileError, onSourceClick
}, ref) => {
  const webviewRef = useRef<any>(null)
  const domReadyRef = useRef(false)
  const { settings, effectiveThemeId, update } = useSettings()
  const [preloadPath, setPreloadPath] = useState('')
  const [currentSlide, setCurrentSlide] = useState({ no: 1, total: 1 })
  const [zoomFactor, setZoomFactor] = useState(1)
  const [viewSource, setViewSource] = useState('')
  const previousModeRef = useRef(settings.preview.navMode)
  const loadedUrlRef = useRef('')
  const assignedUrlRef = useRef('')
  const theme = getTheme(effectiveThemeId)
  const currentSlideRef = useRef(currentSlide.no)
  currentSlideRef.current = currentSlide.no

  useEffect(() => { setZoomFactor(1) }, [url])

  useEffect(() => { apiPreviewPreloadPath() }, [])
  async function apiPreviewPreloadPath() {
    try { setPreloadPath(await window.api.preview.getPreloadPath()) } catch { setPreloadPath('') }
  }

  useImperativeHandle(ref, () => ({
    getCurrentSuffix: () => {
      let currentUrl = ''
      try { if (domReadyRef.current) currentUrl = webviewRef.current?.getURL?.() || '' } catch { return null }
      if (!currentUrl) return null
      try { const parsed = new URL(currentUrl); return `${parsed.pathname}${parsed.search}${parsed.hash}` } catch { return null }
    },
    getCurrentSlideNo: () => currentSlide.no,
    goto: (slideNo) => { try { if (domReadyRef.current) webviewRef.current?.send?.('studio:goto', { no: slideNo }) } catch { /* Guest is navigating. */ } }
  }), [currentSlide.no])

  const sendSettingsToGuest = useCallback(() => {
    const guest = webviewRef.current
    if (!domReadyRef.current || !guest?.send) return
    try { guest.send('studio:set-mode', {
      ...settings.preview,
      zoomFactor,
      appThemeKind: theme.kind,
      appThemeBg: theme.bg,
      sourceJumpEnabled: settings.preview.sourceJump.enabled,
      sourceJumpTrigger: settings.preview.sourceJump.trigger
    })
    guest.send('studio:set-jump', {
      enabled: settings.preview.sourceJump.enabled,
      trigger: settings.preview.sourceJump.trigger
    }) } catch { /* The guest may be navigating while settings are updated. */ }
    if (settings.preview.navMode !== 'paged' && currentSlideRef.current > 1) {
      try { guest.send('studio:goto', { no: currentSlideRef.current }) } catch { /* Guest is navigating. */ }
    }
  }, [settings.preview, theme.kind, theme.bg, zoomFactor])

  useEffect(() => {
    if (status !== 'running' || !url || !webviewRef.current) return
    const slideNo = restoreSlideNo || currentSlideRef.current || 1
    const modeChanged = previousModeRef.current !== settings.preview.navMode
    const nextUrl = !modeChanged && settings.preview.navMode === 'paged' && restoreSuffix
      ? `${url.replace(/\/$/, '')}${restoreSuffix.startsWith('/') ? restoreSuffix : `/${restoreSuffix}`}`
      : routeUrl(url, settings.preview.navMode, slideNo)
    const serverChanged = loadedUrlRef.current !== url
    previousModeRef.current = settings.preview.navMode
    const routeChanged = assignedUrlRef.current !== nextUrl
    if (serverChanged || !assignedUrlRef.current || (modeChanged && routeChanged)) {
      loadedUrlRef.current = url
      assignedUrlRef.current = nextUrl
      webviewRef.current.src = nextUrl
      if (restoreSlideNo || restoreSuffix) onRestoreComplete?.()
      return
    }
    if (modeChanged) assignedUrlRef.current = nextUrl
    sendSettingsToGuest()
  }, [url, status, settings.preview, settings.preview.navMode, theme.kind, restoreSlideNo, restoreSuffix, onRestoreComplete, sendSettingsToGuest])

  useEffect(() => {
    if (status === 'starting' && !settings.preview.restoreSlideAfterRestart) {
      setCurrentSlide((value) => ({ ...value, no: 1 }))
    }
  }, [status, settings.preview.restoreSlideAfterRestart])

  useEffect(() => {
    if (!webviewRef.current) return
    sendSettingsToGuest()
  }, [settings.preview, effectiveThemeId, preloadPath, sendSettingsToGuest])

  const handleGuestMessage = useCallback((event: any) => {
    const [payload] = event.args || []
    if (event.channel === 'studio:ready') {
      if (payload?.no) setCurrentSlide((value) => ({ ...value, no: value.no === 1 ? payload.no : value.no }))
      sendSettingsToGuest()
    } else if (event.channel === 'studio:slide-changed') {
      setCurrentSlide({ no: Number(payload?.no) || 1, total: Number(payload?.total) || 1 })
    } else if (event.channel === 'studio:source-click' && payload) {
      onSourceClick?.(payload as SourceClickPayload)
    } else if (event.channel === 'studio:wheel-nav') {
      const keyCode = Number(payload?.direction) > 0 ? 'Right' : 'Left'
      webviewRef.current?.sendInputEvent?.({ type: 'keyDown', keyCode })
      webviewRef.current?.sendInputEvent?.({ type: 'keyUp', keyCode })
    }
  }, [onSourceClick, sendSettingsToGuest])

  useLayoutEffect(() => {
    const guest = webviewRef.current
    if (!guest) return
    const onMessage = (event: any) => handleGuestMessage(event)
    const onDomReady = () => { domReadyRef.current = true; sendSettingsToGuest() }
    const onDestroyed = () => { domReadyRef.current = false; assignedUrlRef.current = '' }
    const onLoaded = () => { domReadyRef.current = true; sendSettingsToGuest() }
    guest.addEventListener('ipc-message', onMessage)
    guest.addEventListener('dom-ready', onDomReady)
    guest.addEventListener('destroyed', onDestroyed)
    guest.addEventListener('did-finish-load', onLoaded)
    return () => {
      guest.removeEventListener('ipc-message', onMessage)
      guest.removeEventListener('dom-ready', onDomReady)
      guest.removeEventListener('destroyed', onDestroyed)
      guest.removeEventListener('did-finish-load', onLoaded)
      domReadyRef.current = false
      assignedUrlRef.current = ''
    }
  }, [handleGuestMessage, sendSettingsToGuest])

  const setMode = (mode: typeof settings.preview.navMode) => {
    void update({ preview: { navMode: mode } })
  }
  const changeZoom = (direction: -1 | 1) => {
    setZoomFactor((value) => Math.min(2.5, Math.max(0.5, Math.round((value + direction * 0.1) * 100) / 100)))
  }
  const fitWidthAuto = () => {
    setZoomFactor(1)
    if (settings.preview.fitMode !== 'fit-width') void update({ preview: { fitMode: 'fit-width' } })
  }
  const handleReload = () => webviewRef.current?.reload?.()
  const navigateByKey = (keyCode: 'Left' | 'Right', fallback: number) => {
    const guest = webviewRef.current
    if (guest?.sendInputEvent) {
      guest.sendInputEvent({ type: 'keyDown', keyCode })
      guest.sendInputEvent({ type: 'keyUp', keyCode })
    } else guest?.send?.('studio:goto', { no: fallback })
  }
  const handlePrevSlide = () => navigateByKey('Left', Math.max(1, currentSlide.no - 1))
  const handleNextSlide = () => navigateByKey('Right', currentSlide.no + 1)
  const handleOpenExternal = () => url && window.open(url, '_blank')
  const handleOpenPresenter = () => url && window.open(`${url.replace(/\/$/, '')}/${currentSlide.no}?mode=presenter`, '_blank')

  return <div className="flex h-full flex-col overflow-hidden bg-slate-950">
    <div className="app-chrome flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 px-3 py-2 text-xs">
      <div className="flex min-w-0 items-center gap-1.5">
        <button onClick={handlePrevSlide} disabled={status !== 'running'} title="Slide trước (←)" className="rounded p-1 text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-50 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
        <button onClick={handleNextSlide} disabled={status !== 'running'} title="Slide sau (→)" className="rounded p-1 text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-50 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
        <button onClick={handleReload} disabled={status !== 'running'} title="Tải lại trang" className="rounded p-1 text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-50 disabled:opacity-30"><RotateCw className="h-3.5 w-3.5" /></button>
        <span className="mx-1 h-4 w-px bg-slate-700" />
        <span className="whitespace-nowrap font-mono text-[11px] text-slate-300">Slide {currentSlide.no} / {currentSlide.total}</span>
        <div className="ml-1 flex rounded-md border border-slate-700 bg-slate-800/70 p-0.5">
          <button onClick={() => setMode('paged')} title="Theo trang" aria-pressed={settings.preview.navMode === 'paged'} className={`rounded p-1 ${settings.preview.navMode === 'paged' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-100'}`}><PanelsTopLeft className="h-3.5 w-3.5" /></button>
          <button onClick={() => setMode('scroll-vertical')} title="Cuộn dọc" aria-pressed={settings.preview.navMode === 'scroll-vertical'} className={`rounded p-1 ${settings.preview.navMode === 'scroll-vertical' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-100'}`}><Rows3 className="h-3.5 w-3.5" /></button>
          <button onClick={() => setMode('scroll-horizontal')} title="Cuộn ngang" aria-pressed={settings.preview.navMode === 'scroll-horizontal'} className={`rounded p-1 ${settings.preview.navMode === 'scroll-horizontal' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-100'}`}><GalleryHorizontal className="h-3.5 w-3.5" /></button>
        </div>
        {url ? <a href={url} target="_blank" rel="noreferrer" className="max-w-[180px] truncate font-mono text-[11px] text-blue-400 hover:underline" title={url}>{url}</a> : <span className="font-mono text-[11px] text-slate-500">Chưa kết nối</span>}
        {lanUrl && <a href={lanUrl} target="_blank" rel="noreferrer" className="max-w-[170px] truncate font-mono text-[11px] text-emerald-400 hover:underline" title="Mở preview từ thiết bị cùng mạng">LAN {lanUrl}</a>}
      </div>
      <div className="flex items-center gap-1">
        <div className="flex items-center rounded-md border border-slate-700 bg-slate-800/70 p-0.5">
          <button onClick={() => changeZoom(-1)} disabled={status !== 'running' || zoomFactor <= 0.5} title="Thu nhỏ slide" aria-label="Thu nhỏ slide" className="rounded p-1 text-slate-300 transition-colors hover:bg-slate-700 hover:text-slate-50 disabled:opacity-30"><ZoomOut className="h-3.5 w-3.5" /></button>
          <span className="min-w-[2.75rem] px-1 text-center font-mono text-[10px] text-slate-300" aria-live="polite">{Math.round(zoomFactor * 100)}%</span>
          <button onClick={() => changeZoom(1)} disabled={status !== 'running' || zoomFactor >= 2.5} title="Phóng to slide" aria-label="Phóng to slide" className="rounded p-1 text-slate-300 transition-colors hover:bg-slate-700 hover:text-slate-50 disabled:opacity-30"><ZoomIn className="h-3.5 w-3.5" /></button>
          <span className="mx-0.5 h-4 w-px bg-slate-700" />
          <button onClick={fitWidthAuto} disabled={status !== 'running'} title="Tự khớp slide theo chiều rộng preview" aria-pressed={settings.preview.fitMode === 'fit-width' && zoomFactor === 1} className={`whitespace-nowrap rounded px-1.5 py-1 text-[10px] font-medium transition-colors disabled:opacity-30 ${settings.preview.fitMode === 'fit-width' && zoomFactor === 1 ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-700 hover:text-slate-50'}`}>Fit Width Auto</button>
        </div>
        <button onClick={handleOpenPresenter} disabled={status !== 'running'} title="Mở chế độ Presenter" className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-50 disabled:opacity-30"><Presentation className="h-3.5 w-3.5 text-purple-400" /><span className="hidden md:inline">Presenter</span></button>
        <button onClick={handleOpenExternal} disabled={status !== 'running'} title="Mở trình duyệt ngoài" className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-50 disabled:opacity-30"><ExternalLink className="h-3.5 w-3.5 text-blue-400" /><span className="hidden md:inline">Browser</span></button>
      </div>
    </div>
    <div className="relative flex-1 overflow-hidden bg-slate-950">
      {status === 'running' && compileError && <div className="absolute left-2 right-2 top-2 z-20 flex items-center gap-2 rounded-lg border border-rose-700/60 bg-rose-950/90 px-3 py-2 text-xs text-rose-100 shadow-lg"><AlertCircle className="h-4 w-4 shrink-0 text-rose-300" /><span className="font-medium">Lỗi biên dịch{compileError.slideNo ? ` · slide ${compileError.slideNo}` : ''}:</span><span className="flex-1 truncate font-mono text-rose-100/80" title={compileError.raw}>{compileError.summary}</span><button onClick={onGotoError} disabled={!compileError.file && !compileError.slideNo} className="shrink-0 underline decoration-rose-300/50 hover:text-slate-50 disabled:opacity-40">Đi tới lỗi</button><button onClick={onOpenConsole} className="shrink-0 underline decoration-rose-300/50 hover:text-slate-50">Console</button><button onClick={onDismissCompileError} aria-label="Ẩn lỗi biên dịch" className="shrink-0 rounded px-1 text-rose-200 hover:bg-rose-900">Ẩn</button></div>}
      {status === 'installing' && <div className="flex h-full flex-col items-center justify-center space-y-3 p-6 text-center"><Loader2 className="h-8 w-8 animate-spin text-blue-400" /><p className="text-sm font-medium text-slate-200">Đang cài đặt thư viện dự án...</p><button onClick={onOpenConsole} className="text-xs text-blue-400 underline hover:text-blue-300">Xem tiến trình</button></div>}
      {status === 'starting' && <div className="flex h-full flex-col items-center justify-center space-y-3 p-6 text-center"><Loader2 className="h-8 w-8 animate-spin text-amber-400" /><p className="text-sm font-medium text-slate-200">{isRecompiling ? 'Đang biên dịch lại Slidev với --force...' : 'Đang khởi chạy Slidev dev server...'}</p><button onClick={onOpenConsole} className="text-xs text-blue-400 underline hover:text-blue-300">Xem log tiến trình</button></div>}
      {status === 'error' && <div className="flex h-full flex-col items-center justify-center space-y-3 p-6 text-center"><AlertCircle className="h-10 w-10 text-rose-400" /><p className="text-sm font-medium text-slate-200">Không thể khởi động Slidev</p><p className="max-w-lg break-all rounded-lg border border-rose-900/50 bg-rose-950/40 p-3 font-mono text-xs text-rose-300/80">{error || 'Lỗi không xác định khi chạy lệnh slidev'}</p><div className="flex gap-3 pt-2"><button onClick={onRetry} className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500">Thử lại</button><button onClick={onOpenConsole} className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-700">Mở Console Log</button></div></div>}
      {status === 'stopped' && <div className="flex h-full flex-col items-center justify-center space-y-3 p-6 text-center"><p className="text-sm text-slate-400">Máy chủ Slidev hiện đang dừng</p><button onClick={onRetry} className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-500">Khởi động lại máy chủ</button></div>}
      {status === 'running' && url && preloadPath && <webview ref={webviewRef} preload={preloadPath} partition="persist:slidev-preview" webpreferences="contextIsolation=yes" className="h-full w-full border-0" style={{ width: '100%', height: '100%', border: 'none' }} />}
    </div>
  </div>
})

PreviewPane.displayName = 'PreviewPane'
