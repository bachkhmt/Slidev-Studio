import net from 'net'

export interface WaitForReadyOptions {
  signal?: AbortSignal
  timeoutMs: number
  intervalMs?: number
  host?: string
}

export async function waitForReady(port: number, options: WaitForReadyOptions): Promise<void> {
  const { signal, timeoutMs, intervalMs = 250, host } = options
  const hosts = host ? [host] : ['127.0.0.1', '::1']
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (signal?.aborted) throw Object.assign(new Error('Đã huỷ chờ Slidev khởi động'), { code: 'STOPPED_BY_USER' })
    for (const probeHost of hosts) {
      if (signal?.aborted) throw Object.assign(new Error('Đã huỷ chờ Slidev khởi động'), { code: 'STOPPED_BY_USER' })
      const ready = await new Promise<boolean>((resolve) => {
        const socket = net.createConnection({ port, host: probeHost })
        let settled = false
        const finish = (value: boolean) => {
          if (settled) return
          settled = true
          socket.destroy()
          resolve(value)
        }
        socket.setTimeout(600)
        socket.once('connect', () => finish(true))
        socket.once('timeout', () => finish(false))
        socket.once('error', () => finish(false))
      })
      if (ready) return
    }
    await new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        signal?.removeEventListener('abort', onAbort)
        resolve()
      }
      const timer = setTimeout(finish, intervalMs)
      const onAbort = () => { clearTimeout(timer); finish() }
      signal?.addEventListener('abort', onAbort, { once: true })
      timer.unref?.()
    })
  }

  if (signal?.aborted) throw Object.assign(new Error('Đã huỷ chờ Slidev khởi động'), { code: 'STOPPED_BY_USER' })
  throw new Error(`Slidev không sẵn sàng sau ${timeoutMs} ms.`)
}
