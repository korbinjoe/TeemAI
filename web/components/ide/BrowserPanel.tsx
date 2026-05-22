/**
 * BrowserPanel —  Tab
 *
 *  iframe  dev server /  chat
 * localStorage[browserPanel.lastUrl.{chatId}]  chat  URL
 *
 *  X-Frame-Options: DENY iframe
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, ExternalLink, ArrowLeft, ArrowRight, Globe, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BrowserPanelProps {
  chatId?: string
  workingDirectory?: string
}

const STORAGE_KEY = (chatId: string) => `browserPanel.lastUrl.${chatId}`
const QUICK_PORTS = [3000, 5173, 8080, 4173, 8000]

const normalizeUrl = (raw: string): string => {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^localhost(:\d+)?(\/.*)?$/i.test(trimmed)) return `http://${trimmed}`
  if (/^\d+$/.test(trimmed)) return `http://localhost:${trimmed}`
  if (/^[\w.-]+(:\d+)?(\/.*)?$/.test(trimmed)) return `http://${trimmed}`
  return trimmed
}

const BrowserPanel = ({ chatId }: BrowserPanelProps) => {
  const { t } = useTranslation('workspace')
  const initialUrl = useMemo(() => {
    if (!chatId || typeof window === 'undefined') return ''
    return window.localStorage.getItem(STORAGE_KEY(chatId)) ?? ''
  }, [chatId])

  const [draftUrl, setDraftUrl] = useState(initialUrl)
  const [currentUrl, setCurrentUrl] = useState(initialUrl)
  const [iframeKey, setIframeKey] = useState(0)
  const [loadError, setLoadError] = useState(false)
  const [loading, setLoading] = useState(false)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!chatId || typeof window === 'undefined') return
    if (currentUrl) {
      window.localStorage.setItem(STORAGE_KEY(chatId), currentUrl)
    }
  }, [chatId, currentUrl])

  const handleNavigate = useCallback((raw: string) => {
    const next = normalizeUrl(raw)
    if (!next) return
    setCurrentUrl(next)
    setDraftUrl(next)
    setLoadError(false)
    setLoading(true)
    setIframeKey((k) => k + 1)
  }, [])

  const handleRefresh = useCallback(() => {
    if (!currentUrl) return
    setLoadError(false)
    setLoading(true)
    setIframeKey((k) => k + 1)
  }, [currentUrl])

  const handleClear = useCallback(() => {
    setDraftUrl('')
    setCurrentUrl('')
    setLoadError(false)
    if (chatId && typeof window !== 'undefined') {
      window.localStorage.removeItem(STORAGE_KEY(chatId))
    }
    inputRef.current?.focus()
  }, [chatId])

  const handleQuickPort = useCallback((port: number) => {
    handleNavigate(`http://localhost:${port}`)
  }, [handleNavigate])

  const handleHistory = useCallback((dir: 'back' | 'forward') => {
    try {
      const win = iframeRef.current?.contentWindow
      if (!win) return
      if (dir === 'back') win.history.back()
      else win.history.forward()
    } catch {
    }
  }, [])

  const handleIframeLoad = useCallback(() => {
    setLoading(false)
  }, [])

  const handleIframeError = useCallback(() => {
    setLoading(false)
    setLoadError(true)
  }, [])

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      <div className="shrink-0 border-b border-border-subtle px-2 py-1.5 flex items-center gap-1">
        <button
          onClick={() => handleHistory('back')}
          disabled={!currentUrl}
          className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title={t('browser.back')}
          aria-label={t('browser.back')}
        >
          <ArrowLeft size={13} />
        </button>
        <button
          onClick={() => handleHistory('forward')}
          disabled={!currentUrl}
          className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title={t('browser.forward')}
          aria-label={t('browser.forward')}
        >
          <ArrowRight size={13} />
        </button>
        <button
          onClick={handleRefresh}
          disabled={!currentUrl}
          className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title={t('browser.refresh')}
          aria-label={t('browser.refresh')}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} />
        </button>

        <div className="flex-1 min-w-0 relative">
          <Globe size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            ref={inputRef}
            type="text"
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNavigate(draftUrl)
            }}
            placeholder={t('browser.placeholder')}
            className="w-full pl-7 pr-7 py-1 rounded border border-border bg-bg-secondary text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-brand"
            spellCheck={false}
          />
          {draftUrl && (
            <button
              onClick={handleClear}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover"
              title={t('browser.clear')}
              aria-label={t('browser.clearAddress')}
            >
              <X size={11} />
            </button>
          )}
        </div>

        <button
          onClick={() => currentUrl && window.open(currentUrl, '_blank', 'noopener,noreferrer')}
          disabled={!currentUrl}
          className="p-1 rounded text-text-secondary hover:text-text-primary hover:bg-bg-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title={t('browser.openNewWindow')}
          aria-label={t('browser.openNewWindow')}
        >
          <ExternalLink size={13} />
        </button>
      </div>

      <div className="shrink-0 px-2 py-1 flex items-center gap-1 border-b border-border-subtle bg-bg-secondary/40">
        <span className="text-[10px] text-text-muted shrink-0">{t('browser.quickPorts')}</span>
        {QUICK_PORTS.map((port) => (
          <button
            key={port}
            onClick={() => handleQuickPort(port)}
            className={cn(
              'px-1.5 py-0.5 rounded text-[10px] border transition-colors',
              currentUrl.includes(`localhost:${port}`)
                ? 'bg-accent-brand/15 text-accent-brand border-accent-brand/40'
                : 'border-border-subtle text-text-secondary hover:text-text-primary hover:bg-bg-hover',
            )}
            title={`http://localhost:${port}`}
          >
            :{port}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 relative bg-white">
        {!currentUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 gap-2">
            <Globe size={28} className="text-text-muted" />
            <div className="text-xs text-text-muted">
              {t('browser.emptyTitle')}
            </div>
            <div className="text-[10px] text-text-muted">
              {t('browser.emptyHint')}<code className="px-1 rounded bg-bg-secondary text-text-secondary">5173</code> →
              <code className="ml-1 px-1 rounded bg-bg-secondary text-text-secondary">http://localhost:5173</code>
            </div>
          </div>
        )}

        {currentUrl && loadError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 gap-3 bg-bg-primary">
            <Globe size={28} className="text-rose-400" />
            <div className="text-xs text-text-primary">{t('browser.iframeBlocked')}</div>
            <div className="text-[11px] text-text-muted max-w-xs">
              {t('browser.iframeBlockedDesc')}
            </div>
            <button
              onClick={() => window.open(currentUrl, '_blank', 'noopener,noreferrer')}
              className="mt-1 inline-flex items-center gap-1 px-3 py-1 rounded border border-accent-brand/40 bg-accent-brand/10 text-xs text-accent-brand hover:bg-accent-brand/20"
            >
              <ExternalLink size={12} />
              {t('browser.openNewWindow')}
            </button>
          </div>
        )}

        {currentUrl && (
          <iframe
            ref={iframeRef}
            key={iframeKey}
            src={currentUrl}
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            className={cn('w-full h-full border-0', loadError && 'invisible')}
            title={t('browser.preview')}
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-downloads allow-pointer-lock allow-presentation"
            referrerPolicy="no-referrer"
          />
        )}
      </div>
    </div>
  )
}

export default BrowserPanel
