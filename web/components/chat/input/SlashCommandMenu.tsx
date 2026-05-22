import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { CommandDef } from '@/lib/commandRegistry'

interface Props {
  commands: CommandDef[]
  selectedIndex: number
  onSelect: (cmd: CommandDef) => void
}

const TOOL_COLORS: Record<string, string> = {
  claude: 'text-orange-400/70',
  cursor: 'text-blue-400/70',
  aider: 'text-green-400/70',
  windsurf: 'text-teal-400/70',
  codex: 'text-purple-400/70',
}

const SlashCommandMenu = ({ commands, selectedIndex, onSelect }: Props) => {
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current?.children[selectedIndex + 1] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (commands.length === 0) return null

  return (
    <div
      ref={listRef}
      className="absolute bottom-full left-0 right-0 mb-1 bg-bg-elevated border border-border rounded-md shadow-lg max-h-[240px] overflow-y-auto z-50"
    >
      <div className="px-3 py-1.5 text-xs font-semibold tracking-wide text-text-secondary border-b border-border-subtle">
        COMMANDS
      </div>
      {commands.map((cmd, i) => (
        <div
          key={`${cmd.tool}:${cmd.name}`}
          onMouseDown={(e) => { e.preventDefault(); onSelect(cmd) }}
          className={cn(
            'flex items-center gap-2.5 px-3 py-[7px] cursor-pointer transition-colors',
            i === selectedIndex ? 'bg-accent-brand/[0.08]' : 'bg-transparent',
          )}
        >
          <span className={cn(
            'text-xs font-mono font-medium',
            i === selectedIndex ? 'text-accent-brand' : 'text-text-primary',
          )}>
            /{cmd.name}
          </span>
          {cmd.description && (
            <span className="text-xs text-text-secondary truncate">
              {cmd.description}
            </span>
          )}
          <span className={cn(
            'text-[10px] ml-auto shrink-0 font-medium',
            TOOL_COLORS[cmd.tool] || 'text-text-muted',
          )}>
            {cmd.toolLabel}
          </span>
        </div>
      ))}
    </div>
  )
}

export default SlashCommandMenu
