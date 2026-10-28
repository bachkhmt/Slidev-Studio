import fs from 'fs-extra'
import path from 'path'
import os from 'os'
import { dataDir } from './dataDir'

const logPath = path.join(dataDir(), 'logs', 'main.log')

export function diag(event: string, details: Record<string, unknown> = {}): void {
  try {
    fs.ensureDirSync(path.dirname(logPath))
    const entry = {
      time: new Date().toISOString(),
      event,
      pid: process.pid,
      ppid: process.ppid,
      ...details
    }
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8')
  } catch (error) {
    console.warn('[Slidev Studio] Không thể ghi log chẩn đoán:', error)
  }
}
