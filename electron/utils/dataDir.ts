import os from 'os'
import path from 'path'
import { app } from 'electron'
export function dataDir(): string {
  const override = process.env.SLIDEV_STUDIO_TEST_DATA_DIR
  return process.versions.electron &&
    !app.isPackaged &&
    process.env.NODE_ENV === 'test' &&
    override &&
    path.isAbsolute(override)
    ? override
    : path.join(os.homedir(), '.slidev-studio')
}
