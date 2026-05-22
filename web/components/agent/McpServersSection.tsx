import { Plus, Trash2 } from 'lucide-react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { McpServerConfig } from '../../types/agentConfig'
import { Section } from './Section'

const MCP_TRANSPORT_OPTIONS = [
  { label: 'stdio', value: 'stdio' },
  { label: 'SSE', value: 'sse' },
  { label: 'HTTP', value: 'http' },
]

const McpServersSection = ({ mcpServers, onChange, disabled }: {
  mcpServers: Record<string, McpServerConfig>
  onChange: (v: Record<string, McpServerConfig>) => void
  disabled: boolean
}) => {
  const entries = Object.entries(mcpServers)

  const handleAdd = () => {
    const key = `server-${Date.now()}`
    onChange({ ...mcpServers, [key]: { transport: 'stdio', command: '', args: [] } })
  }

  const handleRemove = (key: string) => {
    const next = { ...mcpServers }
    delete next[key]
    onChange(next)
  }

  const handleUpdate = (key: string, config: McpServerConfig) => {
    onChange({ ...mcpServers, [key]: config })
  }

  const handleRename = (oldKey: string, newKey: string) => {
    if (newKey === oldKey || !newKey.trim()) return
    const next: Record<string, McpServerConfig> = {}
    for (const [k, v] of Object.entries(mcpServers)) {
      next[k === oldKey ? newKey : k] = v
    }
    onChange(next)
  }

  return (
    <Section title="MCP Servers">
      {entries.length === 0 && (
        <div style={{ fontSize: 12, color: 'rgb(var(--text-muted))', marginBottom: 8 }}>No MCP servers configured</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(([key, config]) => (
          <div key={key} style={{
            padding: 10, borderRadius: 'var(--radius-sm)',
            border: '1px solid rgb(var(--border-subtle))',
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input
                value={key}
                onChange={(e) => handleRename(key, e.target.value)}
                disabled={disabled}
                placeholder="Server name"
                className="w-40 rounded-md border border-border bg-bg-input px-2 py-1 text-xs font-medium text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-brand disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <Select
                value={config.transport}
                onValueChange={(transport) => handleUpdate(key, { ...config, transport: transport as McpServerConfig['transport'] })}
                disabled={disabled}
              >
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MCP_TRANSPORT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!disabled && (
                <button
                  onClick={() => handleRemove(key)}
                  aria-label="Remove server"
                  tabIndex={0}
                  className="p-1 text-red-400 hover:text-red-300 transition-colors"
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
            {config.transport === 'stdio' ? (
              <div style={{ display: 'grid', gap: 6 }}>
                <input
                  placeholder="Command (e.g., npx)"
                  value={config.command || ''}
                  onChange={(e) => handleUpdate(key, { ...config, command: e.target.value })}
                  disabled={disabled}
                  className="w-full rounded-md border border-border bg-bg-input px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-brand disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <input
                  placeholder="Args (comma-separated)"
                  value={(config.args || []).join(', ')}
                  onChange={(e) => handleUpdate(key, {
                    ...config,
                    args: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                  })}
                  disabled={disabled}
                  className="w-full rounded-md border border-border bg-bg-input px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-brand disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            ) : (
              <input
                placeholder="URL"
                value={config.url || ''}
                onChange={(e) => handleUpdate(key, { ...config, url: e.target.value })}
                disabled={disabled}
                className="w-full rounded-md border border-border bg-bg-input px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-brand disabled:opacity-50 disabled:cursor-not-allowed"
              />
            )}
          </div>
        ))}
      </div>
      {!disabled && (
        <button
          onClick={handleAdd}
          aria-label="Add MCP server"
          tabIndex={0}
          className="mt-2 w-full rounded border border-dashed border-border py-1.5 text-xs text-text-secondary hover:text-text-primary hover:border-text-muted transition-colors inline-flex items-center justify-center gap-1"
        >
          <Plus size={12} />
          Add MCP Server
        </button>
      )}
    </Section>
  )
}

export default McpServersSection
