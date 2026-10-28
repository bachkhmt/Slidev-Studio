import React from 'react'
import { processStore, useProcessSnapshot } from '../state/processStore'
import { ProcessConsole } from './ProcessConsole'
export const LogCount = React.memo(({ projectId }: { projectId: string }) => {
  const { logs } = useProcessSnapshot(projectId)
  return logs.length ? <span className="text-[10px]">{logs.length}</span> : null
})
export const ConnectedProcessConsole = React.memo(
  ({ projectId, onClose }: { projectId: string; onClose: () => void }) => {
    const { logs } = useProcessSnapshot(projectId)
    return <ProcessConsole logs={logs} onClear={() => processStore.clearLogs(projectId)} onClose={onClose} />
  }
)
