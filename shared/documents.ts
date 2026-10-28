export type CloseChoice = 'save' | 'discard' | 'cancel'
export interface PrepareCloseRequest {
  requestId: string
  action: 'window' | 'quit'
}
export interface PrepareCloseReply {
  requestId: string
  status: 'complete' | 'cancel' | 'error'
  message?: string
}
export interface FileStamp {
  mtimeMs: number
  size: number
}
export interface DocumentSnapshot {
  path: string
  content: string
  revision: number
  savedRevision: number
  loading: boolean
  saving: boolean
  error?: string
  readError?: boolean
  guard?: { line: number; reason: string }
}
