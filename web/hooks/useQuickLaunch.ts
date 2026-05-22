import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useSensor, useSensors, PointerSensor, KeyboardSensor } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { arrayMove } from '@dnd-kit/sortable'
import type { AgentSummary } from '../types/agentConfig'
import type { QuickItem, LastSessionConfig, WorkspaceInfo } from '../components/home/types'
import { getQuickItemKey, POINTER_SENSOR_OPTIONS } from '../components/home/utils'
import {
  saveDirHistory,
  saveLastSession,
  persistDirList,
  persistHiddenWorkspaces,
  persistQuickOrder,
  loadHiddenWorkspaces,
  loadQuickOrder,
} from '../components/home/storage'
import { API_BASE, authFetch } from '@/config/api'

interface UseQuickLaunchOptions {
  dirHistory: string[]
  setDirHistory: (h: string[]) => void
  workspaces: WorkspaceInfo[]
  agents: AgentSummary[]
  model: string
  selectedAgentId: string | undefined
  lastSession: LastSessionConfig | null
}

export const useQuickLaunch = ({
  dirHistory, setDirHistory, workspaces, agents, model, selectedAgentId, lastSession,
}: UseQuickLaunchOptions) => {
  const navigate = useNavigate()
  const { t } = useTranslation(['home', 'common'])

  const [launchingItem, setLaunchingItem] = useState<string | null>(null)
  const [hiddenWorkspaces, setHiddenWorkspaces] = useState<string[]>(() => loadHiddenWorkspaces())
  const [quickOrder, setQuickOrder] = useState<string[]>(() => loadQuickOrder())

  // Quick Launch combobox
  const [selectedQuickItem, setSelectedQuickItem] = useState<QuickItem | null>(null)
  const [quickSearch, setQuickSearch] = useState('')
  const [quickDropdownOpen, setQuickDropdownOpen] = useState(false)
  const comboboxRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    if (!quickDropdownOpen) return
    const handler = (e: MouseEvent) => {
      if (comboboxRef.current && !comboboxRef.current.contains(e.target as Node)) {
        setQuickDropdownOpen(false)
        setQuickSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [quickDropdownOpen])

  const quickItems = useMemo<QuickItem[]>(() => {
    const wsItems: QuickItem[] = workspaces
      .filter((ws) => !hiddenWorkspaces.includes(ws.id))
      .map((ws) => ({
        type: 'workspace' as const,
        label: ws.name,
        paths: ws.repositories.map((r) => r.path),
        lastUsed: new Date(ws.lastAccessedAt).getTime(),
        workspaceId: ws.id,
      }))
    const sorted = wsItems.sort((a, b) => b.lastUsed - a.lastUsed)

    if (quickOrder.length > 0) {
      const keyMap = new Map(sorted.map((item) => [getQuickItemKey(item), item]))
      const ordered: QuickItem[] = []
      for (const key of quickOrder) {
        const item = keyMap.get(key)
        if (item) {
          ordered.push(item)
          keyMap.delete(key)
        }
      }
      for (const item of keyMap.values()) ordered.push(item)
      return ordered
    }
    return sorted
  }, [workspaces, hiddenWorkspaces, quickOrder])

  // Default-select last used item
  useEffect(() => {
    if (selectedQuickItem || quickItems.length === 0) return
    const lastRepo = lastSession?.repos?.[0]
    if (lastRepo) {
      const match = quickItems.find((item) => item.paths.includes(lastRepo))
      if (match) { setSelectedQuickItem(match); return }
    }
    setSelectedQuickItem(quickItems[0])
  }, [quickItems, selectedQuickItem, lastSession])

  // Filtered items for combobox search
  const filteredQuickItems = useMemo(() => {
    const q = quickSearch.trim().toLowerCase()
    if (!q) return quickItems
    return quickItems.filter((item) =>
      item.label.toLowerCase().includes(q) ||
      item.paths.some((p) => p.toLowerCase().includes(q)),
    )
  }, [quickItems, quickSearch])

  const handleQuickLaunch = async (item: QuickItem) => {
    const itemKey = item.type === 'workspace' ? `ws-${item.workspaceId}` : `repo-${item.paths[0]}`
    setLaunchingItem(itemKey)

    for (const p of item.paths) saveDirHistory(p)
    saveLastSession({ repos: item.paths, model, agentId: selectedAgentId })

    try {
      const selectedAgent = agents.find((a) => a.name === selectedAgentId)
      const body = {
        ...(item.paths.length === 1
          ? { repoPath: item.paths[0] }
          : { repoPaths: item.paths }),
        model,
        ...(selectedAgent ? { agentId: selectedAgent.id } : {}),
        ...(item.workspaceId ? { workspaceId: item.workspaceId } : {}),
      }
      const res = await authFetch(`${API_BASE}/api/workspaces/quick-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Quick start failed')
      }
      const { workspace, chat } = await res.json()
      navigate(`/workspace/${workspace.id}/chat/${chat.id}`, {
        state: { isNew: true, agentId: selectedAgentId },
      })
    } catch (err) {
      console.error('[HomePage] Quick launch failed:', err)
      toast.error(t('home:startChatFailed', { defaultValue: 'StartConversationfailed. Please retry' }))
    } finally {
      setLaunchingItem(null)
    }
  }

  const handleRemoveQuickItem = (item: QuickItem, e: React.MouseEvent) => {
    e.stopPropagation()
    if (item.type === 'repo') {
      const updated = dirHistory.filter((p) => p !== item.paths[0])
      setDirHistory(persistDirList(updated))
    } else if (item.workspaceId) {
      const updated = [...hiddenWorkspaces, item.workspaceId]
      setHiddenWorkspaces(updated)
      persistHiddenWorkspaces(updated)
    }
    const key = getQuickItemKey(item)
    const updatedOrder = quickOrder.filter((k) => k !== key)
    setQuickOrder(updatedOrder)
    persistQuickOrder(updatedOrder)
    if (selectedQuickItem && getQuickItemKey(selectedQuickItem) === key) {
      setSelectedQuickItem(null)
    }
  }

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, POINTER_SENSOR_OPTIONS),
    useSensor(KeyboardSensor),
  )

  const displayedChips = quickItems.slice(0, 4)
  const displayedChipIds = displayedChips.map(getQuickItemKey)

  const handleSortEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = displayedChipIds.indexOf(active.id as string)
    const newIndex = displayedChipIds.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(displayedChipIds, oldIndex, newIndex)
    const remainingKeys = quickItems.slice(4).map(getQuickItemKey)
    const fullOrder = [...reordered, ...remainingKeys]
    setQuickOrder(fullOrder)
    persistQuickOrder(fullOrder)
  }

  return {
    launchingItem,
    selectedQuickItem, setSelectedQuickItem,
    quickSearch, setQuickSearch,
    quickDropdownOpen, setQuickDropdownOpen,
    comboboxRef,
    quickItems,
    filteredQuickItems,
    handleQuickLaunch,
    handleRemoveQuickItem,
    sensors,
    displayedChips,
    displayedChipIds,
    handleSortEnd,
  }
}
