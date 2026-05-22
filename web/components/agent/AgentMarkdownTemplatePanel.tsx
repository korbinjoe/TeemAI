import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, FileStack } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { AgentMarkdownTemplate } from '@/config/agentMarkdownTemplates'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export type AgentMarkdownTemplatePanelProps = {
  templates: AgentMarkdownTemplate[]
  disabled?: boolean
  activeFileLabel: string
  onApply: (body: string) => void
}

// Hints are now resolved via i18n in the component body

/**
 * AGENTS.md / SOUL.md → →
 */
const AgentMarkdownTemplatePanel = ({
  templates,
  disabled = false,
  activeFileLabel: _activeFileLabel,
  onApply,
}: AgentMarkdownTemplatePanelProps) => {
  const { t } = useTranslation('agents')
  const [previewTemplate, setPreviewTemplate] = useState<AgentMarkdownTemplate | null>(null)
  const [replaceConfirmTemplate, setReplaceConfirmTemplate] = useState<AgentMarkdownTemplate | null>(null)

  const closeReplaceConfirm = useCallback(() => {
    setReplaceConfirmTemplate(null)
  }, [])

  const handleCardUseClick = useCallback((t: AgentMarkdownTemplate) => {
    setPreviewTemplate(null)
    setReplaceConfirmTemplate(t)
  }, [])

  const handleReplaceConfirmApply = useCallback(() => {
    if (!replaceConfirmTemplate) return
    onApply(replaceConfirmTemplate.body)
    closeReplaceConfirm()
    toast.success(t('template.applySuccess'))
  }, [replaceConfirmTemplate, onApply, closeReplaceConfirm])

  const handlePreviewUseClick = useCallback(() => {
    if (!previewTemplate) return
    onApply(previewTemplate.body)
    setPreviewTemplate(null)
    toast.success(t('template.applySuccess'))
  }, [previewTemplate, onApply])

  const handlePreviewDialogOpenChange = useCallback((open: boolean) => {
    if (!open) setPreviewTemplate(null)
  }, [])

  const handleReplaceConfirmDialogOpenChange = useCallback(
    (open: boolean) => {
      if (!open) closeReplaceConfirm()
    },
    [closeReplaceConfirm],
  )

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-x-hidden bg-bg-secondary">
      <div className="shrink-0 border-b border-border-subtle px-3 py-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-text-emphasis">
          <FileStack size={12} className="text-accent-brand shrink-0" />
          {t('template.center')}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2 space-y-2">
        {templates.map((tmpl) => (
          <div
            key={tmpl.id}
            onClick={(e) => {
              if (disabled) return
              if ((e.target as HTMLElement).closest('[data-template-card-actions]')) return
              closeReplaceConfirm()
              setPreviewTemplate(tmpl)
            }}
            className={cn(
              'rounded-md border border-border bg-bg-primary p-2.5 shadow-sm',
              !disabled && 'cursor-pointer',
              disabled && 'cursor-not-allowed opacity-60',
            )}
          >
            <div className="break-words text-xs font-semibold text-text-primary leading-tight">{tmpl.title}</div>
            <p className="mt-1 break-words text-[10px] leading-relaxed text-text-secondary line-clamp-3">
              {tmpl.description}
            </p>
            <div className="mt-2 flex justify-end gap-1.5" data-template-card-actions>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  closeReplaceConfirm()
                  setPreviewTemplate(tmpl)
                }}
                className={cn(
                  'rounded border border-border bg-bg-secondary px-2 py-1 text-[11px] font-medium text-text-primary',
                  'hover:bg-bg-hover-muted transition-colors',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {t('template.preview')}
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => handleCardUseClick(tmpl)}
                className={cn(
                  'rounded border border-accent-brand/40 bg-accent-brand/10 px-2 py-1 text-[11px] font-medium',
                  'text-accent-brand hover:bg-accent-brand/18 transition-colors',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                {t('template.use')}
              </button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!previewTemplate} onOpenChange={handlePreviewDialogOpenChange}>
        <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 p-0">
          <div className="border-b border-border-subtle px-5 py-4">
            <DialogHeader className="space-y-1">
              <DialogTitle>{previewTemplate?.title}</DialogTitle>
              <DialogDescription>{previewTemplate?.description}</DialogDescription>
            </DialogHeader>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
            <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-bg-primary p-3 font-mono text-[11px] leading-relaxed text-text-primary">
              {previewTemplate?.body ?? ''}
            </pre>
          </div>
          {previewTemplate ? (
            <div className="border-t border-accent-brand/40 px-5 py-3">
              <div
                role="status"
                className={cn(
                  'flex gap-2.5 rounded-md border px-3 py-2.5',
                  'border-accent-brand/40 bg-accent-brand/10',
                  'dark:border-accent-brand/45 dark:bg-accent-brand/12',
                )}
              >
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary"
                  aria-hidden
                />
                <p className="min-w-0 text-[11px] leading-relaxed text-text-secondary">
                  {t('template.replaceHintPreview')}
                </p>
              </div>
            </div>
          ) : null}
          <DialogFooter className="border-t border-border-subtle px-5 py-3">
            <button
              type="button"
              onClick={() => setPreviewTemplate(null)}
              className="rounded border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-hover-muted transition-colors"
            >
              {t('template.cancel')}
            </button>
            <button
              type="button"
              disabled={!previewTemplate}
              onClick={handlePreviewUseClick}
              className="rounded bg-accent-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {t('template.use')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!replaceConfirmTemplate} onOpenChange={handleReplaceConfirmDialogOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('template.confirmUse')}</DialogTitle>
            <DialogDescription className="text-left">
              {replaceConfirmTemplate ? t('template.replaceHint', { name: replaceConfirmTemplate.title }) : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <button
              type="button"
              onClick={closeReplaceConfirm}
              className="rounded border border-border bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-hover-muted transition-colors"
            >
              {t('template.cancel')}
            </button>
            <button
              type="button"
              onClick={handleReplaceConfirmApply}
              className="rounded bg-accent-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity"
            >
              {t('template.confirm')}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default AgentMarkdownTemplatePanel
