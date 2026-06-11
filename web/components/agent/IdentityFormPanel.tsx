import { useTranslation } from 'react-i18next'
import type { ParsedIdentity } from '@/hooks/useAgentEditor'
import IdentityToolsMultiSelectPopover from './IdentityToolsMultiSelectPopover'
import { parseIdentityProviderField } from '@/lib/agentIdentityProvider'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'

export type IdentityFormPanelProps = {
  /**  `parseIdentityContent(identityMd)`  */
  value: ParsedIdentity
  onChange: (next: ParsedIdentity) => void
  disabled?: boolean
}

/**
 * IDENTITY.md  `identityMd` `serializeIdentityFromParsed`
 */
const IdentityFormPanel = ({ value, onChange, disabled }: IdentityFormPanelProps) => {
  const { t } = useTranslation('agents')
  const patch = (partial: Partial<ParsedIdentity>) => {
    onChange({ ...value, ...partial })
  }

  const inputClass = cn(
    'w-full rounded-md border border-border bg-bg-input px-3 py-1.5 text-xs text-text-primary',
    'placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-brand',
    'disabled:opacity-60 disabled:cursor-not-allowed',
  )

  const parsed = parseIdentityProviderField(value.provider)
  const providerChoice = parsed === 'codex' ? 'codex' : parsed === 'qodercli' ? 'qodercli' : parsed === 'qoder' ? 'qoder' : 'claude'

  return (
    <div className="h-full min-h-0 overflow-y-auto px-5 py-4 space-y-[12px]">
      <label className="block space-y-1">
        <span className="text-[11px] text-text-secondary">name</span>
        <input
          type="text"
          value={value.name}
          onChange={(e) => patch({ name: e.target.value })}
          disabled={disabled}
          placeholder="Agent Name"
          className={inputClass}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-[11px] text-text-secondary">description</span>
        <textarea
          value={value.description}
          onChange={(e) => patch({ description: e.target.value })}
          disabled={disabled}
          rows={3}
          placeholder="Briefly describe responsibilities and boundaries"
          className={cn(inputClass, 'resize-none')}
        />
      </label>

      <div className="flex gap-3">
        <label className="flex-1 min-w-0 space-y-1">
          <span className="text-[11px] text-text-secondary">nickname</span>
          <input
            type="text"
            value={value.nickname}
            onChange={(e) => patch({ nickname: e.target.value })}
            disabled={disabled}
            className={inputClass}
          />
        </label>
        <label className="flex-1 min-w-0 space-y-1">
          <span className="text-[11px] text-text-secondary">animal</span>
          <input
            type="text"
            value={value.animal}
            onChange={(e) => patch({ animal: e.target.value })}
            disabled={disabled}
            placeholder={t('tools.iconPlaceholder')}
            className={inputClass}
          />
        </label>
      </div>

      <div className="block w-full space-y-2">
        <span id="identity-form-provider-label" className="text-[11px] text-text-secondary">
          provider
        </span>
        <RadioGroup
          value={providerChoice}
          onValueChange={(v: string) => patch({ provider: v })}
          disabled={disabled}
          aria-labelledby="identity-form-provider-label"
          className="flex flex-row flex-nowrap items-center gap-8 rounded-lg border border-border bg-bg-input px-3 py-2.5 shadow-sm"
        >
          <div className="flex shrink-0 items-center gap-2.5">
            <RadioGroupItem value="claude" id="identity-form-provider-claude" />
            <label
              htmlFor="identity-form-provider-claude"
              className={cn(
                'cursor-pointer whitespace-nowrap text-xs text-text-primary',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              Claude Code
            </label>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <RadioGroupItem value="codex" id="identity-form-provider-codex" />
            <label
              htmlFor="identity-form-provider-codex"
              className={cn(
                'cursor-pointer whitespace-nowrap text-xs text-text-primary',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              Codex
            </label>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <RadioGroupItem value="qoder" id="identity-form-provider-qoder" />
            <label
              htmlFor="identity-form-provider-qoder"
              className={cn(
                'cursor-pointer whitespace-nowrap text-xs text-text-primary',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              Qoder
            </label>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            <RadioGroupItem value="qodercli" id="identity-form-provider-qodercli" />
            <label
              htmlFor="identity-form-provider-qodercli"
              className={cn(
                'cursor-pointer whitespace-nowrap text-xs text-text-primary',
                disabled && 'cursor-not-allowed opacity-60',
              )}
            >
              Qoder CLI
            </label>
          </div>
        </RadioGroup>
      </div>

      <div className="block space-y-1">
        <span className="text-[11px] text-text-secondary">allowedTools</span>
        <IdentityToolsMultiSelectPopover
          variant="allowed"
          allowedTools={value.allowedTools}
          disallowedTools={value.disallowedTools}
          disabled={disabled}
          onPatch={(next) => patch(next)}
        />
        <p className="text-[10px] leading-relaxed text-text-muted">
          {t('tools.allowedToolsHint')}
        </p>
      </div>

      <div className="block space-y-1">
        <span className="text-[11px] text-text-secondary">disallowedTools</span>
        <IdentityToolsMultiSelectPopover
          variant="disallowed"
          allowedTools={value.allowedTools}
          disallowedTools={value.disallowedTools}
          disabled={disabled}
          onPatch={(next) => patch(next)}
        />
        <p className="text-[10px] leading-relaxed text-text-muted">
          {t('tools.disallowedToolsHint')}
        </p>
      </div>
    </div>
  )
}

export default IdentityFormPanel
