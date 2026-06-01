import { useEffect, useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '@/i18n'
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  type Node,
  type Edge,
  type ReactFlowInstance,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import {
  X, Archive, Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  layoutWhiteboardDag,
  layoutWorkflowDag,
  type DagNode,
} from '@/lib/whiteboardLayout'
import { useAgents } from '@/hooks/useAgents'
import AgentAvatar from '@/components/ui/agent-avatar'
import type { WhiteboardEntry, WhiteboardEntryType, WorkflowTaskNode } from '@shared/whiteboard-types'
import type { WorkflowTaskNodeData } from './WorkflowTaskNode'

import { SpanNode, type SpanNodeData } from './SpanNode'
import { WorkflowTaskNodeComponent } from './WorkflowTaskNode'
import { HandoffFlowEdge } from './HandoffFlowEdge'
import { RefFlowEdge } from './RefFlowEdge'
import { CausalFlowEdge } from './CausalFlowEdge'
import { TemporalFlowEdge } from './TemporalFlowEdge'
import { InferredFlowEdge } from './InferredFlowEdge'
import { TypeChip } from './TypeChip'

const TYPE_EDGE_COLOR: Record<string, string> = {
  goal: 'rgb(var(--accent-brand))',
  decision: 'rgb(16 185 129)',
  artifact: 'rgb(139 92 246)',
  progress: 'rgb(var(--text-muted))',
  open_question: 'rgb(245 158 11)',
  constraint: 'rgb(244 63 94)',
  handoff: 'rgb(14 165 233)',
}

// ============================================================
// Props
// ============================================================

export interface WhiteboardFlowViewProps {
  entries: WhiteboardEntry[]
  goal: WhiteboardEntry | null
  archivingId: string | null
  onArchive: (entryId: string) => void
  className?: string
  workflowTasks?: WorkflowTaskNode[]
}

// ============================================================
// nodeTypes / edgeTypes
// ============================================================

const nodeTypes = { span: SpanNode, workflowTask: WorkflowTaskNodeComponent } as const
const edgeTypes = { handoff: HandoffFlowEdge, ref: RefFlowEdge, causal: CausalFlowEdge, temporal: TemporalFlowEdge, inferred: InferredFlowEdge } as const

// ============================================================
// formatters
// ============================================================

const formatRelative = (iso: string): string => {
  const ts = new Date(iso).getTime()
  if (!Number.isFinite(ts)) return ''
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000))
  if (sec < 60) return i18n.t('chat:whiteboard.timeAgo.seconds', { count: sec })
  const min = Math.floor(sec / 60)
  if (min < 60) return i18n.t('chat:whiteboard.timeAgo.minutes', { count: min })
  const hr = Math.floor(min / 60)
  if (hr < 24) return i18n.t('chat:whiteboard.timeAgo.hours', { count: hr })
  return i18n.t('chat:whiteboard.timeAgo.days', { count: Math.floor(hr / 24) })
}

// ============================================================
// ============================================================

const WhiteboardFlowViewInner = ({
  entries, goal, archivingId, onArchive, className, workflowTasks,
}: WhiteboardFlowViewProps) => {
  const { t } = useTranslation('chat')
  const [nowBucket, setNowBucket] = useState(() => Math.floor(Date.now() / 30_000))
  useEffect(() => {
    const timer = window.setInterval(() => setNowBucket(Math.floor(Date.now() / 30_000)), 5_000)
    return () => window.clearInterval(timer)
  }, [])

  const layout = useMemo(() => {
    if (workflowTasks && workflowTasks.length > 0) {
      const entriesWithTaskId = entries.filter((e) => e.taskId)
      const floatingEntries = entries.filter((e) => !e.taskId)
      return layoutWorkflowDag(workflowTasks, entriesWithTaskId, floatingEntries, goal)
    }
    return layoutWhiteboardDag(entries, goal, nowBucket * 30_000)
  }, [entries, goal, nowBucket, workflowTasks])

  // type filter
  const [hiddenTypes] = useState<Set<WhiteboardEntryType>>(new Set())

  // selection / hover
  const [selectedNode, setSelectedNode] = useState<DagNode | null>(null)
  const [detailNode, setDetailNode] = useState<DagNode | null>(null)
  const [hoveredNode, setHoveredNode] = useState<DagNode | null>(null)

  const handleNodeHover = useCallback((node: DagNode, _rect: DOMRect) => {
    setHoveredNode(node)
  }, [])
  const handleNodeLeave = useCallback(() => setHoveredNode(null), [])
  const handleNodeClick = useCallback((node: DagNode) => {
    setSelectedNode(node)
    setDetailNode(node)
  }, [])

  const highlightedIds = useMemo(() => {
    const anchor = hoveredNode ?? selectedNode
    if (!anchor) return new Set<string>()
    const set = new Set<string>([anchor.id])
    for (const refId of anchor.entry.refs?.entries ?? []) set.add(refId)
    for (const n of layout.nodes) {
      if (n.entry.refs?.entries?.includes(anchor.id)) set.add(n.id)
    }
    for (const e of layout.edges) {
      if (e.type !== 'temporal') continue
      if (e.source === anchor.id) set.add(e.target)
      if (e.target === anchor.id) set.add(e.source)
    }
    return set
  }, [hoveredNode, selectedNode, layout.nodes, layout.edges])

  // ESC
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        if (detailNode) { setDetailNode(null); return }
        if (selectedNode) { setSelectedNode(null); return }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [detailNode, selectedNode])

  const visibleNodes = useMemo(() => {
    return layout.nodes.filter((n) => !hiddenTypes.has(n.type))
  }, [layout.nodes, hiddenTypes])

  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes])

  const workflowTaskMap = useMemo(() => {
    if (!workflowTasks) return new Map<string, WorkflowTaskNode>()
    return new Map(workflowTasks.map((t) => [`wf-${t.taskId}`, t]))
  }, [workflowTasks])

  const flowNodes = useMemo<Node[]>(() => {
    return visibleNodes.map((n) => {
      const isHighlighted = highlightedIds.has(n.id)
      const isSelected = selectedNode?.id === n.id
      const isDimmed = (Boolean(hoveredNode) || Boolean(selectedNode)) &&
        !isHighlighted && !isSelected

      const wfTask = workflowTaskMap.get(n.id)
      if (wfTask) {
        return {
          id: n.id,
          type: 'workflowTask',
          position: { x: n.x, y: n.y },
          data: {
            node: n,
            taskId: wfTask.taskId,
            agentId: wfTask.agentId,
            status: wfTask.status,
            description: wfTask.description,
            entryCount: wfTask.entryCount,
            entrySummary: wfTask.entrySummary,
            isExpanded: wfTask.status === 'running',
            onHover: handleNodeHover,
            onLeave: handleNodeLeave,
            onClick: handleNodeClick,
          } satisfies WorkflowTaskNodeData,
          style: { width: n.width },
          draggable: false,
          selectable: false,
          connectable: false,
          deletable: false,
        }
      }

      return {
        id: n.id,
        type: 'span',
        position: { x: n.x, y: n.y },
        data: {
          node: n,
          isHighlighted: isHighlighted || isSelected,
          isDimmed,
          isSelected,
          onHover: handleNodeHover,
          onLeave: handleNodeLeave,
          onClick: handleNodeClick,
        } satisfies SpanNodeData,
        style: { width: n.width },
        draggable: false,
        selectable: false,
        connectable: false,
        deletable: false,
      }
    })
  }, [visibleNodes, highlightedIds, selectedNode, hoveredNode, handleNodeHover, handleNodeLeave, handleNodeClick, workflowTaskMap])

  const flowEdges: Edge[] = useMemo(() => {
    const connectedPairs = new Set<string>()
    for (const e of layout.edges) {
      if (e.type === 'causal' || e.type === 'ref' || e.type === 'handoff' || e.type === 'inferred') {
        connectedPairs.add(`${e.source}::${e.target}`)
      }
    }

    const sourceNodeMap = new Map(layout.nodes.map((n) => [n.id, n]))

    return layout.edges
      .filter((e) => {
        if (!visibleIds.has(e.source) || !visibleIds.has(e.target)) return false
        if (e.type === 'temporal' && connectedPairs.has(`${e.source}::${e.target}`)) return false
        return true
      })
      .map((e) => {
        const isHandoff = e.type === 'handoff'
        const isTemporal = e.type === 'temporal'
        const isCausal = e.type === 'causal'
        const isInferred = e.type === 'inferred'
        const sourceNode = sourceNodeMap.get(e.source)
        const sourceColor = isCausal && sourceNode
          ? TYPE_EDGE_COLOR[sourceNode.type] ?? 'rgb(16 185 129)'
          : undefined
        const markerColor = e.isCritical
          ? 'rgb(var(--accent-brand))'
          : isHandoff
            ? 'rgb(14 165 233)'
            : isCausal
              ? (sourceColor ?? 'rgb(16 185 129)')
              : isInferred
                ? 'rgb(168 85 247)'
                : isTemporal
                  ? 'rgb(var(--text-muted))'
                  : 'rgb(var(--accent-brand-light))'
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: 'right-out',
          targetHandle: 'left-in',
          type: e.type,
          data: {
            isHighlighted: highlightedIds.has(e.source) || highlightedIds.has(e.target),
            isCritical: e.isCritical,
            sourceColor,
          },
          markerEnd: isTemporal ? undefined : {
            type: MarkerType.ArrowClosed,
            color: markerColor,
            width: 12,
            height: 12,
          },
          animated: e.isCritical && !isTemporal && !isInferred,
        }
      })
  }, [layout.edges, layout.nodes, visibleIds, highlightedIds])

  // ReactFlow instance ref for fitView
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance<Node, Edge> | null>(null)
  const handleInit = useCallback((instance: ReactFlowInstance<Node, Edge>) => {
    setRfInstance(instance)
    setTimeout(() => {
      instance.fitView({ padding: 0.15, duration: 300 })
    }, 50)
  }, [])

  // fitView on layout change
  useEffect(() => {
    if (rfInstance && layout.nodes.length > 0) {
      setTimeout(() => {
        rfInstance.fitView({ padding: 0.15, duration: 300 })
      }, 50)
    }
  }, [rfInstance, layout.nodes.length])

  if (layout.nodes.length === 0) {
    return (
      <div className={cn('h-full flex flex-col items-center justify-center text-center px-6 gap-2', className)}>
        <div className="text-xs text-text-muted">{t('whiteboard.emptyState')}</div>
      </div>
    )
  }

  return (
    <div className={cn('h-full flex flex-col bg-bg-primary', className)}>
      <div className="flex-1 min-h-0 mx-3 my-2 rounded-md border border-border-subtle bg-bg-secondary relative whiteboard-dag">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onInit={handleInit}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          minZoom={0.2}
          maxZoom={2}
          nodesDraggable={false}
          nodesConnectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          elementsSelectable={false}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            style: { strokeWidth: 1.5 },
          }}
        >
          <MiniMap
            position="bottom-right"
            className="!bg-bg-tertiary !border-border-subtle !rounded-md !shadow-sm"
            maskColor="rgba(var(--bg-primary), 0.7)"
            nodeStrokeWidth={0}
            nodeColor={(n) => {
              const d = n.data as SpanNodeData | undefined
              if (!d?.node) return 'rgb(var(--border))'
              const type = d.node.type
              const colors: Record<string, string> = {
                goal: 'rgb(var(--accent-brand))',
                decision: 'rgb(16 185 129)',
                artifact: 'rgb(139 92 246)',
                progress: 'rgb(var(--text-muted))',
                open_question: 'rgb(245 158 11)',
                constraint: 'rgb(244 63 94)',
                handoff: 'rgb(14 165 233)',
              }
              return colors[type] ?? 'rgb(var(--border))'
            }}
            style={{ width: 140, height: 80 }}
          />
        </ReactFlow>
      </div>

      {detailNode && (
        <NodeDetailDrawer
          node={detailNode}
          onClose={() => setDetailNode(null)}
          onArchive={() => onArchive(detailNode.entry.id)}
          archiving={archivingId === detailNode.entry.id}
          onRefJump={(refId) => {
            const target = layout.nodes.find((n) => n.id === refId)
            if (target) {
              setSelectedNode(target)
              setDetailNode(target)
              if (rfInstance) {
                rfInstance.setCenter(target.x + target.width / 2, target.y + target.height / 2, {
                  zoom: 1,
                  duration: 300,
                })
              }
            }
          }}
          allNodes={layout.nodes}
        />
      )}
    </div>
  )
}

// ============================================================
// Detail Drawer
// ============================================================

interface DrawerProps {
  node: DagNode
  onClose: () => void
  onArchive: () => void
  archiving: boolean
  onRefJump: (refId: string) => void
  allNodes: DagNode[]
}

const NodeDetailDrawer = ({ node, onClose, onArchive, archiving, onRefJump, allNodes }: DrawerProps) => {
  const { t } = useTranslation('chat')
  const nodeById = useMemo(() => new Map(allNodes.map((n) => [n.id, n])), [allNodes])
  const { agentNames } = useAgents()
  const displayName = agentNames[node.agent] ?? node.agent

  return (
    <>
      <div className="absolute inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-80 z-40 bg-bg-elevated border-l border-border shadow-2xl flex flex-col motion-safe:animate-[slideIn_250ms_ease-out]">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border-subtle">
          <TypeChip type={node.type} variant="soft" size="lg" />
          <button
            onClick={onClose}
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        <div className="px-4 py-3 flex-1 min-h-0 overflow-auto space-y-3">
          <div className="text-sm text-text-primary leading-snug break-words">{node.entry.summary}</div>
          <div className="grid grid-cols-[60px_1fr] gap-y-1.5 gap-x-3 text-[11px]">
            <span className="text-text-muted">by</span>
            <div className="flex items-center gap-1.5">
              <AgentAvatar name={displayName} agentId={node.agent} size="xs" />
              <span className="font-mono text-text-secondary">{displayName}</span>
            </div>
            <span className="text-text-muted">at</span>
            <span className="font-mono text-text-secondary">{formatRelative(node.entry.timestamp)}</span>
            {node.entry.tags?.length ? (
              <>
                <span className="text-text-muted">tags</span>
                <span className="text-text-secondary break-words">{node.entry.tags.join(' · ')}</span>
              </>
            ) : null}
            {node.entry.refs?.files?.length ? (
              <>
                <span className="text-text-muted">files</span>
                <span className="text-text-secondary break-all font-mono text-[10px]">{node.entry.refs.files.join('\n')}</span>
              </>
            ) : null}
            {node.entry.refs?.entries?.length ? (
              <>
                <span className="text-text-muted">refs</span>
                <div className="space-y-1">
                  {node.entry.refs.entries.map((refId) => {
                    const refNode = nodeById.get(refId)
                    return (
                      <button
                        key={refId}
                        type="button"
                        onClick={() => onRefJump(refId)}
                        className="block w-full text-left px-1.5 py-1 rounded text-[10px] font-mono bg-bg-secondary hover:bg-bg-hover text-[rgb(var(--accent-brand))] hover:underline cursor-pointer transition-colors"
                        title={refNode ? refNode.entry.summary : refId}
                      >
                        <span className="text-text-muted">→ </span>
                        {refNode ? (
                          <span className="text-text-secondary">{refNode.entry.summary.slice(0, 40)}{refNode.entry.summary.length > 40 ? '…' : ''}</span>
                        ) : (
                          <span>{refId.slice(0, 12)}…</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </>
            ) : null}
          </div>
        </div>
        <div className="px-3 py-2.5 border-t border-border-subtle flex justify-end gap-2">
          <button
            onClick={onArchive}
            disabled={archiving}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] text-text-secondary hover:text-text-primary hover:bg-bg-hover disabled:opacity-50"
          >
            {archiving ? <Loader2 size={11} className="animate-spin" /> : <Archive size={11} />}
            {t('whiteboard.archive')}
          </button>
        </div>
      </div>
    </>
  )
}

// ============================================================
// FilterLegend
// ============================================================

// ============================================================
// ============================================================

const WhiteboardFlowView = (props: WhiteboardFlowViewProps) => (
  <ReactFlowProvider>
    <WhiteboardFlowViewInner {...props} />
  </ReactFlowProvider>
)

export default WhiteboardFlowView
