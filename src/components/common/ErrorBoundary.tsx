import { Component, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 px-6 text-center">
          <div className="text-red-400 text-4xl">⚠</div>
          <p className="text-slate-300 font-semibold">エラーが発生しました</p>
          <p className="text-slate-500 text-sm font-mono break-all">
            {this.state.error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 px-6 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm transition-colors"
          >
            再読み込み
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
