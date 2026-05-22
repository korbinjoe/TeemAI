import { useWorkspace } from '../../contexts/WorkspaceContext'
import { Square } from './icons'

interface GroupChatInputProps {
  agents: { id: string; agent: string }[]
}

const GroupChatInput = ({ agents }: GroupChatInputProps) => {
  const { taskChatTargetIndex, cycleTargetAgent } = useWorkspace()
  const targetAgent = agents[taskChatTargetIndex] || agents[0]

  return (
    <div className="px-3 py-2 border-t border-border-subtle flex items-center gap-1.5 flex-shrink-0">
      <div className="flex-1 flex items-center gap-1.5 px-3 py-2 rounded-[7px] border border-border bg-bg-tertiary">
        <button
          className="text-[11px] text-accent-brand-light font-semibold cursor-pointer px-1.5 py-px rounded-[3px] bg-accent-brand/[0.08] whitespace-nowrap"
          onClick={() => cycleTargetAgent(agents.length)}
          title="Click to switch target agent"
        >
          @{targetAgent?.agent}
        </button>
        <input
          className="flex-1 bg-transparent border-none outline-none text-xs text-text-primary font-sans placeholder:text-text-muted"
          placeholder={`Message ${targetAgent?.agent}...`}
        />
        <span className="font-mono text-[9px] text-text-muted">↵</span>
      </div>
      <button
        className="w-7 h-7 rounded-md border border-accent-red/20 bg-accent-red/[0.06] flex items-center justify-center cursor-pointer"
        title="Stop"
      >
        <Square size={9} className="text-accent-red" />
      </button>
    </div>
  )
}

export default GroupChatInput
