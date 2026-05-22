/**
 * ModeSelector —
 * Hierarchical / Pipeline / Swarm / Custom
 */

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { CollaborationMode } from '../../types/team'

interface ModeSelectorProps {
  mode: CollaborationMode
  onModeChange: (mode: CollaborationMode) => void
}

const MODE_VALUES: CollaborationMode[] = ['hierarchical', 'pipeline', 'swarm', 'custom']

const ModeSelector = ({ mode, onModeChange }: ModeSelectorProps) => {
  const { t } = useTranslation('agents')

  return (
    <div className="-webkit-app-region-no-drag flex gap-0.5 ml-2">
      {MODE_VALUES.map((value) => (
        <button
          key={value}
          onClick={() => onModeChange(value)}
          title={t(`team.mode.${value}Desc`)}
          aria-label={`${t(`team.mode.${value}`)}: ${t(`team.mode.${value}Desc`)}`}
          tabIndex={0}
          className={cn(
            'px-2 py-[3px] rounded-sm border-none text-xs cursor-pointer transition-all',
            mode === value
              ? 'bg-accent-brand/15 text-accent-brand font-medium'
              : 'bg-transparent text-text-secondary font-normal hover:text-text-primary',
          )}
        >
          {t(`team.mode.${value}`)}
        </button>
      ))}
    </div>
  )
}

export default ModeSelector
