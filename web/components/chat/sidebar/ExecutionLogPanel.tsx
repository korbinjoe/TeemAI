/**
 * ExecutionLogPanel —  Chat  per-agent
 */

import { useState, useEffect, useCallback } from 'react'
import { Activity, DollarSign, Wrench, ChevronDown, ChevronRight } from 'lucide-react'

import { API_BASE, authFetch } from '@/config/api'

interface ExecutionLog {
  id: string
  chatId: string
  workspaceId: string
  agentName: string
  totalCost?: number
  totalTokens?: { input: number; output: number; cacheRead?: number; cacheCreation?: number }
  toolCalls: number
  duration?: number
  status: 'running' | 'completed' | 'error'
  startedAt: string
  completedAt?: string
}

interface Props {
  chatId: string
}

const ExecutionLogPanel = ({ chatId }: Props) => {
  const [logs, setLogs] = useState<ExecutionLog[]>([])
  const [collapsed, setCollapsed] = useState(true)

  const fetchLogs = useCallback(async () => {
    try {
      const res = await authFetch(`${API_BASE}/api/execution-logs?chatId=${chatId}`)
      if (res.ok) setLogs(await res.json())
    } catch { /* ignore */ }
  }, [chatId])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  if (logs.length === 0) return null

  const totalCost = logs.reduce((sum, l) => sum + (l.totalCost || 0), 0)
  const totalTokens = logs.reduce(
    (acc, l) => ({
      input: acc.input + (l.totalTokens?.input || 0),
      output: acc.output + (l.totalTokens?.output || 0),
    }),
    { input: 0, output: 0 },
  )
  const totalTools = logs.reduce((sum, l) => sum + l.toolCalls, 0)

  return (
    <div className="border border-border rounded-lg overflow-hidden text-xs">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="w-full px-3 py-2 flex items-center gap-2 bg-transparent border-none cursor-pointer text-text-emphasis font-medium text-xs"
        aria-label="Toggle execution logs"
        tabIndex={0}
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        <Activity size={13} />
        Execution Summary
        <span className="flex-1" />
        {totalCost > 0 && (
          <span className="text-text-secondary font-normal flex items-center gap-[3px]">
            <DollarSign size={10} />
            ${totalCost.toFixed(4)}
          </span>
        )}
        <span className="text-text-secondary font-normal flex items-center gap-[3px]">
          <Wrench size={10} />
          {totalTools} tools
        </span>
      </button>

      {!collapsed && (
        <div className="border-t border-border-subtle">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-border-subtle">
                {['Agent', 'Cost', 'Tokens (in/out)', 'Tools', 'Duration', 'Status'].map((h) => (
                  <th
                    key={h}
                    className="px-2.5 py-1.5 text-left font-medium text-xs text-text-secondary"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr
                  key={log.id}
                  className="border-b border-border-subtle"
                >
                  <td className="px-2.5 py-1.5 text-text-primary">{log.agentName}</td>
                  <td className="px-2.5 py-1.5 text-text-secondary">
                    {log.totalCost ? `$${log.totalCost.toFixed(4)}` : '-'}
                  </td>
                  <td className="px-2.5 py-1.5 text-text-secondary">
                    {log.totalTokens ? `${formatTokens(log.totalTokens.input)} / ${formatTokens(log.totalTokens.output)}` : '-'}
                  </td>
                  <td className="px-2.5 py-1.5 text-text-secondary">{log.toolCalls}</td>
                  <td className="px-2.5 py-1.5 text-text-secondary">
                    {log.duration ? formatDuration(log.duration) : '-'}
                  </td>
                  <td className="px-2.5 py-1.5">
                    <span className="text-xs px-[5px] py-px rounded-[3px]" style={{
                      background: statusBg(log.status),
                      color: statusColor(log.status),
                    }}>
                      {log.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Summary row */}
          <div className="px-2.5 py-2 flex gap-4 border-t border-border bg-bg-hover-subtle text-text-secondary text-xs">
            <span>Total: {logs.length} agents</span>
            {totalCost > 0 && <span>Cost: ${totalCost.toFixed(4)}</span>}
            <span>Tokens: {formatTokens(totalTokens.input)} in / {formatTokens(totalTokens.output)} out</span>
            <span>Tools: {totalTools}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return `${n}`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

function statusColor(s: string): string {
  if (s === 'running') return 'rgb(var(--accent-green))'
  if (s === 'completed') return 'rgb(var(--accent-brand))'
  return 'rgb(var(--accent-red))'
}

function statusBg(s: string): string {
  if (s === 'running') return 'rgb(var(--bg-hover-subtle) / var(--bg-hover-subtle-alpha))'
  if (s === 'completed') return 'rgb(var(--bg-hover-subtle) / var(--bg-hover-subtle-alpha))'
  return 'rgb(var(--bg-hover-subtle) / var(--bg-hover-subtle-alpha))'
}

export default ExecutionLogPanel
