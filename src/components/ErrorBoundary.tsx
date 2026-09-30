import React from 'react'

interface Props { children: React.ReactNode; label?: string }
interface State { error: Error | null; copied: boolean }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null, copied: false }

  static getDerivedStateFromError(error: Error): Partial<State> { return { error } }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error(`Lỗi giao diện${this.props.label ? ` (${this.props.label})` : ''}:`, error, info.componentStack)
  }

  private copyDetails = async (): Promise<void> => {
    const details = `${this.state.error?.stack || this.state.error?.message || 'Không có chi tiết lỗi'}`
    try {
      await navigator.clipboard.writeText(details)
      this.setState({ copied: true })
      setTimeout(() => this.setState({ copied: false }), 1800)
    } catch { /* Clipboard access may be unavailable. */ }
  }

  private reset = (): void => this.setState({ error: null, copied: false })

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children
    return <div role="alert" className="flex h-full min-h-40 flex-col items-center justify-center gap-3 rounded-xl border border-rose-900/60 bg-slate-950 p-6 text-center text-slate-200">
      <h2 className="text-sm font-semibold">{this.props.label || 'Khu vực này'} gặp lỗi hiển thị</h2>
      <p className="max-w-xl break-all font-mono text-xs text-rose-300">{this.state.error.message}</p>
      <div className="flex gap-2">
        <button onClick={this.reset} className="rounded-lg bg-blue-600 px-3 py-2 text-xs text-white hover:bg-blue-500">Tải lại giao diện</button>
        <button onClick={() => void this.copyDetails()} className="rounded-lg bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700">{this.state.copied ? 'Đã sao chép' : 'Sao chép chi tiết'}</button>
      </div>
    </div>
  }
}
