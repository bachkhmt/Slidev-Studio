import { useSyncExternalStore } from 'react'
import type { ProcessStatus } from '../env'
import type { LogEntry } from '../components/ProcessConsole'

export interface ProcessSnapshot {
  status: ProcessStatus | null
  logs: LogEntry[]
  compileError?: { summary: string; raw: string; file?: string; line?: number; column?: number; slideNo?: number }
}

const EMPTY_SNAPSHOT: ProcessSnapshot = { status: null, logs: [] }

class ProcessStore {
  private snapshots = new Map<string, ProcessSnapshot>()
  private statusSnapshots = new Map<string, ProcessSnapshot>()
  private listeners = new Map<string, Set<() => void>>()
  private lastSeq = new Map<string, number>()

  public getSnapshot = (projectId?: string, includeLogs = true): ProcessSnapshot =>
    projectId ? (includeLogs ? this.snapshots : this.statusSnapshots).get(projectId) || EMPTY_SNAPSHOT : EMPTY_SNAPSHOT

  public release(projectId: string): void {
    this.snapshots.delete(projectId)
    this.statusSnapshots.delete(projectId)
    this.lastSeq.delete(projectId)
    for (const listener of this.listeners.get(projectId) || []) listener()
  }

  public subscribe = (projectId: string | undefined, listener: () => void): (() => void) => {
    if (!projectId) return () => {}
    const listeners = this.listeners.get(projectId) || new Set<() => void>()
    listeners.add(listener)
    this.listeners.set(projectId, listeners)
    return () => {
      listeners.delete(listener)
      if (!listeners.size) this.listeners.delete(projectId)
    }
  }

  public setStatus(status: ProcessStatus): void {
    const previous = this.getSnapshot(status.projectId)
    const compileError = status.status === 'starting' ? undefined : previous.compileError
    this.update(status.projectId, { ...previous, status, compileError })
  }

  public appendLogs(projectId: string, logs: LogEntry[]): void {
    if (!logs.length) return
    const previous = this.getSnapshot(projectId)
    const lastSeq = this.lastSeq.get(projectId) || 0
    const fresh = logs.filter((line) => line.seq === undefined || line.seq > lastSeq)
    if (!fresh.length) return
    const maxSeq = fresh.reduce((max, line) => Math.max(max, line.seq || max), lastSeq)
    this.lastSeq.set(projectId, maxSeq)
    const merged = [...previous.logs, ...fresh].slice(-1500)
    this.update(projectId, { ...previous, logs: merged })
  }

  public setCompileError(
    projectId: string,
    error: {
      summary?: string
      message?: string
      raw?: string
      file?: string
      line?: number
      column?: number
      slideNo?: number
    }
  ): void {
    const previous = this.getSnapshot(projectId)
    const summary = error.summary || error.message || 'Lỗi biên dịch Slidev'
    this.update(projectId, {
      ...previous,
      compileError: {
        summary,
        raw: error.raw || summary,
        file: error.file,
        line: error.line,
        column: error.column,
        slideNo: error.slideNo
      }
    })
  }

  public clearCompileError(projectId: string): void {
    const previous = this.getSnapshot(projectId)
    if (previous.compileError) this.update(projectId, { ...previous, compileError: undefined })
  }

  public dismissCompileError(projectId: string): void {
    this.clearCompileError(projectId)
  }

  public clearLogs(projectId: string): void {
    const previous = this.getSnapshot(projectId)
    this.update(projectId, { ...previous, logs: [] })
  }

  private update(projectId: string, snapshot: ProcessSnapshot): void {
    this.snapshots.set(projectId, snapshot)
    const previous = this.statusSnapshots.get(projectId)
    if ((previous?.status || null) !== snapshot.status || previous?.compileError !== snapshot.compileError)
      this.statusSnapshots.set(projectId, { ...snapshot, logs: EMPTY_SNAPSHOT.logs })
    for (const listener of this.listeners.get(projectId) || []) listener()
  }
}

export const processStore = new ProcessStore()

export function useProcessSnapshot(projectId?: string, includeLogs = true): ProcessSnapshot {
  return useSyncExternalStore(
    (listener) => processStore.subscribe(projectId, listener),
    () => processStore.getSnapshot(projectId, includeLogs),
    () => EMPTY_SNAPSHOT
  )
}
