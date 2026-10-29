export interface ReportSnapshot {
  projectId: string
  state: 'idle' | 'compiling' | 'ready' | 'error' | 'cancelled'
  logs: string[]
  error?: string
  compiledAt?: number
}

export interface CompilerInfo {
  available: boolean
  version?: string
}

export interface ReportsAPI {
  compiler: () => Promise<CompilerInfo>
  installCompiler: () => Promise<CompilerInfo>
  status: (projectId: string) => Promise<ReportSnapshot>
  compile: (projectId: string, entryFile: string) => Promise<ReportSnapshot>
  cancel: (projectId: string) => Promise<void>
  readPdf: (projectId: string, entryFile: string, reference?: boolean) => Promise<Uint8Array | null>
  exportPdf: (projectId: string, entryFile: string) => Promise<string | null>
  onChange: (callback: (snapshot: ReportSnapshot) => void) => () => void
}
