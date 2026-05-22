import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X, RefreshCw, GripHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDevPanel, type DevPanelMode } from '@/hooks/useDevPanel'
import { Section } from './panels/helpers'
import { DevOverview, DevSessionCard } from './panels/DevSessionCard'
import { DevPipelinePanel } from './panels/DevPipelinePanel'
import { DevProtocolTimeline } from './panels/DevProtocolTimeline'
import { DevRawDataPanel } from './panels/DevRawDataPanel'
import { useDragResizePanel } from './panels/useDragResizePanel'

const MODE_BADGE_STYLE: Record<DevPanelMode, string> = {
  'local': 'bg-zinc-800 text-zinc-400 border border-zinc-700',
}
const MODE_BADGE_PREFIX: Record<DevPanelMode, string> = {
  'local': '',
}
const MODE_BADGE_TITLE: Record<DevPanelMode, string> = {
  'local': '',
}

type DevTab = 'pipeline' | 'sessions' | 'protocol' | 'raw'

const TAB_ITEMS: Array<{ id: DevTab; label: string; shortLabel: string }> = [
  { id: 'pipeline', label: 'Pipeline', shortLabel: '▶' },
  { id: 'sessions', label: 'Sessions', shortLabel: '⚙' },
  { id: 'protocol', label: 'Protocol', shortLabel: '↕' },
  { id: 'raw', label: 'Raw Data', shortLabel: '📋' },
]

interface DevPanelProps {
  chatId: string
  chatTitle?: string
  isOpen: boolean
  onClose: () => void
}

const DevPanel = ({ chatId, chatTitle, isOpen, onClose }: DevPanelProps) => {
  const {
    snapshot, events, jsonlStreams, rawJsonlCache,
    pipeline, timeline,
    refreshSnapshot, executeAction, clearEvents, requestRawJsonl,
    showAllProtocol, setShowAllProtocol,
  } = useDevPanel(chatId, isOpen)
  const { t } = useTranslation('chat')
  const { layout, handleDragStart, handleResizeStart } = useDragResizePanel()
  const [activeTab, setActiveTab] = useState<DevTab>('pipeline')

  if (!isOpen) return null

  const mode: DevPanelMode = snapshot?.mode ?? 'local'
  const totalCount = snapshot?.totalSessions ?? 0
  const sessionsTitle = snapshot ? `Agent Sessions (${totalCount})` : 'Agent Sessions (0)'

  const renderTabContent = () => {
    if (!snapshot) {
      return (
        <div className="flex items-center justify-center h-32 text-xs text-zinc-600">
          Connecting...
        </div>
      )
    }

    switch (activeTab) {
      case 'pipeline':
        return (
          <>
            <DevOverview snapshot={snapshot} />
            <DevPipelinePanel pipeline={pipeline} />
          </>
        )
      case 'sessions':
        return (
          <>
            <DevOverview snapshot={snapshot} />
            <Section title={sessionsTitle}>
              {snapshot.sessions.length === 0 ? (
                <div className="text-xs text-zinc-600 italic py-2">{t('dev.noSession')}</div>
              ) : (
                snapshot.sessions.map((s) => (
                  <DevSessionCard
                    key={s.sessionId}
                    session={s}
                    messages={jsonlStreams[s.sessionId] ?? []}
                    rawContent={rawJsonlCache[s.sessionId]}
                    onRequestRaw={requestRawJsonl}
                    showAllProtocol={showAllProtocol}
                    onToggleShowAllProtocol={setShowAllProtocol}
                  />
                ))
              )}
            </Section>
          </>
        )
      case 'protocol':
        return <DevProtocolTimeline entries={timeline} />
      case 'raw':
        return (
          <DevRawDataPanel
            snapshot={snapshot}
            events={events}
            chatId={chatId}
            onAction={executeAction}
            onClearEvents={clearEvents}
          />
        )
    }
  }

  return createPortal(
    <div
      style={{
        position: 'fixed',
        left: layout.x,
        top: layout.y,
        width: layout.w,
        height: layout.h,
        zIndex: 9999,
      }}
      className="bg-zinc-950 border border-zinc-800 rounded-lg flex flex-col shadow-2xl relative"
    >
      {/* Header */}
      <div
        onMouseDown={handleDragStart}
        className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 shrink-0 cursor-grab active:cursor-grabbing select-none"
      >
        <div className="flex items-center gap-2 min-w-0">
          <GripHorizontal size={12} className="text-zinc-600 shrink-0" />
          <span className="text-xs font-medium text-zinc-200 shrink-0">DevPanel</span>
          {chatTitle && <span className="text-[10px] text-zinc-400 truncate">— {chatTitle}</span>}
          <span className="text-[10px] text-zinc-600 font-mono shrink-0">{chatId.slice(0, 8)}</span>
          <span
            className={cn('text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0', MODE_BADGE_STYLE[mode])}
            title={MODE_BADGE_TITLE[mode]}
          >
            {MODE_BADGE_PREFIX[mode]}{mode}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={refreshSnapshot} className="text-zinc-500 hover:text-zinc-300 p-1" title="Refresh">
            <RefreshCw size={12} />
          </button>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 p-1" title="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex items-center border-b border-zinc-800 shrink-0 px-1">
        {TAB_ITEMS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors',
              activeTab === tab.id
                ? 'text-zinc-200 border-blue-500'
                : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:border-zinc-700',
            )}
          >
            {tab.label}
          </button>
        ))}
        {/* Pipeline health indicator */}
        {pipeline && (
          <div className="ml-auto pr-2 flex items-center gap-1">
            <div className={cn(
              'w-1.5 h-1.5 rounded-full',
              pipeline.health === 'green' ? 'bg-green-400' :
              pipeline.health === 'yellow' ? 'bg-yellow-400 animate-pulse' :
              'bg-red-400',
            )} />
          </div>
        )}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {renderTabContent()}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t border-zinc-800 text-[10px] text-zinc-600 shrink-0 rounded-b-lg flex items-center justify-between">
        <span>{t('dev.shortcutHint')}</span>
        <span className="font-mono text-zinc-500">
          Mode: {mode}
        </span>
      </div>

      {/* Resize handles */}
      <div onMouseDown={handleResizeStart('right')} className="absolute top-0 right-0 w-1 h-full cursor-ew-resize" />
      <div onMouseDown={handleResizeStart('bottom')} className="absolute bottom-0 left-0 h-1 w-full cursor-ns-resize" />
      <div onMouseDown={handleResizeStart('corner')} className="absolute bottom-0 right-0 w-3 h-3 cursor-nwse-resize" />
    </div>,
    document.body,
  )
}

export default DevPanel
