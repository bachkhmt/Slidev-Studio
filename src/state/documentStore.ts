import type { AppSettings } from '../../shared/settings'
import type { CloseChoice, DocumentSnapshot, FileStamp } from '../../shared/documents'
import { checkSlideMarkdown } from '../lib/markdownGuard'

export const documentKey = (p: string) =>
  /^[a-z]:/i.test(p)
    ? p
        .replace(/\\/g, '/')
        .replace(/\/{2,}/g, '/')
        .toLowerCase()
    : p.replace(/\\/g, '/')
const inside = (file: string, root?: string) =>
  !root || documentKey(file).startsWith(`${documentKey(root).replace(/\/$/, '')}/`)
type Entry = {
  snapshot: DocumentSnapshot
  read?: Promise<void>
  writes: Promise<void>
  timer?: ReturnType<typeof setTimeout>
  writable: boolean
  stamp?: FileStamp
}
type IO = {
  readFile: (path: string) => Promise<string>
  writeFile: (path: string, text: string) => Promise<unknown>
  statFile?: (path: string) => Promise<FileStamp>
}
export class DocumentStore {
  private entries = new Map<string, Entry>()
  private listeners = new Map<string, Set<() => void>>()
  private closeTask?: Promise<boolean>
  private closeScope?: string
  private settings!: AppSettings['editor']
  constructor(private io: IO) {}
  configure(settings: AppSettings['editor']) {
    this.settings = settings
    for (const entry of this.entries.values()) this.schedule(entry)
  }
  get(path: string): DocumentSnapshot {
    const key = documentKey(path)
    let entry = this.entries.get(key)
    if (!entry) {
      entry = {
        snapshot: { path, content: '', revision: 0, savedRevision: 0, loading: true, saving: false },
        writes: Promise.resolve(),
        writable: true
      }
      this.entries.set(key, entry)
    }
    return entry.snapshot
  }
  subscribe(path: string, fn: () => void) {
    const key = documentKey(path),
      listeners = this.listeners.get(key) || new Set<() => void>()
    listeners.add(fn)
    this.listeners.set(key, listeners)
    return () => {
      listeners.delete(fn)
      if (!listeners.size) this.listeners.delete(key)
    }
  }
  private update(entry: Entry, patch: Partial<DocumentSnapshot>) {
    entry.snapshot = { ...entry.snapshot, ...patch }
    for (const fn of this.listeners.get(documentKey(entry.snapshot.path)) || []) fn()
  }
  async load(path: string, reload = false): Promise<void> {
    this.get(path)
    const entry = this.entries.get(documentKey(path))!
    if (entry.read) return entry.read
    // Reloading may never overwrite an unsaved revision.
    if (entry.snapshot.revision !== entry.snapshot.savedRevision) return
    entry.read = (async () => {
      const stamp = await this.io.statFile?.(path)
      if (entry.snapshot.revision !== entry.snapshot.savedRevision) return
      if (
        !entry.snapshot.loading &&
        !reload &&
        (!stamp || (entry.stamp?.mtimeMs === stamp.mtimeMs && entry.stamp?.size === stamp.size))
      )
        return
      const revision = entry.snapshot.revision
      this.update(entry, { loading: true, readError: false, error: undefined })
      const content = await this.io.readFile(path)
      if (entry.snapshot.revision === revision) {
        entry.stamp = stamp
        this.update(entry, { content, loading: false, readError: false, error: undefined })
      }
    })()
      .catch((error) => {
        this.update(entry, { loading: false, readError: true, error: String(error.message || error) })
      })
      .finally(() => {
        entry.read = undefined
      })
    return entry.read
  }
  setWritable(path: string, writable: boolean) {
    this.get(path)
    this.entries.get(documentKey(path))!.writable = writable
  }
  edit(path: string, content: string) {
    this.get(path)
    const entry = this.entries.get(documentKey(path))!
    if (
      !entry.writable ||
      this.closeTask ||
      entry.snapshot.loading ||
      entry.snapshot.readError ||
      content === entry.snapshot.content
    )
      return
    this.update(entry, { content, revision: entry.snapshot.revision + 1, error: undefined, guard: undefined })
    this.schedule(entry)
  }
  private schedule(entry: Entry) {
    clearTimeout(entry.timer)
    if (
      !this.settings ||
      this.settings.autoSave !== 'afterDelay' ||
      !entry.writable ||
      entry.snapshot.revision === entry.snapshot.savedRevision
    )
      return
    entry.timer = setTimeout(() => {
      void this.save(entry.snapshot.path, false).catch(() => {})
    }, this.settings.autoSaveDelayMs)
  }
  private guarded(entry: Entry) {
    if (!this.settings?.autoSaveGuard || !entry.snapshot.path.toLowerCase().endsWith('.md')) return false
    const check = checkSlideMarkdown(entry.snapshot.content)
    if (!check.ok) {
      this.update(entry, { guard: { line: check.line, reason: check.reason } })
      return true
    }
    return false
  }
  async save(path: string, manual = true): Promise<void> {
    const entry = this.entries.get(documentKey(path))
    if (!entry) return
    clearTimeout(entry.timer)
    if (entry.snapshot.revision === entry.snapshot.savedRevision) {
      await entry.writes.catch(() => {})
      return
    }
    if (!entry.writable) throw new Error('File đang ở chế độ chỉ xem.')
    if (!manual && this.guarded(entry)) return
    // Resolve the snapshot at execution time so duplicate requests coalesce.
    const task = entry.writes
      .catch(() => {})
      .then(async () => {
        const { revision, content, savedRevision } = entry.snapshot
        if (revision === savedRevision) return
        this.update(entry, { saving: true })
        try {
          await this.io.writeFile(entry.snapshot.path, content)
          entry.stamp = await this.io.statFile?.(entry.snapshot.path).catch(() => undefined)
          this.update(entry, { savedRevision: revision, saving: false, error: undefined, guard: undefined })
        } catch (error: any) {
          this.update(entry, { saving: false, error: error.message || String(error) })
          throw error
        }
      })
    entry.writes = task
    await task
  }
  blur(path: string) {
    if (this.settings?.autoSave === 'onBlur') void this.save(path, false).catch(() => {})
  }
  async flushProject(root?: string) {
    for (const e of this.entries.values()) if (inside(e.snapshot.path, root)) await this.save(e.snapshot.path)
  }
  flushAll() {
    return this.flushProject()
  }
  prepareClose(
    root: string | undefined,
    choose: (files: string[], reason: string) => Promise<CloseChoice>
  ): Promise<boolean> {
    const scope = root ? documentKey(root) : '*'
    if (this.closeTask)
      return this.closeScope === scope
        ? this.closeTask
        : this.closeTask.then((ok) => (ok ? this.prepareClose(root, choose) : false))
    this.closeScope = scope
    const run = async () => {
      const selected = [...this.entries.values()].filter((e) => inside(e.snapshot.path, root))
      selected.forEach((e) => clearTimeout(e.timer))
      await Promise.all(selected.map((e) => e.writes.catch(() => {})))
      let dirty = selected.filter((e) => e.snapshot.revision !== e.snapshot.savedRevision)
      if (!dirty.length) return true
      if (this.settings?.autoSave !== 'off') {
        for (const e of dirty)
          if (!e.snapshot.error && !this.guarded(e)) await this.save(e.snapshot.path, false).catch(() => {})
      }
      dirty = selected.filter((e) => e.snapshot.revision !== e.snapshot.savedRevision)
      if (!dirty.length) return true
      const choice = await choose(
        dirty.map((e) => e.snapshot.path),
        dirty.map((e) => e.snapshot.error || e.snapshot.guard?.reason || 'Tự động lưu đang tắt.').join('\n')
      )
      if (choice === 'cancel') return false
      if (choice === 'discard') {
        for (const e of dirty) {
          await e.writes.catch(() => {})
          const content = await this.io.readFile(e.snapshot.path)
          this.update(e, { content, savedRevision: e.snapshot.revision, error: undefined, guard: undefined })
        }
        return true
      }
      try {
        for (const e of dirty) await this.save(e.snapshot.path)
        return true
      } catch {
        return false
      }
    }
    this.closeTask = run().finally(() => {
      this.closeTask = undefined
    })
    return this.closeTask
  }
  releaseProject(root: string) {
    for (const [key, e] of this.entries)
      if (inside(e.snapshot.path, root) && e.snapshot.revision === e.snapshot.savedRevision) {
        clearTimeout(e.timer)
        this.entries.delete(key)
        this.listeners.delete(key)
      }
  }
  releaseFile(path: string) {
    const key = documentKey(path),
      e = this.entries.get(key)
    if (e && e.snapshot.revision === e.snapshot.savedRevision && !this.listeners.get(key)?.size) {
      clearTimeout(e.timer)
      this.entries.delete(key)
    }
  }
  reset() {
    for (const e of this.entries.values()) clearTimeout(e.timer)
    this.entries.clear()
    this.listeners.clear()
  }
}
