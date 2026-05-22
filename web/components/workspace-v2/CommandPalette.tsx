import { useRef, useEffect, useState, useMemo } from 'react'
import { useWorkspace } from '../../contexts/WorkspaceContext'
import { Search } from './icons'

interface PaletteEntry {
  type: 'agent' | 'task' | 'action'
  id: string
  label: string
  group?: string
  status?: string
  time?: string
  shortcut?: string
}

const ALL_ENTRIES: PaletteEntry[] = [
  { type: 'agent', id: 'agent-1', label: 'Fullstack', group: 'Implement user auth flow', status: 'waiting', time: '4m' },
  { type: 'agent', id: 'agent-2', label: 'Reviewer', group: 'Implement user auth flow', status: 'running', time: '1m' },
  { type: 'agent', id: 'agent-3', label: 'Shield', group: 'Implement user auth flow', status: 'error', time: '12m' },
  { type: 'agent', id: 'agent-4', label: 'Designer', group: 'Redesign settings page', status: 'running', time: '2m' },
  { type: 'action', id: 'new-task', label: 'New Task', shortcut: '⌘N' },
  { type: 'action', id: 'toggle-panel', label: 'Toggle Sidebar', shortcut: '⌘B' },
  { type: 'action', id: 'toggle-terminal', label: 'Toggle Terminal', shortcut: '⌘`' },
  { type: 'action', id: 'cycle-layout', label: 'Cycle Layout', shortcut: '⌘\\' },
  { type: 'action', id: 'settings', label: 'Settings', shortcut: '⌘,' },
]

const fuzzyMatch = (query: string, text: string): boolean => {
  const q = query.toLowerCase()
  const t = text.toLowerCase()
  let qi = 0
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++
  }
  return qi === q.length
}

const CommandPalette = () => {
  const { commandPaletteOpen, closeCommandPalette, selectAgent, togglePanel, toggleTerminal, cycleLayoutMode } = useWorkspace()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [commandPaletteOpen])

  const filtered = useMemo(() => {
    if (!query.trim()) return ALL_ENTRIES
    return ALL_ENTRIES.filter((e) => {
      const searchable = `${e.label} ${e.group || ''}`
      return fuzzyMatch(query, searchable)
    })
  }, [query])

  const executeEntry = (entry: PaletteEntry) => {
    if (entry.type === 'agent') {
      selectAgent(entry.id)
    } else if (entry.id === 'toggle-panel') {
      togglePanel()
    } else if (entry.id === 'toggle-terminal') {
      toggleTerminal()
    } else if (entry.id === 'cycle-layout') {
      cycleLayoutMode()
    }
    closeCommandPalette()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeCommandPalette()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[selectedIndex]) executeEntry(filtered[selectedIndex])
    }
  }

  if (!commandPaletteOpen) return null

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) closeCommandPalette()
  }

  const agentEntries = filtered.filter((e) => e.type === 'agent')
  const actionEntries = filtered.filter((e) => e.type === 'action')
  const groups = [...new Set(agentEntries.map((e) => e.group!))]

  let flatIndex = 0

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-start justify-center pt-[20vh] z-[100]"
      onClick={handleBackdropClick}
    >
      <div className="w-[520px] border border-border rounded-xl bg-bg-secondary shadow-2xl overflow-hidden">
        <div className="px-4 py-3.5 border-b border-border flex items-center gap-2.5">
          <Search size={16} className="text-accent-brand" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent border-none outline-none text-sm text-text-primary font-sans placeholder:text-text-muted"
            placeholder="Search agents, actions, navigation..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0) }}
            onKeyDown={handleKeyDown}
          />
          <kbd className="px-1.5 py-0.5 rounded border border-border bg-white/[0.04] font-mono text-[10px] text-text-muted">
            esc
          </kbd>
        </div>

        <div className="p-2 max-h-[300px] overflow-y-auto">
          {agentEntries.length > 0 && (
            <>
              <div className="text-[9px] font-bold uppercase tracking-wider text-text-muted px-2.5 py-2 pt-2">
                Active Tasks
              </div>
              {groups.map((group) => (
                <PaletteGroup key={group} title={group}>
                  {agentEntries
                    .filter((e) => e.group === group)
                    .map((entry) => {
                      const idx = flatIndex++
                      return (
                        <PaletteItem
                          key={entry.id}
                          label={entry.label}
                          status={entry.status!}
                          time={entry.time!}
                          selected={idx === selectedIndex}
                          onClick={() => executeEntry(entry)}
                        />
                      )
                    })}
                </PaletteGroup>
              ))}
            </>
          )}

          {actionEntries.length > 0 && (
            <>
              <div className="text-[9px] font-bold uppercase tracking-wider text-text-muted px-2.5 py-2 pt-3">
                Actions
              </div>
              {actionEntries.map((entry) => {
                const idx = flatIndex++
                return (
                  <ActionItem
                    key={entry.id}
                    label={entry.label}
                    shortcut={entry.shortcut || ''}
                    selected={idx === selectedIndex}
                    onClick={() => executeEntry(entry)}
                  />
                )
              })}
            </>
          )}

          {filtered.length === 0 && (
            <div className="px-2.5 py-6 text-center text-xs text-text-muted">No results</div>
          )}
        </div>
      </div>
    </div>
  )
}

const PaletteGroup = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <>
    <div className="px-2.5 py-1">
      <span className="text-[10px] text-text-muted font-medium">{title}</span>
    </div>
    {children}
  </>
)

const PaletteItem = ({ label, status, time, selected, onClick }: { label: string; status: string; time: string; selected: boolean; onClick: () => void }) => {
  const dotColor = status === 'error' ? 'bg-accent-red' : status === 'waiting' ? 'bg-accent-yellow' : 'bg-accent-brand'
  return (
    <div
      className={`flex items-center gap-2.5 px-2.5 py-1.5 pl-5 rounded-md cursor-pointer transition-colors ${selected ? 'bg-accent-brand/10' : 'hover:bg-bg-hover'}`}
      onClick={onClick}
    >
      <span className={`w-[7px] h-[7px] rounded-full ${dotColor}`} />
      <span className="text-xs text-text-primary flex-1">{label}</span>
      <span className="font-mono text-[10px] text-text-muted">{time}</span>
    </div>
  )
}

const ActionItem = ({ label, shortcut, selected, onClick }: { label: string; shortcut: string; selected: boolean; onClick: () => void }) => (
  <div
    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md cursor-pointer transition-colors ${selected ? 'bg-accent-brand/10' : 'hover:bg-bg-hover'}`}
    onClick={onClick}
  >
    <span className="text-xs text-text-primary flex-1">{label}</span>
    <span className="font-mono text-[10px] text-text-muted">{shortcut}</span>
  </div>
)

export default CommandPalette
