/**
 * GitGraph —
 *
 *  /api/git/log  commit
 *  SVG
 *  git fetch  log
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, GitCommitHorizontal, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { API_BASE, authFetch } from '@/config/api'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'

interface LogEntry {
  hash: string
  message: string
  author: string
  date: string
  refs: string[]
  parents: string[]
}

interface GitGraphProps {
  repoPath: string
  className?: string
  refreshKey?: number
}

const COLORS = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#bc8cff', '#79c0ff', '#56d364']
const ROW_HEIGHT = 24
const COL_WIDTH = 12
const NODE_R = 4
const PAD_LEFT = 8

const GitGraph = ({ repoPath, className, refreshKey }: GitGraphProps) => {
  const { t } = useTranslation('workspace')
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [collapsed, setCollapsed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(false)

  const fetchLog = useCallback(async () => {
    if (!repoPath) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ path: repoPath, limit: '30' })
      const res = await authFetch(`${API_BASE}/api/git/log?${params}`)
      if (!res.ok) return
      const data = await res.json()
      setEntries(data.entries || [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [repoPath])

  // Refresh = git fetch + reload log
  const handleRefresh = useCallback(async () => {
    setFetching(true)
    try {
      const res = await authFetch(`${API_BASE}/api/git/fetch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: repoPath }),
      })
      if (!res.ok) {
        toast.warning(t('gitGraph.fetchFailed'))
      }
    } catch {
      toast.warning(t('gitGraph.remoteUnavailable'))
    } finally {
      setFetching(false)
    }
    await fetchLog()
  }, [repoPath, fetchLog])

  useEffect(() => { fetchLog() }, [fetchLog, refreshKey])

  const graph = useMemo(() => computeGraph(entries), [entries])

  if (loading && entries.length === 0) {
    return (
      <div className={cn('px-2 py-2 text-[10px] text-text-secondary opacity-60', className)}>
        Loading...
      </div>
    )
  }

  if (entries.length === 0) return null

  const maxCol = Math.max(...graph.rows.map((r) => r.col), 0)
  const graphW = PAD_LEFT + (maxCol + 1) * COL_WIDTH + 6

  return (
    <div className={cn('border-t border-border-subtle', className)}>
      {/* Title bar */}
      <div
        className="group flex items-center gap-1 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-secondary border-b border-border-subtle bg-bg-primary cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        <GitCommitHorizontal size={11} className="opacity-60" />
        <span className="flex-1">Git Graph</span>
        <span className="text-[10px] font-normal opacity-60">{entries.length}</span>
        <button
          type="button"
          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-bg-hover-subtle text-text-secondary transition-opacity"
          onClick={(e) => { e.stopPropagation(); handleRefresh() }}
          title="Fetch & Refresh"
          disabled={fetching}
        >
          <RefreshCw size={11} className={cn(fetching && 'animate-spin')} />
        </button>
      </div>

      {!collapsed && (
        <div className="overflow-y-auto max-h-[260px]">
          {graph.rows.map((row) => {
            const { entry } = row
            const isHead = entry.refs.some((r) => r.includes('HEAD'))
            const isMerge = entry.parents.length > 1
            const color = COLORS[row.col % COLORS.length]
            const cx = PAD_LEFT + row.col * COL_WIDTH + COL_WIDTH / 2
            const cy = ROW_HEIGHT / 2
            const tooltipText = `${entry.hash}  ${entry.author}\n${entry.date}\n\n${entry.message}`

            return (
              <Tooltip key={entry.hash}>
                <TooltipTrigger asChild>
                  <div
                    className="flex items-center hover:bg-bg-hover/50 cursor-default"
                    style={{ height: ROW_HEIGHT }}
                  >
                    <svg width={graphW} height={ROW_HEIGHT} className="shrink-0">
                      {row.parentIndices.map((pi) => {
                        const pr = graph.rows[pi]
                        if (!pr) return null
                        const px = PAD_LEFT + pr.col * COL_WIDTH + COL_WIDTH / 2
                        const lineColor = COLORS[pr.col % COLORS.length]

                        if (cx === px) {
                          return (
                            <line
                              key={`p${pi}`}
                              x1={cx} y1={cy} x2={px} y2={ROW_HEIGHT}
                              stroke={lineColor} strokeWidth={1.5} opacity={0.5}
                            />
                          )
                        }
                        return (
                          <path
                            key={`p${pi}`}
                            d={`M ${cx} ${cy} C ${cx} ${cy + 10}, ${px} ${ROW_HEIGHT - 6}, ${px} ${ROW_HEIGHT}`}
                            stroke={lineColor} strokeWidth={1.5} fill="none" opacity={0.5}
                          />
                        )
                      })}

                      {row.incomingCols.map((ic) => {
                        const lx = PAD_LEFT + ic * COL_WIDTH + COL_WIDTH / 2
                        const lineColor = COLORS[ic % COLORS.length]
                        const endY = ic === row.col ? cy : ROW_HEIGHT
                        return (
                          <line
                            key={`in${ic}`}
                            x1={lx} y1={0} x2={lx} y2={endY}
                            stroke={lineColor} strokeWidth={1.5} opacity={0.5}
                          />
                        )
                      })}

                      {row.mergeCols.map((mc) => {
                        const mx = PAD_LEFT + mc * COL_WIDTH + COL_WIDTH / 2
                        return (
                          <path
                            key={`mg${mc}`}
                            d={`M ${mx} ${0} C ${mx} ${cy - 2}, ${cx} ${cy - 6}, ${cx} ${cy}`}
                            stroke={color} strokeWidth={1.5} fill="none" opacity={0.5}
                          />
                        )
                      })}

                      {/* Node */}
                      <circle
                        cx={cx} cy={cy}
                        r={isHead ? NODE_R + 1.5 : NODE_R}
                        fill={isHead ? color : isMerge ? 'transparent' : color}
                        stroke={color}
                        strokeWidth={isHead ? 2.5 : 1.5}
                      />
                    </svg>

                    <div className="flex items-center gap-1.5 flex-1 min-w-0 pr-2 text-[11px] leading-none">
                      <span className={cn(
                        'truncate flex-1',
                        isMerge ? 'text-text-secondary italic' : 'text-text-primary',
                      )}>
                        {entry.message}
                      </span>
                      {entry.refs.length > 0 && entry.refs.map((ref) => (
                        <span
                          key={ref}
                          className="shrink-0 px-1 py-0.5 rounded text-[9px] font-mono leading-none bg-accent-brand/15 text-accent-brand border border-accent-brand/20"
                        >
                          {ref.replace('HEAD -> ', '')}
                        </span>
                      ))}
                      <span className="shrink-0 text-[10px] text-text-muted truncate max-w-[80px]">
                        {entry.author}
                      </span>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[360px] whitespace-pre-wrap font-mono text-[10px]">
                  {tooltipText}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Graph Calculate ──

interface GraphRow {
  entry: LogEntry
  col: number
  parentIndices: number[]
  incomingCols: number[]
  mergeCols: number[]
}

interface GraphData {
  rows: GraphRow[]
}

const computeGraph = (entries: LogEntry[]): GraphData => {
  if (entries.length === 0) return { rows: [] }

  const hashToIdx = new Map<string, number>()
  entries.forEach((e, i) => hashToIdx.set(e.hash, i))

  const rows: GraphRow[] = []
  const activeCols: (string | null)[] = []

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const parentIndices = entry.parents
      .map((p) => hashToIdx.get(p) ?? -1)
      .filter((idx) => idx !== -1)

    let col = activeCols.indexOf(entry.hash)
    if (col === -1) {
      col = activeCols.indexOf(null)
      if (col === -1) {
        col = activeCols.length
        activeCols.push(null)
      }
    }

    const incomingCols: number[] = []
    const mergeCols: number[] = []
    for (let c = 0; c < activeCols.length; c++) {
      if (activeCols[c] !== null && activeCols[c] !== entry.hash) {
        incomingCols.push(c)
      } else if (c !== col && activeCols[c] === entry.hash) {
        mergeCols.push(c)
        activeCols[c] = null
      }
    }
    if (activeCols[col] === entry.hash) {
      incomingCols.push(col)
    }

    if (entry.parents.length > 0 && parentIndices.length > 0) {
      activeCols[col] = entry.parents[0]
    } else {
      activeCols[col] = null
    }

    for (let p = 1; p < entry.parents.length; p++) {
      const ph = entry.parents[p]
      if (hashToIdx.has(ph) && !activeCols.includes(ph)) {
        const slot = activeCols.indexOf(null)
        if (slot !== -1) {
          activeCols[slot] = ph
        } else {
          activeCols.push(ph)
        }
      }
    }

    rows.push({ entry, col, parentIndices, incomingCols, mergeCols })
  }

  return { rows }
}

export default GitGraph
