import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { execa } from 'execa'
import treeKill from 'tree-kill'
import { projectStore } from './projectStore'
import { diag } from '../utils/diag'
import { dataDir } from '../utils/dataDir'

export interface RunningEntry {
  pid: number
  projectId: string
  port: number
  appPid: number
  startedAt: string
  cmdHint: string
}

class PidRegistry {
  private readonly filePath = path.join(dataDir(), 'running.json')

  public list(): RunningEntry[] {
    try {
      const content = fs.readJsonSync(this.filePath)
      return Array.isArray(content.entries) ? content.entries : []
    } catch {
      return []
    }
  }

  public add(entry: RunningEntry): void {
    this.write([...this.list().filter((item) => item.pid !== entry.pid), entry])
  }

  public remove(pid: number): void {
    this.write(this.list().filter((item) => item.pid !== pid))
  }

  private write(entries: RunningEntry[]): void {
    fs.ensureDirSync(path.dirname(this.filePath))
    const tmp = `${this.filePath}.tmp-${process.pid}`
    fs.writeJsonSync(tmp, { entries }, { spaces: 2 })
    fs.renameSync(tmp, this.filePath)
  }
}

export const pidRegistry = new PidRegistry()

export async function reapOrphans(): Promise<void> {
  if (projectStore.getSettings().server.keepServersOnQuit) {
    diag('reap-skipped', { reason: 'keepServersOnQuit' })
    return
  }
  const entries = pidRegistry.list()
  for (const entry of entries) {
    let appAlive = true
    try {
      process.kill(entry.appPid, 0)
    } catch (error) {
      appAlive = (error as NodeJS.ErrnoException).code !== 'ESRCH'
    }
    if (appAlive) {
      diag('reap-skipped', {
        pid: entry.pid,
        projectId: entry.projectId,
        appPid: entry.appPid,
        reason: 'app-still-alive'
      })
      continue
    }

    let command = ''
    try {
      if (process.platform === 'win32') {
        const result = await execa('wmic', ['process', 'where', `processid=${entry.pid}`, 'get', 'commandline'], {
          buffer: true,
          reject: false
        })
        command = result.stdout
      } else {
        const result = await execa('ps', ['-p', String(entry.pid), '-o', 'command='], { buffer: true, reject: false })
        command = result.stdout
      }
    } catch {
      /* Process may already be gone. */
    }

    const verified = command.toLowerCase().includes('slidev')
    if (verified) {
      await new Promise<void>((resolve) => treeKill(entry.pid, 'SIGKILL', () => resolve()))
    }
    pidRegistry.remove(entry.pid)
    diag('reap', { pid: entry.pid, projectId: entry.projectId, verified, command: command.slice(0, 300) })
  }
}
