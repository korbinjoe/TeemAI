/**
 * ChatTabBar — Tab UI
 */

import { useRef, useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import {
  DndContext, closestCenter, useSensor, useSensors,
  PointerSensor, KeyboardSensor,
} from '@dnd-kit/core'
import { restrictToHorizontalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext, horizontalListSortingStrategy, arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { Zap, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useChatTabs, type ChatTabItem } from '@/contexts/ChatTabContext'
import { isElectron } from '@/utils/env'
import type { AgentPhase } from '@/types/chat'
import { sendAESEvent } from '@/lib/aes'
import { API_BASE, authFetch } from '@/config/api'
import { getWebSocketClient } from '@/services/WebSocketClient'
import NewChatFullDialog from '@/components/chat/modals/NewChatFullDialog'
import SortableChatTab from './SortableChatTab'
import WorkspaceTabGroup from './WorkspaceTabGroup'

const TAB_STATUS_MAP: Record<string, { phase: AgentPhase }> = {
  error: { phase: 'error' },
  waiting_input: { phase: 'waiting_input' },
  waiting_confirm: { phase: 'waiting_confirmation' },
  timeout: { phase: 'waiting_input' },
  success: { phase: 'completed' },
  interrupted: { phase: 'completed' },
}

const ACTIVE_PHASES: ReadonlySet<AgentPhase> = new Set<AgentPhase>([
  'thinking',
  'tool_running',
  'responding',
])
const RESULT_PHASES: ReadonlySet<AgentPhase> = new Set<AgentPhase>([
  'completed',
  'error',
])

interface WorkspaceGroup {
  workspaceId: string
  workspaceName: string
  colorIndex: number
  tabs: ChatTabItem[]
}

const ChatTabBar = () => {
  const {
    tabs, activeTabId, activateTab, closeTab,
    tabStatus, unreadTabs, markTabUnread, reorderTabs,
    collapsedGroups, toggleGroupCollapse,
    closeOtherTabs, closeRightTabs,
  } = useChatTabs()
  const { t } = useTranslation(['workspace', 'common'])

  const [wsNameMap, setWsNameMap] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    authFetch(`${API_BASE}/api/workspaces`).then((r) => r.ok ? r.json() : [])
      .then((list: { id: string; name: string }[]) => {
        setWsNameMap(new Map(list.map((w) => [w.id, w.name])))
      }).catch(() => {})
  }, [])

  const [tabPhases, setTabPhases] = useState<Map<string, AgentPhase>>(new Map())
  useEffect(() => {
    const ws = getWebSocketClient()
    const handleActivity = (p: { chatId: string; phase?: string }) => {
      if (!p.phase) return
      setTabPhases((prev) => { const m = new Map(prev); m.set(p.chatId, p.phase as AgentPhase); return m })
    }
    const handleStatus = (p: { chatId: string; taskStatus?: string | null }) => {
      if (p.taskStatus && TAB_STATUS_MAP[p.taskStatus]) {
        setTabPhases((prev) => { const m = new Map(prev); m.set(p.chatId, TAB_STATUS_MAP[p.taskStatus!].phase); return m })
      }
    }
    ws.on('chat:activity', handleActivity)
    ws.on('chat:status-changed', handleStatus)
    return () => { ws.off('chat:activity', handleActivity); ws.off('chat:status-changed', handleStatus) }
  }, [])

  const prevPhaseRef = useRef<Map<string, AgentPhase>>(new Map())
  useEffect(() => {
    const prev = prevPhaseRef.current
    const next = new Map<string, AgentPhase>()
    for (const tab of tabs) {
      const phase: AgentPhase = tabPhases.get(tab.chatId) ?? 'initializing'
      next.set(tab.chatId, phase)

      const prevPhase = prev.get(tab.chatId)
      if (
        prevPhase &&
        prevPhase !== phase &&
        ACTIVE_PHASES.has(prevPhase) &&
        RESULT_PHASES.has(phase) &&
        tab.chatId !== activeTabId
      ) {
        markTabUnread(tab.chatId)
      }
    }
    prevPhaseRef.current = next
  }, [tabs, tabPhases, activeTabId, markTabUnread])

  const activeTab = tabs.find((tab) => tab.chatId === activeTabId)

  // ── Workspace Group ──
  const workspaceGroups = useMemo(() => {
    const groupMap = new Map<string, WorkspaceGroup>()
    const groupOrder: string[] = []
    let colorIdx = 0

    for (const tab of tabs) {
      const wsId = tab.workspaceId
      if (!groupMap.has(wsId)) {
        groupMap.set(wsId, {
          workspaceId: wsId,
          workspaceName: wsNameMap.get(wsId) || wsId,
          colorIndex: colorIdx++,
          tabs: [],
        })
        groupOrder.push(wsId)
      }
      groupMap.get(wsId)!.tabs.push(tab)
    }

    return groupOrder.map((id) => groupMap.get(id)!)
  }, [tabs, wsNameMap])

  const showGroups = workspaceGroups.length > 1

  const globalStatus = useMemo(() => {
    let working = 0
    let errors = 0
    let waiting = 0
    for (const [, phase] of tabPhases) {
      if (phase === 'thinking' || phase === 'tool_running' || phase === 'responding') working++
      else if (phase === 'error') errors++
      else if (phase === 'waiting_input' || phase === 'waiting_confirmation') waiting++
    }
    return { working, errors, waiting, total: working + errors + waiting }
  }, [tabPhases])

  const [newChatOpen, setNewChatOpen] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const [overflowLeft, setOverflowLeft] = useState(false)
  const [overflowRight, setOverflowRight] = useState(false)

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setOverflowLeft(el.scrollLeft > 2)
    setOverflowRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    checkOverflow()
    el.addEventListener('scroll', checkOverflow, { passive: true })
    const ro = new ResizeObserver(checkOverflow)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', checkOverflow); ro.disconnect() }
  }, [checkOverflow, tabs.length])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const tabIds = useMemo(() => tabs.map((t) => t.chatId), [tabs])

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = tabIds.indexOf(active.id as string)
    const newIndex = tabIds.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(tabIds, oldIndex, newIndex)
    reorderTabs(reordered)
    sendAESEvent('tab', 'tab_reordered', { from: oldIndex, to: newIndex })
  }, [tabIds, reorderTabs])

  return (
    <div
      className={cn(
        'h-8 flex items-end shrink-0',
        isElectron && '-webkit-app-region-drag',
      )}
      style={{
        paddingLeft: isElectron ? 28 : undefined,
        background: 'rgb(var(--bg-tab-bar))',
      }}
    >

      <div className="relative flex-1 min-w-0">
        {overflowLeft && (
          <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-[rgb(var(--bg-tab-bar))] to-transparent z-10 pointer-events-none" />
        )}
        {overflowRight && (
          <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-[rgb(var(--bg-tab-bar))] to-transparent z-10 pointer-events-none" />
        )}

        <div
          ref={scrollRef}
          className="flex items-end h-full overflow-x-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {tabs.length === 0 && (
            <div
              className="flex items-center gap-1.5 h-7 px-3 rounded-t-lg bg-bg-primary text-text-emphasis font-medium text-xs shrink-0 select-none z-10 chrome-tab-active"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <Plus size={12} className="text-text-secondary" />
              <span className="truncate max-w-[120px]">{t('workspace:emptyTab.title')}</span>
            </div>
          )}

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToHorizontalAxis, restrictToParentElement]}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
              {workspaceGroups.map((group) => {
                const isCollapsed = showGroups && collapsedGroups.includes(group.workspaceId)

                return (
                  <Fragment key={group.workspaceId}>
                    {showGroups && (
                      <WorkspaceTabGroup
                        name={group.workspaceName}
                        colorIndex={group.colorIndex}
                        tabCount={group.tabs.length}
                        isCollapsed={isCollapsed}
                        onToggle={() => toggleGroupCollapse(group.workspaceId)}
                      />
                    )}

                    {!isCollapsed && group.tabs.map((tab, idx) => {
                      const isActive = tab.chatId === activeTabId
                      const phase: AgentPhase = tabPhases.get(tab.chatId) ?? 'initializing'

                      const isWaiting = phase === 'waiting_input' || phase === 'waiting_confirmation'
                      const isError = phase === 'error'
                      const isWaitingConfirm = phase === 'waiting_confirmation'
                      const isUnread = !isActive && unreadTabs.includes(tab.chatId)

                      const title = tab.title || t('workspace:chatTab.unnamed')
                      const tabWorkspaceName = ''
                      const changedFiles = tabStatus[tab.chatId]?.changedFiles ?? 0

                      const nextTab = group.tabs[idx + 1]
                      const nextIsActive = nextTab?.chatId === activeTabId
                      const showSeparator = !isActive && !nextIsActive && idx < group.tabs.length - 1

                      return (
                        <SortableChatTab
                          key={tab.chatId}
                          tab={tab}
                          title={title}
                          workspaceName={tabWorkspaceName}
                          isActive={isActive}
                          phase={phase}
                          isWaiting={isWaiting}
                          isError={isError}
                          isWaitingConfirm={isWaitingConfirm}
                          isUnread={isUnread}
                          changedFiles={changedFiles}
                          showSeparator={showSeparator}
                          totalTabs={tabs.length}
                          hasRight={tabs.indexOf(tab) < tabs.length - 1}
                          onActivate={() => {
                            activateTab(tab.chatId)
                            sendAESEvent('tab', 'tab_switched', { chatId: tab.chatId })
                          }}
                          onClose={() => {
                            sendAESEvent('tab', 'tab_closed', { chatId: tab.chatId })
                            closeTab(tab.chatId)
                          }}
                          onCloseOthers={() => closeOtherTabs(tab.chatId)}
                          onCloseRight={() => closeRightTabs(tab.chatId)}
                        />
                      )
                    })}
                  </Fragment>
                )
              })}
            </SortableContext>
          </DndContext>

          {/* Global status pill */}
          {globalStatus.total > 0 && (
            <div
              className="flex items-center gap-1.5 h-6 mb-0.5 ml-1.5 px-2 rounded-full shrink-0 select-none"
              style={{ WebkitAppRegion: 'no-drag', background: 'rgb(var(--bg-hover) / 0.5)' } as React.CSSProperties}
            >
              {globalStatus.working > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-accent-brand-light">
                  <Zap size={9} className="animate-pulse" />
                  {globalStatus.working}
                </span>
              )}
              {globalStatus.errors > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-accent-red">
                  <AlertTriangle size={9} />
                  {globalStatus.errors}
                </span>
              )}
              {globalStatus.waiting > 0 && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-accent-yellow">
                  <span className="w-1 h-1 rounded-full bg-accent-yellow" />
                  {globalStatus.waiting}
                </span>
              )}
            </div>
          )}

          {tabs.length > 0 && (
            <button
              type="button"
              onClick={() => setNewChatOpen(true)}
              className="flex items-center justify-center w-7 h-6 mb-0.5 ml-0.5 rounded text-text-muted hover:text-text-secondary hover:bg-bg-hover-muted transition-colors shrink-0"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              title={t('workspace:newChat.title')}
            >
              <Plus size={14} />
            </button>
          )}
        </div>
      </div>

      {/* NewConversationDialog */}
      <NewChatFullDialog
        open={newChatOpen}
        onOpenChange={setNewChatOpen}
        currentWorkspaceId={activeTab?.workspaceId}
      />
    </div>
  )
}

export default ChatTabBar
