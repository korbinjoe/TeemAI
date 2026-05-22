/**
 * SortableChatTab —  Tab
 *
 *  ChatTabBar  tabs.map  dnd-kit useSortable
 *  Tab  Chrome / VSCode UX stopPropagation
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PHASE_STYLES } from '@/lib/agentPhaseConfig'
import type { AgentPhase } from '@/types/chat'
import type { ChatTabItem } from '@/contexts/ChatTabContext'

interface SortableChatTabProps {
  tab: ChatTabItem
  title: string
  workspaceName: string
  isActive: boolean
  phase: AgentPhase
  isWaiting: boolean
  isError: boolean
  isWaitingConfirm: boolean
  isUnread: boolean
  changedFiles: number
  showSeparator: boolean
  onActivate: () => void
  onClose: () => void
  onCloseOthers: () => void
  onCloseRight: () => void
  hasRight: boolean
  totalTabs: number
}

const SortableChatTab = ({
  tab, title, workspaceName, isActive, phase,
  isWaiting, isError, isWaitingConfirm, isUnread, changedFiles,
  showSeparator, onActivate, onClose,
  onCloseOthers, onCloseRight,
  hasRight, totalTabs,
}: SortableChatTabProps) => {
  const { t } = useTranslation('common')
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: tab.chatId })

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY })
  }, [])

  useEffect(() => {
    if (!contextMenu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null)
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [contextMenu])

  const phaseStyle = PHASE_STYLES[phase] || PHASE_STYLES.initializing
  const isWorking = phase === 'thinking' || phase === 'tool_running' || phase === 'responding'

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    WebkitAppRegion: 'no-drag',
  } as React.CSSProperties

  return (
    <>
    <button
      ref={setNodeRef}
      type="button"
      onClick={onActivate}
      onContextMenu={handleContextMenu}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'group relative flex items-center gap-1.5 px-3 h-8 min-w-[100px] max-w-[200px] transition-all duration-150 touch-none select-none rounded-t-lg',
        isActive
          ? 'bg-bg-primary/80 text-text-emphasis font-medium z-10'
          : [
              'text-text-muted hover:text-text-secondary hover:bg-white/[0.03]',
              showSeparator && 'before:content-[""] before:absolute before:right-0 before:top-[20%] before:h-[60%] before:w-px before:bg-white/[0.06]',
            ],
        !isActive && isWaiting && 'text-accent-yellow bg-accent-yellow/[0.05]',
        !isActive && isError && 'text-accent-red bg-accent-red/[0.04]',
        isDragging && 'opacity-60 z-20 shadow-lg cursor-grabbing',
      )}
      title={workspaceName ? `${workspaceName} / ${title}` : title}
    >

      {/* Top status border */}
      <span
        className="absolute top-0 left-1 right-1 h-[2px] rounded-b-full transition-all duration-200"
        style={{
          background: isActive || isWorking || isError || isWaiting
            ? phaseStyle.color
            : 'transparent',
          opacity: isActive ? 1 : 0.7,
          ...(isWorking ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}),
        }}
      />

      <span
        className={cn(
          'w-1.5 h-1.5 rounded-full shrink-0',
          phaseStyle.pulse && 'animate-pulse',
        )}
        style={{ background: phaseStyle.color }}
      />

      {/* Title */}
      <span className="text-xs truncate flex-1 text-left min-w-0">
        {title}
      </span>

      {changedFiles > 0 && !isWaitingConfirm && !isUnread && (
        <span className="shrink-0 text-[9px] font-mono text-text-muted opacity-70">
          {changedFiles}f
        </span>
      )}

      {isWaitingConfirm ? (
        <span
          className="shrink-0 w-[14px] h-[14px] flex items-center justify-center rounded-full bg-accent-yellow text-bg-primary text-[10px] font-bold leading-none"
          title={t('chatTab.needConfirm')}
        >
          !
        </span>
      ) : isUnread ? (
        <span
          className={cn(
            'shrink-0 w-1.5 h-1.5 rounded-full animate-pulse-attention',
            isError ? 'bg-accent-red' : 'bg-accent-brand',
          )}
          title={isError ? t('chatTab.error') : t('chatTab.completed')}
        />
      ) : null}

      <span
        role="button"
        tabIndex={0}
        onPointerDown={(e) => { e.stopPropagation() }}
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation()
            onClose()
          }
        }}
        className={cn(
          'w-4 h-4 flex items-center justify-center rounded-full hover:bg-bg-hover transition-opacity shrink-0',
          isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-100',
        )}
      >
        <X size={10} />
      </span>
    </button>

    {contextMenu && createPortal(
      <div
        ref={menuRef}
        className="fixed z-[9999] w-[220px] py-1 rounded-lg border border-border bg-bg-primary shadow-lg"
        style={{ left: contextMenu.x, top: contextMenu.y }}
      >
        <button
          type="button"
          className="w-full px-3 py-1.5 text-xs text-left text-text-secondary hover:bg-bg-hover-muted hover:text-text-emphasis transition-colors"
          onClick={() => { onClose(); setContextMenu(null) }}
        >
          {t('chatTab.close')}
        </button>
        <button
          type="button"
          disabled={totalTabs <= 1}
          className="w-full px-3 py-1.5 text-xs text-left text-text-secondary hover:bg-bg-hover-muted hover:text-text-emphasis transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          onClick={() => { onCloseOthers(); setContextMenu(null) }}
        >
          {t('chatTab.closeOthers')}
        </button>
        <button
          type="button"
          disabled={!hasRight}
          className="w-full px-3 py-1.5 text-xs text-left text-text-secondary hover:bg-bg-hover-muted hover:text-text-emphasis transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          onClick={() => { onCloseRight(); setContextMenu(null) }}
        >
          {t('chatTab.closeRight')}
        </button>
      </div>,
      document.body,
    )}
    </>
  )
}

export default SortableChatTab
