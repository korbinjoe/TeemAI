import { memo } from 'react'
import { BezierEdge, type EdgeProps } from '@xyflow/react'

export interface RefFlowEdgeData {
  isHighlighted?: boolean
  isCritical?: boolean
  [key: string]: unknown
}

const RefFlowEdgeInner = (props: EdgeProps) => {
  const { isHighlighted, isCritical } = (props.data ?? {}) as RefFlowEdgeData

  const critical = isCritical && !isHighlighted
  const strokeColor = critical
    ? 'rgb(var(--accent-brand))'
    : 'rgb(var(--accent-brand-light))'
  const sw = isHighlighted ? 2 : critical ? 1.75 : 1.25
  const op = isHighlighted ? 0.9 : critical ? 0.8 : 0.45

  return (
    <BezierEdge
      {...props}
      style={{
        stroke: strokeColor,
        strokeWidth: sw,
        strokeDasharray: '6 4',
        opacity: op,
        transition: 'stroke-width 150ms, opacity 150ms',
      }}
    />
  )
}

export const RefFlowEdge = memo(RefFlowEdgeInner)
