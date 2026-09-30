interface QueueTask<T> {
  label: string
  signal?: AbortSignal
  task: () => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
  onAbort?: () => void
}

export const MAX_CONCURRENT_INSTALLS = 1

export class InstallQueue {
  private queue: QueueTask<unknown>[] = []
  private active = 0

  public run<T>(label: string, task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(Object.assign(new Error('Đã huỷ tác vụ cài đặt'), { code: 'STOPPED_BY_USER' }))
    return new Promise<T>((resolve, reject) => {
      const item: QueueTask<T> = { label, signal, task, resolve, reject }
      if (signal) {
        item.onAbort = () => {
          const index = this.queue.indexOf(item as QueueTask<unknown>)
          if (index >= 0) {
            this.queue.splice(index, 1)
            reject(Object.assign(new Error('Đã huỷ tác vụ cài đặt'), { code: 'STOPPED_BY_USER' }))
          }
        }
        signal.addEventListener('abort', item.onAbort, { once: true })
      }
      this.queue.push(item as QueueTask<unknown>)
      this.drain()
    })
  }

  public pendingCount(): number {
    return this.queue.length
  }

  private drain(): void {
    while (this.active < MAX_CONCURRENT_INSTALLS && this.queue.length) {
      const item = this.queue.shift()!
      item.signal?.removeEventListener('abort', item.onAbort!)
      if (item.signal?.aborted) {
        item.reject(Object.assign(new Error('Đã huỷ tác vụ cài đặt'), { code: 'STOPPED_BY_USER' }))
        continue
      }
      this.active += 1
      void item.task().then(item.resolve, item.reject).finally(() => {
        this.active -= 1
        this.drain()
      })
    }
  }
}

export const installQueue = new InstallQueue()
