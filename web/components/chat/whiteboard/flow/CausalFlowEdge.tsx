import { memo } from 'react'
import { BezierEdge, type EdgeProps } from '@xyflow/react'

export interface CausalFlowEdgeData {
  isHighlighted?: boolean
  isCritical?: boolean
  sourceColor?: string
  [key: string]: unknown
}

const CausalFlowEdgeInner = (props: EdgeProps) => {
  const { isHighlighted, isCritical, sourceColor } = (props.data ?? {}) as CausalFlowEdgeData

  const critical = isCritical && !isHighlighted
  const strokeColor = sourceColor ?? (critical
    ? 'rgb(var(--accent-brand))'
    : 'rgb(16 185 129)')
  const sw = isHighlighted ? 2.5 : critical ? 2 : 1.75
  const op = isHighlighted ? 1 : critical ? 0.85 : 0.7

  return (
    <BezierEdge
      {...props}
      style={{
        stroke: strokeColor,
        strokeWidth: sw,
        opacity: op,
        transition: 'stroke-width 150ms, opacity 150ms',
      }}
    />
  )
}

export const CausalFlowEdge = memo(CausalFlowEdgeInner)
