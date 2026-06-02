import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { cn } from '@/lib/utils'
import type { DagNode } from '@/lib/whiteboardLayout'
import type { WhiteboardEntryType } from '@shared/whiteboard-types'

const HANDLE_STYLE: React.CSSProperties = {
  opacity: 0,
  pointerEvents: 'none',
  width: 1,
  height: 1,
  border: 0,
  background: 'transparent',
}

const STATUS_DOT: Record<string, string> = {
  completed: 'bg-accent-green/40',
  running: 'bg-accent-running relative before:absolute before:inset-0 before:rounded-full before:bg-accent-running before:animate-ping-soft',
  failed: 'bg-accent-red',
  pending: 'bg-text-muted opacity-40',
  skipped: 'bg-text-muted opacity-30',
}

const STATUS_BADGE: Record<string, string> = {
  completed: 'text-accent-green/60 bg-accent-green/[0.06]',
  running: 'text-accent-running bg-accent-running/[0.08]',
  failed: 'text-accent-red bg-accent-red/[0.08]',
  pending: 'text-text-muted bg-white/[0.025]',
}

const ENTRY_TYPE_COLOR: Partial<Record<WhiteboardEntryType, string>> = {
  decision: 'text-accent-green',
  artifact: 'text-accent-purple',
  open_question: 'text-accent-yellow',
  progress: 'text-text-secondary',
  constraint: 'text-accent-red',
}

export interface WorkflowTaskNodeData {
  node: DagNode
  taskId: string
  agentId: string
  status: string
  description: string
  entryCount: number
  entrySummary: Record<string, number>
  onHover: (node: DagNode, rect: DOMRect) => void
  onLeave: () => void
  onClick: (node: DagNode) => void
  [key: string]: unknown
}

const WorkflowTaskNodeInner = ({ data }: NodeProps) => {
  const d = data as WorkflowTaskNodeData
  const dotCls = STATUS_DOT[d.status] ?? STATUS_DOT.pending
  const badgeCls = STATUS_BADGE[d.status] ?? STATUS_BADGE.pending

  const handleMouseEnter = (ev: React.MouseEvent<HTMLDivElement>) => {
    d.onHover(d.node, ev.currentTarget.getBoundingClientRect())
  }

  const summaryChips = Object.entries(d.entrySummary)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => ({ type: type as WhiteboardEntryType, count }))

  return (
    <div
      role="button"
      tabIndex={0}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={d.onLeave}
      onClick={() => d.onClick(d.node)}
      onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); d.onClick(d.node) } }}
      className={cn(
        'rounded-lg bg-bg-elevated border border-border-subtle cursor-pointer',
        'transition-all duration-150 hover:border-border hover:shadow-md hover:-translate-y-px',
        d.status === 'running' && 'border-accent-running/20',
        d.status === 'pending' && 'opacity-40 hover:opacity-55',
      )}
      style={{ width: d.node.width, minHeight: d.node.height }}
    >
      <Handle type="target" position={Position.Left} id="left-in" style={{ ...HANDLE_STYLE, left: 0 }} />
      <Handle type="source" position={Position.Right} id="right-out" style={{ ...HANDLE_STYLE, right: 0 }} />

      <div className="flex items-center gap-2 px-3 py-2.5">
        <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', dotCls)} />
        <div className="flex-1 min-w-0">
          <div className="text-[11.5px] font-semibold text-text-primary truncate">{d.taskId}</div>
          <div className="font-mono text-[9px] text-text-muted mt-0.5">{d.agentId}</div>
        </div>
        <span className={cn('text-[9px] font-medium lowercase px-1.5 py-px rounded-[3px] shrink-0', badgeCls)}>
          {d.status}
        </span>
      </div>

      {summaryChips.length > 0 && (
        <div className="flex items-center gap-1 px-3 pb-2 font-mono text-[9px] text-text-muted">
          {summaryChips.map(({ type, count }, i) => (
            <span key={type}>
              {i > 0 && <span className="mx-0.5">·</span>}
              <span className={ENTRY_TYPE_COLOR[type] ?? 'text-text-muted'}>{count} {type.replace('_', ' ')}</span>
            </span>
          ))}
        </div>
      )}

      {d.status === 'pending' && d.entryCount === 0 && (
        <div className="px-3 pb-2.5 text-[10px] text-text-muted italic">
          Waiting for dependencies
        </div>
      )}
    </div>
  )
}

export const WorkflowTaskNodeComponent = memo(WorkflowTaskNodeInner)
