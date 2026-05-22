import { cn } from '@/lib/utils'
import AgentExamplesPanel from '@/components/agent/AgentExamplesPanel'

export type AgentMarkdownSplitEditorProps = {
  tab: 'AGENTS.md' | 'SOUL.md'
  value: string
  onChange: (next: string) => void
  disabled?: boolean
}

const EXAMPLE_PANE_WIDTH_PX = 500

/**
 * AGENTS.md / SOUL.mdflex +
 */
const AgentMarkdownSplitEditor = ({
  tab,
  value,
  onChange,
  disabled = false,
}: AgentMarkdownSplitEditorProps) => {
  const textareaClass = cn(
    'min-h-0 flex-1 w-full resize-none bg-bg-primary px-5 py-4 text-xs text-text-primary',
    'placeholder:text-text-muted focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed leading-relaxed',
  )
  const textareaStyle = {
    fontFamily: "'SF Mono', 'Consolas', 'Monaco', monospace",
    fontSize: 12,
    tabSize: 2,
  } as const

  if (disabled) {
    return (
      <div className="flex flex-1 min-h-0 w-full min-w-0 flex-col">
        <textarea
          key={tab}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled
          spellCheck={false}
          className={textareaClass}
          style={textareaStyle}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-1 min-h-0 w-full min-w-0 flex-row overflow-x-hidden">
      <div className="flex min-h-0 min-w-[200px] flex-1 flex-col">
        <textarea
          key={tab}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className={textareaClass}
          style={textareaStyle}
        />
      </div>
      <div
        style={{ width: EXAMPLE_PANE_WIDTH_PX }}
        className="flex min-h-0 min-w-0 shrink-0 flex-col overflow-x-hidden border-l border-border-subtle"
      >
        <AgentExamplesPanel tab={tab} onApply={onChange} />
      </div>
    </div>
  )
}

export default AgentMarkdownSplitEditor
