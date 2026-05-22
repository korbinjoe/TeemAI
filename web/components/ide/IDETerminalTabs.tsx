/**
 * IDETerminalTabs — WebIDE  Tab
 *
 *  IDETerminal  Tab  shellPTY
 * Tab  hidden prop  PTY
 *  MAX_TABS  Tab WebGL context
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { Plus, X } from 'lucide-react'

import IDETerminal from './IDETerminal'

const MAX_TABS = 8

interface ShellTab {
  id: string
  label: string
  status: 'running' | 'exited'
}

interface IDETerminalTabsProps {
  cwd: string
  hidden?: boolean
}

const getNextLabel = (existing: ShellTab[]): string => {
  const usedNums = new Set(
    existing.map(t => {
      const m = t.label.match(/^Shell (\d+)$/)
      return m ? Number(m[1]) : 0
    })
  )
  let n = 1
  while (usedNums.has(n)) n++
  return `Shell ${n}`
}

const IDETerminalTabs = ({ cwd, hidden = false }: IDETerminalTabsProps) => {
  const [tabs, setTabs] = useState<ShellTab[]>(() => [{
    id: crypto.randomUUID(),
    label: 'Shell 1',
    status: 'running',
  }])
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id)
  const activeTabIdRef = useRef(activeTabId)
  useEffect(() => { activeTabIdRef.current = activeTabId }, [activeTabId])

  const handleNewTab = useCallback(() => {
    setTabs(prev => {
      if (prev.length >= MAX_TABS) return prev
      const newTab: ShellTab = {
        id: crypto.randomUUID(),
        label: getNextLabel(prev),
        status: 'running',
      }
      setActiveTabId(newTab.id)
      return [...prev, newTab]
    })
  }, [])

  const handleCloseTab = useCallback((tabId: string) => {
    setTabs(prev => {
      if (prev.length <= 1) return prev
      const idx = prev.findIndex(t => t.id === tabId)
      const next = prev.filter(t => t.id !== tabId)
      if (tabId === activeTabIdRef.current) {
        const newIdx = Math.min(idx, next.length - 1)
        setActiveTabId(next[newIdx].id)
      }
      return next
    })
  }, [])

  const handleTabExit = useCallback((tabId: string) => {
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, status: 'exited' } : t
    ))
  }, [])

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center h-7 bg-bg-secondary border-b border-border-subtle shrink-0 px-1 gap-0.5 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            className={cn(
              'group flex items-center gap-1 px-2 h-6 text-[11px] rounded-sm transition-colors shrink-0',
              tab.id === activeTabId
                ? 'bg-bg-primary text-text-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover',
            )}
          >
            <span>{tab.label}</span>
            {tab.status === 'exited' && (
              <span className="size-1.5 rounded-full bg-text-tertiary shrink-0" />
            )}
            {tabs.length > 1 && (
              <button
                aria-label={`Close ${tab.label}`}
                className={cn(
                  'inline-flex items-center justify-center size-3.5 rounded-sm transition-colors shrink-0',
                  tab.id === activeTabId
                    ? 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                    : 'text-text-tertiary opacity-0 group-hover:opacity-100 hover:text-text-primary hover:bg-bg-hover',
                )}
                onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id) }}
              >
                <X size={10} />
              </button>
            )}
          </button>
        ))}
        {tabs.length < MAX_TABS && (
          <button
            onClick={handleNewTab}
            aria-label="NewTerminal"
            className="inline-flex items-center justify-center size-5 rounded-sm transition-colors shrink-0 text-text-secondary hover:text-text-primary hover:bg-bg-hover"
          >
            <Plus size={12} />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 relative">
        {tabs.map(tab => (
          <div
            key={tab.id}
            className={cn(
              'absolute inset-0',
              tab.id === activeTabId ? 'visible z-10' : 'invisible z-0',
            )}
          >
            <IDETerminal
              cwd={cwd}
              hidden={hidden || tab.id !== activeTabId}
              onExit={() => handleTabExit(tab.id)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export default IDETerminalTabs
