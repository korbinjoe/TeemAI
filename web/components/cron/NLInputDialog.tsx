import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { authFetch } from '@/config/api'
import type { CronJobFormData } from './CronJobForm'

interface NLInputDialogProps {
  open: boolean
  onClose: () => void
  onParsed: (data: Partial<CronJobFormData>) => void
  onSkip: () => void
}

const NLInputDialog = ({ open, onClose, onParsed, onSkip }: NLInputDialogProps) => {
  const { t } = useTranslation('cron')
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  if (!open) return null

  const handleSend = async () => {
    if (!input.trim() || loading) return
    setLoading(true)

    try {
      const res = await authFetch('/api/cron-jobs/parse-nl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: input.trim() }),
      })
      const result = await res.json()

      if (result.success && result.parsed) {
        onClose()
        onParsed(result.parsed)
      } else {
        toast.error(t('nl.error.parseFailed'))
        onClose()
        onSkip()
      }
    } catch {
      toast.error(t('nl.error.networkError'))
      onClose()
      onSkip()
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSkip = () => {
    onClose()
    onSkip()
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        role="button"
        tabIndex={-1}
        aria-label="Close"
      />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-bg-primary border border-border rounded-lg w-full max-w-lg shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-accent-brand" />
              <h2 className="text-sm font-semibold text-text-primary">
                {t('nl.title')}
              </h2>
            </div>
            <button
              onClick={onClose}
              onKeyDown={(e) => { if (e.key === 'Enter') onClose() }}
              tabIndex={0}
              aria-label="Close"
              className="w-7 h-7 flex items-center justify-center rounded text-text-secondary hover:text-text-primary hover:bg-bg-hover-muted"
            >
              <X size={16} />
            </button>
          </div>

          {/* Body */}
          <div className="px-5 py-5">
            <p className="text-xs text-text-secondary mb-3">
              {t('nl.description')}
            </p>

            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('nl.placeholder')}
                rows={3}
                disabled={loading}
                className="form-input resize-none pr-20"
                autoFocus
              />
              <button
                onClick={handleSend}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSend() }}
                tabIndex={0}
                aria-label={t('nl.send')}
                disabled={!input.trim() || loading}
                className="absolute right-2 bottom-2 flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-accent-brand text-white hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    {t('nl.parsing')}
                  </>
                ) : (
                  <>
                    <Sparkles size={12} />
                    {t('nl.send')}
                  </>
                )}
              </button>
            </div>

            {/* Divider + manual mode link */}
            <div className="flex items-center gap-3 mt-4">
              <div className="flex-1 h-px bg-border-subtle" />
              <span className="text-xs text-text-secondary">{t('nl.or')}</span>
              <div className="flex-1 h-px bg-border-subtle" />
            </div>

            <button
              onClick={handleSkip}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSkip() }}
              tabIndex={0}
              aria-label={t('nl.skipToManual')}
              className="w-full mt-3 py-2 text-xs text-text-secondary hover:text-text-primary transition-colors text-center"
            >
              {t('nl.skipToManual')}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export default NLInputDialog
