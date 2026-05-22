/**
 * PermissionModal — CLI permission request UI
 *
 * Receives expert:permission-request via WS
 * → Sends expert:permission-response with outcome
 *
 * Supports allow_once for CLI providers
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ShieldCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getWebSocketClient } from '@/services/WebSocketClient'
import type { ExpertPermissionRequestPayload } from '@shared/ws-types'

export type PermissionRequest = ExpertPermissionRequestPayload

interface Props {
  request: PermissionRequest | null
  onResolved: (requestId: string) => void
}

const kindButtonClass = (kind: PermissionRequest['options'][number]['kind']) => {
  if (kind === 'allow_always') {
    return 'bg-emerald-600 text-white border-transparent hover:bg-emerald-500'
  }
  if (kind === 'allow_once') {
    return 'bg-[rgb(var(--accent-brand))] text-white border-transparent hover:opacity-90'
  }
  if (kind === 'reject_always') {
    return 'bg-red-600 text-white border-transparent hover:bg-red-500'
  }
  return 'bg-transparent text-[rgb(var(--text-muted))] border border-[rgb(var(--border-subtle))] hover:bg-[rgb(var(--bg-input))]'
}

const formatRawInput = (raw: unknown, truncatedLabel: string): string => {
  if (raw == null) return ''
  try {
    const text = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)
    return text.length > 2000 ? text.slice(0, 2000) + truncatedLabel : text
  } catch {
    return String(raw)
  }
}

const PermissionModal = ({ request, onResolved }: Props) => {
  const { t } = useTranslation('chat')
  const [submitting, setSubmitting] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  useEffect(() => {
    setSubmitting(false)
    setShowRaw(false)
  }, [request?.requestId])

  useEffect(() => {
    if (!request) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') sendResponse({ outcome: 'cancelled' })
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request?.requestId])

  if (!request) return null

  const sendResponse = (outcome: { outcome: 'selected'; optionId: string } | { outcome: 'cancelled' }) => {
    if (submitting) return
    setSubmitting(true)
    getWebSocketClient().send('expert:permission-response', {
      agentId: request.agentId,
      chatId: request.chatId,
      sessionId: request.sessionId,
      requestId: request.requestId,
      outcome,
    })
    onResolved(request.requestId)
  }

  const rawPreview = formatRawInput(request.toolCall.rawInput, t('permission.truncated'))

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/45"
      onClick={() => sendResponse({ outcome: 'cancelled' })}
      role="dialog"
      aria-modal="true"
      aria-labelledby="permission-modal-title"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[460px] max-w-[90vw] rounded-xl border border-[rgb(var(--border-subtle))] bg-[rgb(var(--bg-elevated))] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.35)]"
      >
        <div className="mb-3 flex items-center gap-2.5">
          <ShieldCheck size={18} className="text-[rgb(var(--accent-brand))]" />
          <span id="permission-modal-title" className="text-sm font-semibold text-[rgb(var(--text-emphasis))]">
            Agent RequestPermission
          </span>
          <button
            onClick={() => sendResponse({ outcome: 'cancelled' })}
            className="ml-auto flex cursor-pointer items-center rounded bg-transparent p-1 text-[rgb(var(--text-muted))] hover:bg-[rgb(var(--bg-input))]"
            aria-label="Cancel"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mb-3.5 rounded-lg border border-[rgb(var(--border-subtle))] bg-[rgb(var(--bg-input))] px-3 py-2.5">
          <div className="mb-1 text-[11px] text-[rgb(var(--text-muted))]">{t('permission.toolCall')}</div>
          <div className="break-all text-[13px] text-[rgb(var(--text-emphasis))]">
            {request.toolCall.title}
          </div>
          {rawPreview && (
            <div className="mt-2">
              <button
                onClick={() => setShowRaw(!showRaw)}
                className="text-[11px] text-[rgb(var(--text-muted))] hover:text-[rgb(var(--text-emphasis))]"
              >
                {showRaw ? t('permission.hideParams') : t('permission.showParams')}
              </button>
              {showRaw && (
                <pre className="mt-1.5 max-h-[220px] overflow-auto whitespace-pre-wrap break-all rounded border border-[rgb(var(--border-subtle))] bg-black/20 p-2 text-[11px] leading-relaxed text-[rgb(var(--text-muted))]">
                  {rawPreview}
                </pre>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2">
          {request.options.map((opt) => (
            <button
              key={opt.optionId}
              disabled={submitting}
              onClick={() => sendResponse({ outcome: 'selected', optionId: opt.optionId })}
              className={cn(
                'rounded px-3.5 py-2 text-[13px] font-medium transition',
                submitting ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                kindButtonClass(opt.kind),
              )}
            >
              {opt.name}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default PermissionModal
