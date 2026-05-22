import { Component, type ReactNode } from 'react'
import i18n from '@/i18n'
import { sendTelemetry } from '@/services/WebSocketClient'
import { AlertTriangle, RotateCcw, Home } from 'lucide-react'

interface Props {
  children: ReactNode
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught error:', error, info.componentStack)
    sendTelemetry('system', 'web.uncaught_error', { error: error.message, componentStack: info.componentStack?.slice(0, 500) })
  }

  handleReload = () => {
    window.location.reload()
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-full flex items-center justify-center bg-bg-primary p-8">
          <div className="max-w-md text-center">
            <AlertTriangle size={40} className="text-accent-yellow mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-text-primary mb-2">
              {this.props.fallbackTitle || i18n.t('common:error.renderError')}
            </h2>
            <p className="text-sm text-text-secondary mb-1">
              {i18n.t('common:error.unexpectedHint')}
            </p>
            {this.state.error && (
              <p className="text-xs text-text-muted font-mono bg-bg-hover-subtle rounded px-3 py-2 mb-4 break-all">
                {this.state.error.message}
              </p>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleGoHome}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md border border-border bg-bg-primary text-text-primary hover:bg-bg-hover transition-colors cursor-pointer"
              >
                <Home size={14} />
                {i18n.t('common:error.goHome')}
              </button>
              <button
                onClick={this.handleReload}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm rounded-md bg-accent-brand text-white hover:bg-accent-brand/90 transition-colors cursor-pointer border-none"
              >
                <RotateCcw size={14} />
                {i18n.t('common:error.reload')}
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
