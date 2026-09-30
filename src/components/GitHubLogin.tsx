import React, { useEffect, useRef, useState } from 'react'
import api from '../ipc-client'
import type { DeviceLogin, GitHubAccount } from '../../shared/collab'

export function GitHubLogin({
  onAccount
}: {
  onAccount?: (account: GitHubAccount | null) => void
}): React.ReactElement {
  const [account, setAccount] = useState<GitHubAccount | null>(null)
  const [clientId, setClientId] = useState(() => localStorage.getItem('slidev-github-client-id') || '')
  const [device, setDevice] = useState<DeviceLogin | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const callback = useRef(onAccount)
  callback.current = onAccount
  useEffect(() => {
    let active = true
    api.collab
      .account()
      .then((a) => {
        if (active) {
          setAccount(a)
          callback.current?.(a)
        }
      })
      .catch((e) => {
        if (active) setError(e.message)
      })
    return () => {
      active = false
    }
  }, [])
  useEffect(() => {
    if (!device) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const result = await api.collab.pollLogin()
        if (cancelled) return
        if (result.account) {
          setAccount(result.account)
          setDevice(null)
          callback.current?.(result.account)
        } else timer = setTimeout(poll, (result.interval || device.interval) * 1000)
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message)
          setDevice(null)
        }
      }
    }
    timer = setTimeout(poll, device.interval * 1000)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [device])
  const login = async () => {
    setBusy(true)
    setError('')
    try {
      localStorage.setItem('slidev-github-client-id', clientId.trim())
      setDevice(await api.collab.beginLogin(clientId.trim()))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-2 text-xs">
      {account ? (
        <div className="flex items-center gap-3">
          <span className="text-emerald-400">GitHub: @{account.login}</span>
          <button
            disabled={busy}
            className="text-slate-400 underline"
            onClick={async () => {
              setBusy(true)
              try {
                await api.collab.logout()
                setAccount(null)
                callback.current?.(null)
              } catch (e) {
                setError((e as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            Đăng xuất
          </button>
        </div>
      ) : (
        <details>
          <summary className="cursor-pointer text-blue-400">Đăng nhập GitHub để cộng tác / mở dự án riêng tư</summary>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              aria-label="GitHub OAuth Client ID"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="OAuth App Client ID"
              className="rounded border border-slate-700 bg-slate-800 px-3 py-2"
            />
            <button
              disabled={busy || !!device}
              onClick={login}
              className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50"
            >
              {busy ? 'Đang lấy mã…' : 'Đăng nhập GitHub'}
            </button>
          </div>
          <p className="mt-2 text-slate-400">
            Điều phối cung cấp Client ID của OAuth App đã bật Device Flow. Quyền repo dùng để đọc dự án riêng tư và gửi
            bài.
          </p>
        </details>
      )}
      {device && (
        <div className="rounded border border-blue-800 p-3">
          Nhập mã <strong className="select-all font-mono text-base text-blue-300">{device.userCode}</strong> trên trang
          GitHub vừa mở. Đang chờ xác nhận…{' '}
          <button
            className="ml-2 underline"
            onClick={async () => {
              await api.collab.logout()
              setDevice(null)
            }}
          >
            Huỷ
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-rose-400">
          {error}
        </p>
      )}
    </div>
  )
}
