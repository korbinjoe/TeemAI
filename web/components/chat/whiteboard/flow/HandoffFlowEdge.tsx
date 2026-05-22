import { memo } from 'react'
import { BezierEdge, type EdgeProps } from '@xyflow/react'

export interface HandoffFlowEdgeData {
  isHighlighted?: boolean
  isCritical?: boolean
  [key: string]: unknown
}

const HandoffFlowEdgeInner = (props: EdgeProps) => {
  const { isHighlighted, isCritical } = (props.data ?? {}) as HandoffFlowEdgeData

  const critical = isCritical && !isHighlighted
  const strokeColor = critical
    ? 'rgb(var(--accent-brand))'
    : 'rgb(14 165 233)' // sky-500
  const sw = isHighlighted ? 2.5 : critical ? 2 : 1.5
  const op = isHighlighted || critical ? 1 : 0.6

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

export const HandoffFlowEdge = memo(HandoffFlowEdgeInner)
