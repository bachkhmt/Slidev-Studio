import React, { useEffect, useRef, useState } from 'react'
import { getDocument, PDFWorker, type PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs'
import PdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker'
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react'

export function PdfPreview({ data }: { data: Uint8Array | null }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [page, setPage] = useState(1)
  const [zoom, setZoom] = useState(1)
  const [width, setWidth] = useState(600)
  const [error, setError] = useState('')
  useEffect(() => {
    const element = container.current
    if (!element) return
    const observer = new ResizeObserver(() => setWidth(element.clientWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    setPdf(null)
    setError('')
    if (!data) return
    let active = true
    const port = new PdfWorker()
    // PDF.js's generated declaration narrows port to null despite accepting a Worker at runtime.
    const worker = new PDFWorker({ port: port as any })
    const loading = getDocument({ data: new Uint8Array(data), worker, isEvalSupported: false, useSystemFonts: true })
    void loading.promise
      .then((document) => {
        if (active) {
          setPdf(document)
          setPage((old) => Math.min(old, document.numPages))
        }
      })
      .catch((reason) => {
        if (active) setError(reason.message)
      })
    return () => {
      active = false
      void loading.destroy().finally(() => {
        worker.destroy()
        port.terminate()
      })
    }
  }, [data])
  useEffect(() => {
    if (!pdf || !canvas.current) return
    const element = canvas.current
    let cancelled = false
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy['getPage']>>['render']> | undefined
    void pdf
      .getPage(page)
      .then(async (documentPage) => {
        if (cancelled) return
        const original = documentPage.getViewport({ scale: 1 })
        const viewport = documentPage.getViewport({ scale: Math.max(0.1, (width - 32) / original.width) * zoom })
        const ratio = Math.min(window.devicePixelRatio || 1, 2)
        element.width = Math.floor(viewport.width * ratio)
        element.height = Math.floor(viewport.height * ratio)
        element.style.width = `${viewport.width}px`
        element.style.height = `${viewport.height}px`
        render = documentPage.render({ canvas: element, viewport, transform: [ratio, 0, 0, ratio, 0, 0] })
        await render.promise
      })
      .catch((reason) => {
        if (!cancelled && reason.name !== 'RenderingCancelledException') setError(reason.message)
      })
    return () => {
      cancelled = true
      render?.cancel()
    }
  }, [pdf, page, zoom, width])
  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-800">
      <div className="app-chrome flex items-center justify-between gap-2 border-b border-slate-700 bg-slate-900 px-3 py-2 text-xs">
        <div className="flex items-center gap-2">
          <button title="Trang PDF trước" disabled={!pdf || page <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span aria-live="polite">
            Trang {pdf ? page : 0} / {pdf?.numPages || 0}
          </span>
          <button title="Trang PDF sau" disabled={!pdf || page >= pdf.numPages} onClick={() => setPage((p) => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button title="Thu nhỏ PDF" onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}>
            <ZoomOut className="h-4 w-4" />
          </button>
          <button onClick={() => setZoom(1)} title="Vừa chiều rộng PDF">
            {Math.round(zoom * 100)}%
          </button>
          <button title="Phóng to PDF" onClick={() => setZoom((z) => Math.min(2, z + 0.1))}>
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div ref={container} className="min-h-0 flex-1 overflow-auto p-4">
        {error ? (
          <p role="alert" className="text-sm text-rose-300">
            Không mở được PDF: {error}
          </p>
        ) : data ? (
          <canvas ref={canvas} aria-label="Xem trước báo cáo PDF" className="mx-auto bg-white shadow-xl" />
        ) : (
          <p className="p-8 text-center text-sm text-slate-400">Biên dịch báo cáo để xem PDF tại đây.</p>
        )}
      </div>
    </div>
  )
}
