/**
 * WorkspaceTabGroup — Workspace
 *
 *  workspace  tab /
 *  tab
 *  app accent
 */

import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 *  app  token
 *  Tailwind CSS rgb channels rgba()
 */
export const GROUP_ACCENT_VARS = [
  'var(--accent-purple)',
  'var(--accent-green)',
  'var(--accent-orange)',
  'var(--accent-yellow)',
  'var(--accent-red)',
] as const

interface WorkspaceTabGroupProps {
  name: string
  colorIndex: number
  tabCount: number
  isCollapsed: boolean
  onToggle: () => void
}

const WorkspaceTabGroup = ({
  name, colorIndex, tabCount, isCollapsed, onToggle,
}: WorkspaceTabGroupProps) => {
  const accentVar = GROUP_ACCENT_VARS[colorIndex % GROUP_ACCENT_VARS.length]

  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        'flex items-center gap-1.5 px-2.5 h-7 text-[11px] font-medium shrink-0 select-none',
        'transition-all duration-150 rounded-t',
        'ml-1 first:ml-0',
      )}
      style={{
        WebkitAppRegion: 'no-drag',
      } as React.CSSProperties}
      title={isCollapsed ? `Expand ${name} (${tabCount})` : `Collapse ${name}`}
    >
      <span
        className="w-[3px] h-3 rounded-full shrink-0"
        style={{ background: `rgb(${accentVar})` }}
      />

      <ChevronRight
        size={10}
        className={cn(
          'transition-transform duration-150 shrink-0 text-text-muted',
          !isCollapsed && 'rotate-90',
        )}
      />
      <span className="whitespace-nowrap text-text-secondary">{name}</span>
      {isCollapsed && tabCount > 0 && (
        <span
          className="ml-0.5 min-w-[14px] h-[14px] flex items-center justify-center rounded-full text-[10px] font-bold leading-none text-text-secondary bg-text-muted/20"
        >
          {tabCount}
        </span>
      )}
    </button>
  )
}

export default WorkspaceTabGroup
