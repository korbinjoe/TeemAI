import { useState } from 'react'
import { cn } from '@/lib/utils'
import type { PipelineStageState, PipelineStageStatus } from '@/hooks/useDevPanel'
import { fmtAgo } from './helpers'

const statusDot = (status: PipelineStageStatus) => {
  switch (status) {
    case 'done': return 'bg-green-400'
    case 'active': return 'bg-yellow-400 animate-pulse'
    case 'error': return 'bg-red-400'
    case 'skipped': return 'bg-zinc-600'
    case 'pending': return 'bg-zinc-700'
  }
}

const statusLabel = (status: PipelineStageStatus) => {
  switch (status) {
    case 'done': return 'text-green-400'
    case 'active': return 'text-yellow-400'
    case 'error': return 'text-red-400'
    case 'skipped': return 'text-zinc-500'
    case 'pending': return 'text-zinc-600'
  }
}

const formatDuration = (ms: number | null) => {
  if (ms == null) return null
  if (ms < 1000) return `${ms}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`
}

const DetailKV = ({ k, v }: { k: string; v: unknown }) => {
  if (v == null || v === '') return null
  return (
    <span className="text-[10px] font-mono">
      <span className="text-zinc-600">{k}=</span>
      <span className="text-zinc-400">{String(v)}</span>
    </span>
  )
}

export const PipelineStage = ({ stage, index, isLast }: { stage: PipelineStageState; index: number; isLast: boolean }) => {
  const [expanded, setExpanded] = useState(false)
  const detail = stage.detail
  const topKVs = Object.entries(detail).filter(([, v]) => v != null && v !== '').slice(0, 3)
  const duration = formatDuration(stage.durationMs)

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-2.5 px-3 py-2 hover:bg-zinc-800/30 rounded"
      >
        <div className="flex flex-col items-center shrink-0 mt-0.5">
          <div className={cn('w-2.5 h-2.5 rounded-full', statusDot(stage.status))} />
          {!isLast && <div className="w-px flex-1 min-h-[16px] bg-zinc-800 mt-1" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-600 font-mono shrink-0">
              {String.fromCharCode(9312 + index)}
            </span>
            <span className="text-xs font-medium text-zinc-200">{stage.label}</span>
            <span className={cn('text-[10px] font-medium', statusLabel(stage.status))}>
              {stage.status}
            </span>
            {duration && (
              <span className="text-[10px] text-zinc-500 font-mono ml-auto">{duration}</span>
            )}
            {!duration && stage.startedAt && stage.status === 'active' && (
              <span className="text-[10px] text-zinc-600 font-mono ml-auto">{fmtAgo(stage.startedAt)}</span>
            )}
          </div>
          {topKVs.length > 0 && (
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {topKVs.map(([k, v]) => <DetailKV key={k} k={k} v={v} />)}
            </div>
          )}
        </div>
        {Object.keys(detail).length > 3 && (
          <span className="text-zinc-600 text-[10px] shrink-0">{expanded ? '▼' : '▶'}</span>
        )}
      </button>
      {expanded && Object.keys(detail).length > 0 && (
        <div className="ml-8 mr-3 mb-1 bg-zinc-900/50 rounded px-2 py-1.5 space-y-0.5">
          {Object.entries(detail).map(([k, v]) => (
            v != null && <div key={k} className="flex items-center gap-2">
              <DetailKV k={k} v={v} />
            </div>
          ))}
          {stage.startedAt && <DetailKV k="startedAt" v={new Date(stage.startedAt).toLocaleTimeString('zh-CN', { hour12: false })} />}
          {stage.endedAt && <DetailKV k="endedAt" v={new Date(stage.endedAt).toLocaleTimeString('zh-CN', { hour12: false })} />}
        </div>
      )}
    </div>
  )
}
