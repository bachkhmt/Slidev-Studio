import React, { useCallback, useEffect, useRef, useState } from 'react'
import api from '../ipc-client'
import type { CollabStatus, GitHubAccount } from '../../shared/collab'
import { GitHubLogin } from './GitHubLogin'

interface Props {
  projectId: string
  flush: () => Promise<void>
  onStatus: (status: CollabStatus | null) => void
  onReload: () => void
  onBusy: (busy: boolean) => void
  onPreview: (entry: string, file?: string) => Promise<void>
  onExport: () => void
  onAccount: (login: string) => void
}

export function CollaborationBar(props: Props): React.ReactElement | null {
  const [status, setStatus] = useState<CollabStatus | null>(null)
  const [account, setAccount] = useState<GitHubAccount | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const callbacks = useRef(props)
  callbacks.current = props
  const opRef = useRef(false)
  const mountedRef = useRef(true)
  const update = useCallback((s: CollabStatus | null) => {
    if (!mountedRef.current) return
    setStatus(s)
    callbacks.current.onStatus(s)
  }, [])
  const refresh = useCallback(async () => {
    if (opRef.current) return
    try {
      const next = await api.collab.inspect(props.projectId)
      if (!opRef.current) update(next)
    } catch (e) {
      if (mountedRef.current) setError((e as Error).message)
    }
  }, [props.projectId, update])
  useEffect(() => {
    mountedRef.current = true
    void refresh()
    const timer = setInterval(refresh, 30000)
    return () => {
      mountedRef.current = false
      clearInterval(timer)
    }
  }, [refresh])
  const action = async (run: () => Promise<void>, reload = false) => {
    if (opRef.current) return
    opRef.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      callbacks.current.onBusy(true)
      await callbacks.current.flush()
      await run()
      if (reload) callbacks.current.onReload()
    } catch (e) {
      if (mountedRef.current) setError((e as Error).message)
    } finally {
      opRef.current = false
      if (mountedRef.current) {
        setBusy(false)
        callbacks.current.onBusy(false)
      }
    }
  }
  if (!status && !error) return null
  const section = status?.manifest.sections.find((s) => s.id === status.sectionId)
  const active = !!section && section.owner.toLowerCase() === account?.login.toLowerCase()
  const button =
    'rounded border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 disabled:opacity-40 hover:bg-slate-700'
  return (
    <div className="app-chrome space-y-2 border-b border-slate-800 bg-slate-900 px-4 py-3 text-xs">
      <GitHubLogin
        onAccount={(a) => {
          setAccount(a)
          callbacks.current.onAccount(a?.login || '')
          void refresh()
        }}
      />
      {status && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <label>
              Phần phụ trách:{' '}
              <select
                aria-label="Phần phụ trách"
                disabled={busy || !account || status.merging}
                value={status.sectionId || ''}
                className="ml-2 rounded border border-slate-700 bg-slate-800 px-2 py-1.5"
                onChange={(e) => {
                  const id = e.target.value
                  if (!id) return
                  void action(async () => {
                    const s = await api.collab.selectSection(props.projectId, id)
                    update(s)
                    const entry = await api.collab.previewEntry(props.projectId, 'section')
                    await callbacks.current.onPreview(entry, s.manifest.sections.find((x) => x.id === id)?.file)
                  }, true)
                }}
              >
                <option value="">Chọn phần của bạn</option>
                {status.manifest.sections.map((s) => (
                  <option key={s.id} value={s.id} disabled={s.owner.toLowerCase() !== account?.login.toLowerCase()}>
                    {s.id} — @{s.owner}
                  </option>
                ))}
              </select>
            </label>
            <button
              className={button}
              disabled={busy || !active || status.merging}
              onClick={() =>
                void action(async () => {
                  update(await api.collab.saveDraft(props.projectId))
                  setMessage('Đã lưu nháp trên máy.')
                })
              }
            >
              Lưu nháp
            </button>
            <button
              className={button}
              disabled={busy || !active || status.merging}
              onClick={() =>
                void action(async () => {
                  update(await api.collab.sync(props.projectId))
                  setMessage('Đã lấy bản mới từ nhóm.')
                }, true)
              }
            >
              Đồng bộ
            </button>
            <button
              className={`${button} border-blue-500 text-blue-300`}
              disabled={busy || !active || status.merging || !!status.forbiddenFiles.length}
              onClick={() =>
                void action(async () => {
                  update(await api.collab.submit(props.projectId))
                  setMessage('Đã gửi bài, chờ điều phối duyệt.')
                })
              }
            >
              Gửi bài
            </button>
            <button
              className={button}
              disabled={busy || !active}
              onClick={() =>
                void action(async () =>
                  callbacks.current.onPreview(await api.collab.previewEntry(props.projectId, 'section'))
                )
              }
            >
              Xem phần của tôi
            </button>
            <button
              className={button}
              disabled={busy || status.merging}
              onClick={() =>
                void action(async () =>
                  callbacks.current.onPreview(await api.collab.previewEntry(props.projectId, 'total'))
                )
              }
            >
              Xem bản tổng
            </button>
            <button className={button} disabled={busy || status.merging} onClick={props.onExport}>
              Xuất bản tổng
            </button>
            <button className={button} disabled={busy} onClick={() => void refresh()}>
              Cập nhật trạng thái
            </button>
            <span className="text-slate-400">
              {busy
                ? 'Đang xử lý…'
                : status.merging
                  ? 'Cần xử lý bản đồng bộ'
                  : status.changedFiles.length
                    ? `${status.changedFiles.length} file chưa lưu nháp`
                    : status.ahead
                      ? `${status.ahead} bản nháp chưa gửi`
                      : 'Đã lưu và đồng bộ'}
            </span>
          </div>
          {status.pr && (
            <button className="text-blue-400 underline" onClick={() => void api.collab.openPr(status.pr!.url)}>
              Bài gửi:{' '}
              {
                { open: 'Chờ duyệt', merged: 'Đã được duyệt', closed: 'Đã đóng', changes_requested: 'Cần chỉnh sửa' }[
                  status.pr.state
                ]
              }{' '}
              — Mở trên GitHub
            </button>
          )}
          {status.behindMain > 0 && (
            <p className="text-amber-300">
              Có bản mới của nhóm chưa lấy về
              {status.mergedSections.length ? `: ${status.mergedSections.join(', ')}` : '.'} Bấm Đồng bộ sau khi lưu
              nháp.
            </p>
          )}
          {status.forbiddenFiles.length > 0 && (
            <p className="text-amber-300">
              Thay đổi ngoài phần của bạn: {status.forbiddenFiles.join(', ')}. Hãy xử lý trước khi gửi bài.
            </p>
          )}
          {status.manifest.sections.length > 0 && (
            <div className="flex flex-wrap gap-3 text-slate-400">
              {status.manifest.sections.map((s) => (
                <span key={s.id}>
                  {s.id === status.sectionId ? '▶' : status.mergedSections.includes(s.id) ? '●' : '○'} {s.id} · @
                  {s.owner}
                </span>
              ))}
            </div>
          )}
          {status.merging && (
            <div className="space-y-2 rounded border border-amber-800 p-3">
              <p>
                Bản của bạn và bản mới có thay đổi trùng nhau. Chọn một bản hoặc sửa dấu xung đột trong Editor rồi bấm
                Hoàn tất.
              </p>
              {status.conflicts.map((file) => (
                <div key={file} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono">{file}</span>
                  {(['mine', 'incoming'] as const).map((choice) => (
                    <button
                      className={button}
                      disabled={busy}
                      key={choice}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Thay nội dung xung đột của ${file} bằng ${choice === 'mine' ? 'bản của bạn' : 'bản mới'}?`
                          )
                        )
                          return
                        void action(
                          async () => update(await api.collab.resolveConflict(props.projectId, file, choice)),
                          true
                        )
                      }}
                    >
                      {choice === 'mine' ? 'Giữ bản của tôi' : 'Lấy bản mới'}
                    </button>
                  ))}
                </div>
              ))}
              <div className="flex gap-2">
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => void action(async () => update(await api.collab.finishMerge(props.projectId)), true)}
                >
                  Hoàn tất đồng bộ
                </button>
                <button
                  className={button}
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Huỷ lần đồng bộ này? Các chỉnh sửa khi giải quyết xung đột sẽ bị bỏ, bản nháp trước đồng bộ được giữ.'
                      )
                    )
                      void action(async () => update(await api.collab.abortMerge(props.projectId)), true)
                  }}
                >
                  Huỷ đồng bộ
                </button>
              </div>
            </div>
          )}
          {status.warning && <p className="text-amber-300">{status.warning}</p>}
          <details className="text-slate-500">
            <summary className="cursor-pointer">Nâng cao</summary>
            <p className="mt-1 font-mono">
              Nhánh: {status.branch}. Lưu nháp = add + commit; Đồng bộ = fetch + merge; Gửi bài = commit + push + PR.
            </p>
          </details>
        </>
      )}
      {error && (
        <p role="alert" className="text-rose-400">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-emerald-400">
          {message}
        </p>
      )}
    </div>
  )
}
