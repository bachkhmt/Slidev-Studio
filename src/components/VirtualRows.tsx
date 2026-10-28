import React, { useState, useRef, useLayoutEffect } from 'react'
export function VirtualRows<T>({
  items,
  rowHeight = 28,
  render,
  label,
  width,
  onScrollPosition
}: {
  items: T[]
  rowHeight?: number
  render: (item: T, index: number) => React.ReactNode
  label: string
  width?: number
  onScrollPosition?: (atBottom: boolean) => void
}) {
  const element = useRef<HTMLDivElement>(null)
  const [viewport, setViewport] = useState({ top: 0, height: 600 })
  useLayoutEffect(() => {
    const node = element.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => setViewport((old) => ({ ...old, height: node.clientHeight })))
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const first = Math.max(0, Math.floor(viewport.top / rowHeight) - 8)
  const last = Math.min(items.length, Math.ceil((viewport.top + viewport.height) / rowHeight) + 8)
  return (
    <div
      ref={element}
      aria-label={label}
      className="h-full overflow-auto"
      onScroll={(e) => {
        setViewport({ top: e.currentTarget.scrollTop, height: e.currentTarget.clientHeight })
        onScrollPosition?.(e.currentTarget.scrollHeight - e.currentTarget.scrollTop - e.currentTarget.clientHeight < 48)
      }}
    >
      <div style={{ height: items.length * rowHeight, position: 'relative', minWidth: width || '100%' }}>
        {items.slice(first, last).map((item, offset) => (
          <div
            key={first + offset}
            style={{ position: 'absolute', top: (first + offset) * rowHeight, height: rowHeight, width: '100%' }}
          >
            {render(item, first + offset)}
          </div>
        ))}
      </div>
    </div>
  )
}
