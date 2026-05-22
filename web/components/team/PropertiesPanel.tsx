/**
 * PropertiesPanel —
 *  Agent
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Trash2 } from 'lucide-react'
import type { Node } from '@xyflow/react'
import AgentAvatar from '@/components/ui/agent-avatar'
import { DEFAULT_MODELS } from '@/lib/models'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

interface PropertiesPanelProps {
  node: Node
  onUpdateConfig: (nodeId: string, config: Record<string, unknown>) => void
  onDelete: (nodeId: string) => void
  onClose: () => void
}

const PropertiesPanel = ({ node, onUpdateConfig, onDelete, onClose }: PropertiesPanelProps) => {
  const { t } = useTranslation(['agents', 'common'])
  const data = node.data as Record<string, unknown>
  const config = (data.config || {}) as Record<string, string | number | undefined>

  const [trigger, setTrigger] = useState(config.trigger as string || '')
  const [input, setInput] = useState(config.input as string || '')
  const [output, setOutput] = useState(config.output as string || '')
  const [fallback, setFallback] = useState(config.fallback as string || '')
  const [model, setModel] = useState(config.model as string || '')
  const [maxRetries, setMaxRetries] = useState(config.maxRetries as number || 3)

  // Sync when node changes
  useEffect(() => {
    const c = ((node.data as Record<string, unknown>).config || {}) as Record<string, string | number | undefined>
    setTrigger(c.trigger as string || '')
    setInput(c.input as string || '')
    setOutput(c.output as string || '')
    setFallback(c.fallback as string || '')
    setModel(c.model as string || '')
    setMaxRetries(c.maxRetries as number || 3)
  }, [node.id, node.data])

  const handleBlur = () => {
    onUpdateConfig(node.id, {
      trigger,
      input,
      output,
      fallback,
      model: model || undefined,
      maxRetries,
    })
  }

  return (
    <div className="w-[260px] shrink-0 border-l border-border-subtle bg-bg-secondary flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <div className="flex items-center gap-1.5">
          <AgentAvatar name={data.agentName as string} agentId={data.agentName as string} size="xs" />
          <span className="text-xs font-medium text-text-emphasis">{data.agentName as string}</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close properties"
          tabIndex={0}
          className="text-text-secondary hover:text-text-primary p-0.5 transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <Field label={t('agents:team.properties.trigger')} hint={t('agents:team.properties.triggerHint')}>
          <input
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            onBlur={handleBlur}
            placeholder={t('agents:team.properties.triggerPlaceholder')}
            className="field-input"
            aria-label={t('agents:team.properties.trigger')}
          />
        </Field>

        <Field label={t('agents:team.properties.input')} hint={t('agents:team.properties.inputHint')}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onBlur={handleBlur}
            placeholder={t('agents:team.properties.inputPlaceholder')}
            className="field-input"
            aria-label={t('agents:team.properties.input')}
          />
        </Field>

        <Field label={t('agents:team.properties.output')} hint={t('agents:team.properties.outputHint')}>
          <input
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            onBlur={handleBlur}
            placeholder={t('agents:team.properties.outputPlaceholder')}
            className="field-input"
            aria-label={t('agents:team.properties.output')}
          />
        </Field>

        <Field label={t('agents:team.properties.fallback')} hint={t('agents:team.properties.fallbackHint')}>
          <input
            value={fallback}
            onChange={(e) => setFallback(e.target.value)}
            onBlur={handleBlur}
            placeholder={t('agents:team.properties.fallbackPlaceholder')}
            className="field-input"
            aria-label={t('agents:team.properties.fallback')}
          />
        </Field>

        <Field label={t('agents:team.properties.model')}>
          <Select value={model || 'default'} onValueChange={(v) => { setModel(v === 'default' ? '' : v); handleBlur() }}>
            <SelectTrigger aria-label="Select model" className="h-7 text-xs">
              <SelectValue placeholder="Default" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">{t('agents:team.properties.modelDefault')}</SelectItem>
              {DEFAULT_MODELS.map((m) => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label={t('agents:team.properties.maxRetries')}>
          <input
            type="number"
            value={maxRetries}
            onChange={(e) => setMaxRetries(Number(e.target.value))}
            onBlur={handleBlur}
            min={0}
            max={10}
            className="field-input w-20"
            aria-label={t('agents:team.properties.maxRetries')}
          />
        </Field>

        {/* Danger zone */}
        <div className="pt-3 border-t border-border-subtle">
          <button
            onClick={() => onDelete(node.id)}
            aria-label={t('agents:team.properties.removeFromTeam')}
            tabIndex={0}
            className="inline-flex items-center gap-1.5 text-xs text-accent-red/70 hover:text-accent-red transition-colors"
          >
            <Trash2 size={11} />
            {t('agents:team.properties.removeFromTeam')}
          </button>
        </div>
      </div>

      <style>{`
        .field-input {
          width: 100%;
          height: 28px;
          border-radius: 6px;
          border: 1px solid rgb(var(--border-color));
          background: rgb(var(--bg-input));
          padding: 0 8px;
          font-size: 12px;
          color: rgb(var(--text-primary));
          outline: none;
          transition: border-color 0.15s;
        }
        .field-input:focus {
          border-color: rgb(var(--accent-brand));
        }
        .field-input::placeholder {
          color: rgb(var(--text-muted));
        }
      `}</style>
    </div>
  )
}

const Field = ({ label, hint, children }: {
  label: string
  hint?: string
  children: React.ReactNode
}) => (
  <div>
    <div className="text-xs font-medium text-text-secondary mb-1">
      {label}
      {hint && <span className="font-normal text-text-secondary ml-1">({hint})</span>}
    </div>
    {children}
  </div>
)

export default PropertiesPanel
