import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DEFAULT_MODELS } from '@/lib/models'
import type { CronJob, CronTrigger } from '../../types/cron'

interface Workspace {
  id: string
  name: string
}

interface Agent {
  name: string
  description: string
  role: string
}

interface CronJobFormProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: CronJobFormData) => Promise<void>
  initialData?: CronJob | null
  prefillData?: Partial<CronJobFormData> | null
  workspaces: Workspace[]
  agents: Agent[]
}

export interface CronJobFormData {
  name: string
  description?: string
  workspaceId: string
  agentId?: string
  model?: string
  trigger: CronTrigger
  prompt: string
  retryOnFailure: boolean
  maxRetries: number
}

const CronJobForm = ({ open, onClose, onSubmit, initialData, prefillData, workspaces, agents }: CronJobFormProps) => {
  const { t } = useTranslation('cron')
  const [submitting, setSubmitting] = useState(false)

  // Form state
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const [agentName, setAgentName] = useState('')
  const [model, setModel] = useState('')
  const [triggerKind, setTriggerKind] = useState<'cron' | 'once' | 'interval'>('cron')
  const [cronExpression, setCronExpression] = useState('')
  const [timezone, setTimezone] = useState('Asia/Shanghai')
  const [scheduledAt, setScheduledAt] = useState('')
  const [intervalValue, setIntervalValue] = useState(30)
  const [intervalUnit, setIntervalUnit] = useState<'minutes' | 'hours' | 'days'>('minutes')
  const [prompt, setPrompt] = useState('')
  const [retryOnFailure, setRetryOnFailure] = useState(true)
  const [maxRetries, setMaxRetries] = useState(2)

  const applyTrigger = (tr: CronTrigger) => {
    setTriggerKind(tr.kind)
    if (tr.kind === 'cron') {
      setCronExpression(tr.expression)
      setTimezone(tr.timezone || 'Asia/Shanghai')
    } else if (tr.kind === 'once') {
      setScheduledAt(tr.at.slice(0, 16))
    } else if (tr.kind === 'interval') {
      if (tr.intervalMs >= 86400000) {
        setIntervalValue(tr.intervalMs / 86400000)
        setIntervalUnit('days')
      } else if (tr.intervalMs >= 3600000) {
        setIntervalValue(tr.intervalMs / 3600000)
        setIntervalUnit('hours')
      } else {
        setIntervalValue(tr.intervalMs / 60000)
        setIntervalUnit('minutes')
      }
    }
  }

  const resetToDefaults = () => {
    setName('')
    setDescription('')
    setWorkspaceId(workspaces[0]?.id || '')
    setAgentName('')
    setModel('')
    setTriggerKind('cron')
    setCronExpression('')
    setTimezone('Asia/Shanghai')
    setScheduledAt('')
    setIntervalValue(30)
    setIntervalUnit('minutes')
    setPrompt('')
    setRetryOnFailure(true)
    setMaxRetries(2)
  }

  // Reset on open / initialData / prefillData change
  useEffect(() => {
    if (!open) return

    if (initialData) {
      setName(initialData.name)
      setDescription(initialData.description || '')
      setWorkspaceId(initialData.workspaceId)
      setAgentName(initialData.agentId || '')
      setModel(initialData.model || '')
      setPrompt(initialData.prompt)
      setRetryOnFailure(initialData.retryOnFailure)
      setMaxRetries(initialData.maxRetries)
      applyTrigger(initialData.trigger)
    } else if (prefillData) {
      resetToDefaults()
      if (prefillData.name) setName(prefillData.name)
      if (prefillData.description) setDescription(prefillData.description)
      if (prefillData.workspaceId) setWorkspaceId(prefillData.workspaceId)
      if (prefillData.agentId) setAgentName(prefillData.agentId)
      if (prefillData.model) setModel(prefillData.model)
      if (prefillData.prompt) setPrompt(prefillData.prompt)
      if (prefillData.retryOnFailure !== undefined) setRetryOnFailure(prefillData.retryOnFailure)
      if (prefillData.maxRetries !== undefined) setMaxRetries(prefillData.maxRetries)
      if (prefillData.trigger) applyTrigger(prefillData.trigger)
    } else {
      resetToDefaults()
    }
  }, [open, initialData, prefillData, workspaces])

  const buildTrigger = (): CronTrigger => {
    switch (triggerKind) {
      case 'cron':
        return { kind: 'cron', expression: cronExpression, timezone }
      case 'once':
        return { kind: 'once', at: new Date(scheduledAt).toISOString() }
      case 'interval': {
        const multiplier = intervalUnit === 'days' ? 86400000 : intervalUnit === 'hours' ? 3600000 : 60000
        return { kind: 'interval', intervalMs: intervalValue * multiplier }
      }
    }
  }

  const handleSubmit = async () => {
    if (!name.trim() || !workspaceId || !prompt.trim()) return
    if (triggerKind === 'cron' && !cronExpression.trim()) return
    if (triggerKind === 'once' && !scheduledAt) return

    setSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        workspaceId,
        agentId: agentName || undefined,
        model: model || undefined,
        trigger: buildTrigger(),
        prompt: prompt.trim(),
        retryOnFailure,
        maxRetries,
      })
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  const availableAgents = agents

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} role="button" tabIndex={-1} aria-label="Close" />
      <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
        <div className="bg-bg-primary border border-border rounded-lg w-full max-w-lg max-h-[85vh] flex flex-col shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-border-subtle">
            <h2 className="text-sm font-semibold text-text-primary">
              {initialData ? t('editTask') : t('newTask')}
            </h2>
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
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Name */}
            <FormField label={t('form.name')}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('form.namePlaceholder')}
                className="form-input"
              />
            </FormField>

            {/* Workspace */}
            <FormField label={t('form.workspace')}>
              <select value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)} className="form-input">
                {workspaces.map((ws) => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
            </FormField>

            {/* Agent */}
            <FormField label={t('form.agent')}>
              <select value={agentName} onChange={(e) => setAgentName(e.target.value)} className="form-input">
                <option value="">—</option>
                {availableAgents.map((a) => (
                  <option key={a.name} value={a.name}>{a.name}</option>
                ))}
              </select>
            </FormField>

            {/* Model */}
            <FormField label={t('form.model')}>
              <select value={model} onChange={(e) => setModel(e.target.value)} className="form-input">
                <option value="">—</option>
                {DEFAULT_MODELS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </FormField>

            {/* Trigger type */}
            <FormField label={t('form.trigger')}>
              <div className="flex gap-2">
                {(['cron', 'once', 'interval'] as const).map((kind) => (
                  <button
                    key={kind}
                    onClick={() => setTriggerKind(kind)}
                    onKeyDown={(e) => { if (e.key === 'Enter') setTriggerKind(kind) }}
                    tabIndex={0}
                    aria-label={t(`form.trigger${kind.charAt(0).toUpperCase() + kind.slice(1)}`)}
                    className={cn(
                      'px-3 py-1.5 text-xs rounded-md border transition-colors',
                      triggerKind === kind
                        ? 'border-accent-brand text-accent-brand bg-accent-brand/10'
                        : 'border-border text-text-secondary hover:border-border-emphasis',
                    )}
                  >
                    {t(`form.trigger${kind.charAt(0).toUpperCase() + kind.slice(1)}`)}
                  </button>
                ))}
              </div>
            </FormField>

            {/* Trigger config */}
            {triggerKind === 'cron' && (
              <div className="space-y-3">
                <FormField label={t('form.cronExpression')}>
                  <input
                    value={cronExpression}
                    onChange={(e) => setCronExpression(e.target.value)}
                    placeholder={t('form.cronPlaceholder')}
                    className="form-input font-mono"
                  />
                  <p className="text-xs text-text-secondary mt-1">{t('form.cronHelp')}</p>
                </FormField>
                <FormField label={t('form.timezone')}>
                  <input
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="form-input"
                  />
                </FormField>
              </div>
            )}

            {triggerKind === 'once' && (
              <FormField label={t('form.scheduledTime')}>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="form-input"
                />
              </FormField>
            )}

            {triggerKind === 'interval' && (
              <FormField label={t('form.interval')}>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    value={intervalValue}
                    onChange={(e) => setIntervalValue(Number(e.target.value))}
                    className="form-input w-24"
                  />
                  <select value={intervalUnit} onChange={(e) => setIntervalUnit(e.target.value as any)} className="form-input">
                    <option value="minutes">{t('form.minutes')}</option>
                    <option value="hours">{t('form.hours')}</option>
                    <option value="days">{t('form.days')}</option>
                  </select>
                </div>
              </FormField>
            )}

            {/* Prompt */}
            <FormField label={t('form.prompt')}>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t('form.promptPlaceholder')}
                rows={4}
                className="form-input resize-none"
              />
            </FormField>

            {/* Retry */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={retryOnFailure}
                  onChange={(e) => setRetryOnFailure(e.target.checked)}
                  className="accent-accent-brand"
                />
                {t('form.retryOnFailure')}
              </label>
              {retryOnFailure && (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-text-secondary">{t('form.maxRetries')}:</span>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={maxRetries}
                    onChange={(e) => setMaxRetries(Number(e.target.value))}
                    className="form-input w-14 text-center"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-5 py-3 border-t border-border-subtle">
            <button
              onClick={onClose}
              onKeyDown={(e) => { if (e.key === 'Enter') onClose() }}
              tabIndex={0}
              aria-label="Cancel"
              className="px-4 py-1.5 text-xs rounded-md border border-border text-text-secondary hover:bg-bg-hover-muted transition-colors"
            >
              {t('common:action.cancel', { defaultValue: 'Cancel' })}
            </button>
            <button
              onClick={handleSubmit}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
              tabIndex={0}
              aria-label="Save"
              disabled={submitting || !name.trim() || !prompt.trim()}
              className="px-4 py-1.5 text-xs rounded-md bg-accent-brand text-white hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {submitting ? t('common:action.loading', { defaultValue: 'Loading...' }) : t('common:action.save', { defaultValue: 'Save' })}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

const FormField = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div>
    <label className="block text-xs font-medium text-text-secondary mb-1">{label}</label>
    {children}
  </div>
)

export default CronJobForm
