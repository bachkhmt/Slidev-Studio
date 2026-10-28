type Job = { id: string; run: () => Promise<unknown>; resolve: (v: any) => void; reject: (e: Error) => void }
export class StartQueue {
  private jobs: Job[] = []
  private active = 0
  run<T>(id: string, action: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.jobs.push({ id, run: action, resolve, reject })
      this.pump()
    })
  }
  prioritize(id: string) {
    this.jobs.sort((a, b) => Number(b.id === id) - Number(a.id === id))
  }
  cancel(id: string) {
    const removed = this.jobs.filter((j) => j.id === id)
    this.jobs = this.jobs.filter((j) => j.id !== id)
    removed.forEach((j) => j.reject(Object.assign(new Error('Đã huỷ khởi chạy Slidev'), { code: 'STOPPED_BY_USER' })))
  }
  private pump() {
    while (this.active < 2 && this.jobs.length) {
      const job = this.jobs.shift()!
      this.active++
      job
        .run()
        .then(job.resolve, job.reject)
        .finally(() => {
          this.active--
          this.pump()
        })
    }
  }
}
