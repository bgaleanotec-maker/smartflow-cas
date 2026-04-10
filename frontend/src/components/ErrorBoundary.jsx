import { Component } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo })
    // Could log to error reporting service here
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-[400px] p-6">
          <div className="card max-w-md w-full text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-red-900/30 border border-red-700/40 flex items-center justify-center mx-auto">
              <AlertTriangle size={24} className="text-red-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-100 mb-1">Algo salió mal</h2>
              <p className="text-sm text-slate-400">
                Ocurrió un error inesperado en esta sección. Puedes intentar recargar.
              </p>
              {this.state.error && (
                <p className="text-xs text-slate-600 mt-2 font-mono bg-slate-800 rounded-lg px-3 py-2 text-left">
                  {this.state.error.message}
                </p>
              )}
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="btn-primary flex items-center gap-2"
              >
                <RefreshCw size={14} />
                Reintentar
              </button>
              <button
                onClick={() => window.location.reload()}
                className="btn-secondary flex items-center gap-2"
              >
                Recargar página
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
