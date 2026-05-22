import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, X } from 'lucide-react'
import {
  IDENTITY_TOOL_CATEGORIES,
  applyToolAllowedRow,
  applyToolDisallowedRow,
  getIdentityExtraTools,
  getIdentityToolTooltip,
} from '@/config/identityToolOptions'
import type { IdentityToolCategoryDef } from '@/config/identityToolOptions'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type IdentityToolsMultiSelectPopoverProps = {
  /** alloweddisallowed */
  variant: 'allowed' | 'disallowed'
  allowedTools: string[]
  disallowedTools: string[]
  disabled?: boolean
  onPatch: (next: { allowedTools: string[]; disallowedTools: string[] }) => void
}

/**
 * allowedTools / disallowedTools {@link PopoverTrigger} Radix  click chip  ×
 *  variant  allowed  disallowed
 */
const IdentityToolsMultiSelectPopover = ({
  variant,
  allowedTools,
  disallowedTools,
  disabled = false,
  onPatch,
}: IdentityToolsMultiSelectPopoverProps) => {
  const { t } = useTranslation('agents')
  const [open, setOpen] = useState(false)

  const extras = useMemo(
    () => getIdentityExtraTools(allowedTools, disallowedTools),
    [allowedTools, disallowedTools],
  )

  const categoriesWithExtras: IdentityToolCategoryDef[] = useMemo(() => {
    if (extras.length === 0) return [...IDENTITY_TOOL_CATEGORIES]
    return [
      ...IDENTITY_TOOL_CATEGORIES,
      { id: 'other', title: t('tools.otherCustom'), tools: extras },
    ]
  }, [extras])

  const selectedTools = variant === 'allowed' ? allowedTools : disallowedTools

  const isChecked = (tool: string) =>
    variant === 'allowed' ? allowedTools.includes(tool) : disallowedTools.includes(tool)

  const handleToggle = (tool: string, nextChecked: boolean) => {
    onPatch(
      variant === 'allowed'
        ? applyToolAllowedRow(tool, nextChecked, allowedTools, disallowedTools)
        : applyToolDisallowedRow(tool, nextChecked, allowedTools, disallowedTools),
    )
  }

  const emptyPlaceholder = t('tools.placeholder')

  const listAriaLabel =
    selectedTools.length === 0
      ? emptyPlaceholder
      : t('tools.selectedCount', { count: selectedTools.length, tools: selectedTools.join(', ') })

  const handleRemoveChip = (tool: string) => {
    if (disabled) return
    handleToggle(tool, false)
  }

  /**
   *  variantallowed / disallowed true
   */
  const handleSelectCategoryAll = useCallback(
    (cat: IdentityToolCategoryDef) => {
      if (disabled) return
      let allowed = [...allowedTools]
      let disallowed = [...disallowedTools]
      for (const tool of cat.tools) {
        const patch =
          variant === 'allowed'
            ? applyToolAllowedRow(tool, true, allowed, disallowed)
            : applyToolDisallowedRow(tool, true, allowed, disallowed)
        allowed = patch.allowedTools
        disallowed = patch.disallowedTools
      }
      onPatch({ allowedTools: allowed, disallowedTools: disallowed })
    },
    [allowedTools, disallowedTools, disabled, onPatch, variant],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <div
          role="group"
          aria-label={listAriaLabel}
          className={cn(
            'flex min-h-9 w-full items-center overflow-hidden rounded-lg border border-border bg-bg-input text-left text-xs text-text-primary shadow-sm',
            'outline-none focus-visible:ring-1 focus-visible:ring-accent-brand',
            !disabled && 'cursor-pointer',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          <div className="flex min-h-9 min-w-0 flex-1 flex-wrap items-center gap-1 px-3 py-1.5">
            {selectedTools.length === 0 ? (
              <span className="block w-full truncate leading-normal text-text-secondary">{emptyPlaceholder}</span>
            ) : (
              <span className="flex max-h-24 flex-wrap items-center gap-1 overflow-y-auto py-0.5">
                {selectedTools.map((tool) => (
                  <span
                    key={tool}
                    title={tool}
                    className={cn(
                      'inline-flex max-w-full shrink-0 items-center gap-0.5 rounded-[4px] border border-border-subtle',
                      'bg-bg-secondary pl-1.5 pr-0.5 font-mono text-[10px] text-text-primary',
                    )}
                  >
                    <span className="min-w-0 max-w-[8rem] truncate">{tool}</span>
                    <span
                      role="button"
                      tabIndex={disabled ? -1 : 0}
                      data-identity-tool-chip-remove
                      aria-label={`Remove ${tool}`}
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded text-text-muted',
                        'hover:bg-bg-hover-muted hover:text-text-primary',
                        'focus:outline-none focus-visible:ring-1 focus-visible:ring-accent-brand',
                        disabled && 'pointer-events-none',
                      )}
                      onClick={(e) => {
                        e.stopPropagation()
                        e.preventDefault()
                        handleRemoveChip(tool)
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (disabled) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          e.stopPropagation()
                          handleRemoveChip(tool)
                        }
                      }}
                    >
                      <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                    </span>
                  </span>
                ))}
              </span>
            )}
          </div>
          <div
            className="flex shrink-0 items-center justify-center bg-bg-input pl-1 pr-2.5"
            aria-hidden
          >
            <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        onOpenAutoFocus={(e: Event) => e.preventDefault()}
        className={cn(
          'w-[var(--radix-popover-trigger-width)] max-w-[var(--radix-popover-trigger-width)] p-0',
          'overflow-hidden',
        )}
      >
        <TooltipProvider delayDuration={300} skipDelayDuration={0}>
          <div className="max-h-[min(16rem,56vh)] overflow-y-auto py-1">
            {categoriesWithExtras.map((cat) => (
              <div key={`${variant}-${cat.id}`} className="py-0.5">
                <div className="flex items-center justify-between gap-2 px-2 py-1">
                  <span className="text-[10px] font-semibold">{cat.title}</span>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => handleSelectCategoryAll(cat)}
                    className={cn(
                      'shrink-0 text-[10px] hover:underline',
                      'disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline',
                    )}
                  >
                    Select All
                  </button>
                </div>
                <div className="flex flex-wrap gap-x-1 gap-y-1 px-2 pb-1">
                  {cat.tools.map((tool) => (
                    <Tooltip key={`${cat.id}-${tool}`}>
                      <TooltipTrigger asChild>
                        <label
                          className={cn(
                            'flex h-7 w-[5.75rem] shrink-0 cursor-pointer items-center gap-1 rounded border border-border-subtle',
                            'bg-bg-primary/50 px-1.5 text-[10px] hover:bg-bg-hover-muted',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked(tool)}
                            disabled={disabled}
                            onChange={(e) => handleToggle(tool, e.target.checked)}
                            className="h-3 w-3 shrink-0 rounded border-border accent-accent-brand"
                          />
                          <span className="min-w-0 flex-1 truncate font-mono text-text-primary">{tool}</span>
                        </label>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[min(18rem,85vw)] text-left leading-snug">
                        {getIdentityToolTooltip(tool)}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TooltipProvider>
      </PopoverContent>
    </Popover>
  )
}

export default IdentityToolsMultiSelectPopover
