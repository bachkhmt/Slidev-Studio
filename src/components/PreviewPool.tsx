import React, { forwardRef, useEffect, useRef, useState } from 'react'
import { PreviewPane, type PreviewPaneHandle, type PreviewPaneProps } from './PreviewPane'
import type { OpenTab } from '../pages/ProjectWorkspace'
import { useProcessSnapshot } from '../state/processStore'
type Props = PreviewPaneProps & { tabs: OpenTab[]; projectId: string; visible: boolean }
export const PreviewPool = forwardRef<PreviewPaneHandle, Props>((props, ref) => {
  const [recent, setRecent] = useState<string[]>([])
  const positions = useRef(new Map<string, number>())
  const ids = React.useMemo(
    () =>
      [
        props.projectId,
        ...recent.filter((id) => id !== props.projectId && props.tabs.some((t) => t.project.id === id))
      ].slice(0, 2),
    [props.projectId, props.tabs, recent]
  )
  const idKey = ids.join('|')
  useEffect(() => {
    setRecent((old) => (old.join('|') === idKey ? old : ids))
    for (const id of positions.current.keys())
      if (!props.tabs.some((t) => t.project.id === id)) positions.current.delete(id)
  }, [idKey, props.tabs, ids])
  return (
    <div className="relative h-full w-full">
      {ids.map((id) => {
        const tab = props.tabs.find((t) => t.project.id === id)
        if (!tab) return null
        return (
          <Slot
            key={id}
            tab={tab}
            selected={id === props.projectId}
            visible={props.visible}
            paneRef={id === props.projectId ? ref : undefined}
            props={props}
            position={positions.current.get(id)}
            remember={(no) => positions.current.set(id, no)}
          />
        )
      })}
    </div>
  )
})
function Slot({
  tab,
  selected,
  visible,
  paneRef,
  props,
  position,
  remember
}: {
  tab: OpenTab
  selected: boolean
  visible: boolean
  paneRef: any
  props: Props
  position?: number
  remember: (no: number) => void
}) {
  const { status, compileError } = useProcessSnapshot(tab.project.id, false)
  const base = selected
    ? props
    : {
        ...props,
        url: status?.url || tab.serverUrl,
        lanUrl: status?.lanUrl,
        status: status?.status || tab.status,
        error: status?.error,
        compileError,
        restoreSuffix: null,
        restoreSlideNo: position || null,
        onSourceClick: undefined,
        onRestoreComplete: undefined
      }
  return (
    <div className={selected ? 'h-full w-full' : 'hidden'}>
      <PreviewPane
        {...base}
        ref={paneRef}
        active={selected && visible}
        onPositionChange={remember}
        restoreSlideNo={base.restoreSlideNo || position || null}
      />
    </div>
  )
}
PreviewPool.displayName = 'PreviewPool'
