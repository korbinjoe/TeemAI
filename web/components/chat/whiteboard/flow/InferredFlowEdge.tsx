import { memo } from 'react'
import { BezierEdge, type EdgeProps } from '@xyflow/react'

export interface InferredFlowEdgeData {
  isHighlighted?: boolean
  isCritical?: boolean
  [key: string]: unknown
}

const InferredFlowEdgeInner = (props: EdgeProps) => {
  const { isHighlighted, isCritical } = (props.data ?? {}) as InferredFlowEdgeData

  const sw = isHighlighted ? 2 : isCritical ? 1.5 : 1.25
  const op = isHighlighted ? 0.8 : isCritical ? 0.6 : 0.4

  return (
    <BezierEdge
      {...props}
      style={{
        stroke: 'rgb(168 85 247)',
        strokeWidth: sw,
        strokeDasharray: '6 4',
        opacity: op,
        transition: 'stroke-width 150ms, opacity 150ms',
      }}
    />
  )
}

export const InferredFlowEdge = memo(InferredFlowEdgeInner)
