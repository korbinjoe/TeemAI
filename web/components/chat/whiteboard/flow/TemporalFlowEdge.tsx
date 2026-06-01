import { memo } from 'react'
import { BezierEdge, type EdgeProps } from '@xyflow/react'

export interface TemporalFlowEdgeData {
  isHighlighted?: boolean
  isCritical?: boolean
  [key: string]: unknown
}

const TemporalFlowEdgeInner = (props: EdgeProps) => {
  const { isHighlighted } = (props.data ?? {}) as TemporalFlowEdgeData

  const sw = isHighlighted ? 2 : 1
  const op = isHighlighted ? 0.45 : 0.18

  return (
    <BezierEdge
      {...props}
      style={{
        stroke: 'rgb(var(--text-muted))',
        strokeWidth: sw,
        opacity: op,
        transition: 'stroke-width 150ms, opacity 150ms',
      }}
    />
  )
}

export const TemporalFlowEdge = memo(TemporalFlowEdgeInner)
