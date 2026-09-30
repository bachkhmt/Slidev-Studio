import net from 'net'

const PROBE_HOSTS = ['127.0.0.1', '::1', '0.0.0.0']

export async function isPortAvailable(port: number): Promise<boolean> {
  for (const host of PROBE_HOSTS) {
    const available = await new Promise<boolean>((resolve) => {
      const server = net.createServer()
      server.once('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EAFNOSUPPORT' || error.code === 'EADDRNOTAVAIL' || error.code === 'EINVAL') {
          resolve(true)
        } else {
          resolve(false)
        }
      })
      server.once('listening', () => server.close(() => resolve(true)))
      try {
        server.listen({ port, host, exclusive: true })
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        resolve(code === 'EAFNOSUPPORT' || code === 'EADDRNOTAVAIL' || code === 'EINVAL')
      }
    })
    if (!available) return false
  }
  return true
}

export class PortAllocator {
  private reserved = new Map<number, string>()
  private queue: Promise<void> = Promise.resolve()

  public async acquire(preferredPort: number, range: number, strict: boolean, projectId: string): Promise<number> {
    let releaseLock!: () => void
    const previous = this.queue
    this.queue = new Promise<void>((resolve) => { releaseLock = resolve })
    await previous
    try {
      const maxPort = Math.min(65535, preferredPort + Math.max(0, range))
      const ports = strict ? [preferredPort] : Array.from({ length: maxPort - preferredPort + 1 }, (_value, index) => preferredPort + index)
      for (const port of ports) {
        if (port < 1024 || port > 65535) continue
        const owner = this.reserved.get(port)
        if (owner && owner !== projectId) continue
        if (await isPortAvailable(port)) {
          this.reserved.set(port, projectId)
          return port
        }
      }
      if (strict) {
        throw new Error(`Cổng ${preferredPort} đang bị chiếm bởi tiến trình khác. Hãy đổi cổng trong Cài đặt hoặc cấu hình dự án.`)
      }
      throw new Error(`Không tìm thấy cổng trống trong dải ${preferredPort}–${maxPort}. Hãy tăng dải quét hoặc chọn cổng khác trong Cài đặt.`)
    } finally {
      releaseLock()
    }
  }

  public release(port: number | undefined, projectId?: string): void {
    if (port === undefined) return
    if (projectId && this.reserved.get(port) !== projectId) return
    this.reserved.delete(port)
  }

  public getReservedPorts(): ReadonlyMap<number, string> {
    return this.reserved
  }
}

export const portAllocator = new PortAllocator()
