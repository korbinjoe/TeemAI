/**
 * AgentNode — React Flow  Agent
 *  Agent  handle
 */

import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import AgentAvatar from '@/components/ui/agent-avatar'

interface AgentNodeData {
  agentName: string
  icon: string
  config?: Record<string, unknown>
  [key: string]: unknown
}

const AgentNode = memo(({ data, selected }: NodeProps) => {
  const nodeData = data as unknown as AgentNodeData
  const { agentName, config } = nodeData

  return (
    <div
      className={cn(
        'px-4 py-3 rounded-lg border-2 min-w-[140px] transition-all',
        'bg-bg-secondary shadow-md',
        selected
          ? 'border-accent-brand shadow-accent-brand/20'
          : 'border-border hover:border-border-emphasis',
      )}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-bg-primary !border-2 !border-accent-brand !-top-1.5"
      />

      <div className="flex items-center gap-2">
        <AgentAvatar name={agentName} agentId={agentName} size="sm" />
        <div>
          <div className="text-xs font-medium text-text-emphasis leading-tight">
            {agentName}
          </div>
        </div>
      </div>

      {/* Config hints */}
      {config?.trigger ? (
        <div className="mt-2 pt-2 border-t border-border-subtle">
          <div className="text-xs text-text-secondary truncate max-w-[120px]">
            {String(config.trigger)}
          </div>
        </div>
      ) : null}

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-bg-primary !border-2 !border-accent-green !-bottom-1.5"
      />
    </div>
  )
})

AgentNode.displayName = 'AgentNode'

export default AgentNode
