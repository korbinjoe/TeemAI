import { useMemo, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso'
import type { Message, AgentActivity } from '../../types/chat'
import type { AgentPersonality } from '../../types/agentConfig'
import type { MessageGroup } from './messages/groupMessages'
import { computeDividerLabels } from './messages/groupMessages'
import { UserMessage, AgentTurnCard } from './messages/MessageGroup'
import NewMessagesBadge from './indicators/NewMessagesBadge'
import { EmptyState, ThinkingIndicator } from './ChatPageWidgets'
import CompletionCeremony from './ceremonies/CompletionCeremony'

const MESSAGES_AREA_STYLE: React.CSSProperties = { flex: 1, position: 'relative', minHeight: 0, overflow: 'hidden' }
const VIRTUOSO_STYLE: React.CSSProperties = { height: '100%' }
const VIRTUOSO_REVEAL_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)'

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

const isCollapsedStructuredUserMessage = (content: string): boolean => {
  const trimmed = content.trimStart()
  if (content.startsWith('This session is being continued from a previous conversation')) return true
  if (content.startsWith('<!--OT_SLASH:')) return true
  if (content.startsWith('# AGENTS.md instructions for')) return true
  if (content.startsWith('<user_instructions>') || content.startsWith('<command-name>')) return true
  if (/^<[a-z][a-z0-9]*[-_][a-z0-9_-]*>/i.test(trimmed)) return true
  if (content.length <= 500) return false
  return (content.match(/^#{1,3}\s/gm) || []).length >= 2
}

const estimateWrappedLines = (content: string, charsPerLine = 92): number => {
  if (!content) return 1
  const physicalLines = content.split('\n').length
  const wrappedLines = Math.ceil(content.length / charsPerLine)
  return Math.max(physicalLines, wrappedLines, 1)
}

const estimateUserMessageHeight = (message: Message | null): number => {
  if (!message) return 0
  const content = message.content || ''
  const imageHeight = message.images?.length ? 92 : 0
  if (isCollapsedStructuredUserMessage(content)) return 58 + imageHeight
  const bodyLines = clamp(estimateWrappedLines(content), 1, 12)
  return 54 + bodyLines * 22 + imageHeight
}

const estimateExpandedAgentMessageHeight = (message: Message): number => {
  switch (message.type) {
    case 'text': {
      const lines = clamp(estimateWrappedLines(message.content || '', 96), 1, 10)
      return 32 + lines * 20
    }
    case 'thinking':
      return 22
    case 'toolUse': {
      const toolName = message.toolUse?.toolName
      if (toolName === 'AskUserQuestion' || toolName === 'ExitPlanMode') return 116
      if (toolName === 'TodoWrite') return 92
      return 23
    }
    case 'stats':
      return 22
    case 'error':
      return 28
    default:
      return 0
  }
}

const estimateAgentTurnHeight = (group: MessageGroup, expanded: boolean): number => {
  if (group.agentMessages.length === 0) return 0
  if (!expanded) {
    const hasText = group.agentMessages.some((m) => m.type === 'text' && !!m.content)
    const hasFileChange = group.agentMessages.some((m) => m.type === 'toolUse' && ['Write', 'Edit', 'MultiEdit'].includes(m.toolUse?.toolName || ''))
    const hasError = group.agentMessages.some((m) => (m.type === 'toolResult' && m.toolResult?.isError) || m.type === 'error')
    return 34 + (hasText || hasFileChange || hasError ? 58 : 0)
  }

  let detailHeight = 0
  for (const message of group.agentMessages) {
    detailHeight += estimateExpandedAgentMessageHeight(message)
  }
  return clamp(50 + detailHeight, 92, 4200)
}

const estimateGroupHeight = (group: MessageGroup, expanded: boolean, hasDivider: boolean): number => {
  const dividerHeight = hasDivider ? 28 : 0
  const orphanLabelHeight = group.userMessage ? 0 : 22
  return clamp(
    dividerHeight + orphanLabelHeight + estimateUserMessageHeight(group.userMessage) + estimateAgentTurnHeight(group, expanded) + 10,
    72,
    4600,
  )
}

interface HeightEstimateCacheEntry {
  signature: string
  height: number
}

const groupHeightSignature = (group: MessageGroup, expanded: boolean, hasDivider: boolean): string => {
  const user = group.userMessage
  const last = group.agentMessages[group.agentMessages.length - 1]
  return [
    expanded ? '1' : '0',
    hasDivider ? '1' : '0',
    user?.id ?? '',
    user?.content.length ?? 0,
    user?.images?.length ?? 0,
    group.agentMessages.length,
    last?.id ?? '',
    last?.type ?? '',
    last?.content?.length ?? 0,
    last?.toolUse?.toolName ?? '',
    last?.toolUse?.status ?? '',
    last?.toolResult?.isError ? '1' : '0',
    group.isStreaming ? '1' : '0',
  ].join('|')
}

const TimeDivider = ({ label }: { label: string }) => (
  <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
    <span style={{
      fontSize: 11,
      color: 'rgb(var(--text-muted))',
      background: 'rgb(var(--bg-hover-subtle) / var(--bg-hover-subtle-alpha))',
      padding: '2px 10px',
      borderRadius: 10,
      letterSpacing: 0.2,
      userSelect: 'none',
    }}>
      {label}
    </span>
  </div>
)

export interface ChatBodyProps {
  messages: Message[]
  groups: MessageGroup[]
  /** Stable key for the current view (locked agent id, filter agent id, or
   *  '__all__'). Drives Virtuoso remount + scroll reset on filter change. */
  viewKey: string | null
  currentMergedActivity: AgentActivity | null | undefined
  groupActivities: Record<string, AgentActivity>
  expertActivities: Record<string, AgentActivity>
  agentNames: Record<string, string>
  agentPersonalities: Record<string, AgentPersonality>
  thinking: boolean
  currentAgentName: string
  connected: boolean
  currentSessionId: string | null
  reconnecting: boolean
  showReconnected: boolean
  newMessageCount: number
  virtuosoRef: React.RefObject<VirtuosoHandle | null>
  onAtBottomChange: (atBottom: boolean) => void
  followOutput: () => 'auto' | false
  handleScrollToBottom: () => void
  handleAnswerQuestion: (agentId: string, answer: string) => void
  targetAgentId?: string | null
}

const ChatBody = ({
  messages, groups, viewKey, currentMergedActivity, groupActivities,
  expertActivities, agentNames, agentPersonalities,
  thinking, currentAgentName, connected, currentSessionId,
  reconnecting, showReconnected, newMessageCount,
  virtuosoRef, onAtBottomChange, followOutput,
  handleScrollToBottom, handleAnswerQuestion, targetAgentId,
}: ChatBodyProps) => {
  const { t } = useTranslation('chat')
  const totalGroups = groups.length
  const coldHydrationRef = useRef(messages.length === 0)
  const revealTimerRef = useRef<number | null>(null)
  const revealRafRef = useRef<number[]>([])
  const [initialLayoutReady, setInitialLayoutReady] = useState(() => messages.length > 0)
  const initialLayoutReadyRef = useRef(initialLayoutReady)
  const heightEstimateCacheRef = useRef<Map<string, HeightEstimateCacheEntry>>(new Map())

  useEffect(() => {
    initialLayoutReadyRef.current = initialLayoutReady
  }, [initialLayoutReady])

  const clearPendingReveal = useCallback(() => {
    if (revealTimerRef.current != null) {
      window.clearTimeout(revealTimerRef.current)
      revealTimerRef.current = null
    }
    if (revealRafRef.current.length > 0) {
      for (const raf of revealRafRef.current) window.cancelAnimationFrame(raf)
      revealRafRef.current = []
    }
  }, [])

  const scheduleInitialReveal = useCallback((delayMs = 72) => {
    if (messages.length === 0 || initialLayoutReadyRef.current) return
    clearPendingReveal()
    revealTimerRef.current = window.setTimeout(() => {
      revealTimerRef.current = null
      const raf1 = window.requestAnimationFrame(() => {
        const raf2 = window.requestAnimationFrame(() => {
          revealRafRef.current = []
          coldHydrationRef.current = false
          initialLayoutReadyRef.current = true
          setInitialLayoutReady(true)
        })
        revealRafRef.current.push(raf2)
      })
      revealRafRef.current.push(raf1)
    }, delayMs)
  }, [clearPendingReveal, messages.length])

  useEffect(() => {
    if (messages.length === 0) {
      coldHydrationRef.current = true
      clearPendingReveal()
      if (initialLayoutReadyRef.current) {
        initialLayoutReadyRef.current = false
        setInitialLayoutReady(false)
      }
      return
    }

    if (coldHydrationRef.current && !initialLayoutReadyRef.current) {
      scheduleInitialReveal(220)
    }
  }, [clearPendingReveal, messages.length, scheduleInitialReveal])

  useEffect(() => () => clearPendingReveal(), [clearPendingReveal])

  // Timestamp of the most recent message — drives the running indicator's
  // "time since last message" so users can tell if a task has stalled.
  const lastMessageTs = messages[messages.length - 1]?.timestamp ?? 0

  // Time-group dividers: anchor sections of the stream to a moment (今天/昨天/date)
  // so users can read the message timeline at a glance without per-message noise.
  const dividerLabels = useMemo(() => computeDividerLabels(groups), [groups])

  const heightEstimates = useMemo(() => {
    const prevCache = heightEstimateCacheRef.current
    const nextCache = new Map<string, HeightEstimateCacheEntry>()
    const estimates = groups.map((group, index) => {
      const expanded = index === totalGroups - 1
      const hasDivider = !!dividerLabels[index]
      const signature = groupHeightSignature(group, expanded, hasDivider)
      const cached = prevCache.get(group.id)
      if (cached?.signature === signature) {
        nextCache.set(group.id, cached)
        return cached.height
      }
      const height = estimateGroupHeight(group, expanded, hasDivider)
      nextCache.set(group.id, { signature, height })
      return height
    })
    heightEstimateCacheRef.current = nextCache
    return estimates
  }, [groups, totalGroups, dividerLabels])

  const defaultItemHeight = useMemo(() => {
    if (heightEstimates.length === 0) return 160
    const sample = heightEstimates.length > 64 ? heightEstimates.slice(-64) : heightEstimates
    const sorted = [...sample].sort((a, b) => a - b)
    return clamp(sorted[Math.floor(sorted.length * 0.75)] ?? sorted[sorted.length - 1] ?? 160, 120, 900)
  }, [heightEstimates])

  const handleInitialItemsRendered = useCallback(() => {
    scheduleInitialReveal(72)
  }, [scheduleInitialReveal])

  const handleInitialTotalListHeightChanged = useCallback((height: number) => {
    if (height > 0) scheduleInitialReveal(72)
  }, [scheduleInitialReveal])

  const renderItem = useCallback((index: number, group: MessageGroup) => {
    const isLast = index === totalGroups - 1
    const displayActivity = isLast ? currentMergedActivity ?? groupActivities[group.id] : groupActivities[group.id]
    const divider = dividerLabels[index]
    return (
      <div>
        {divider && <TimeDivider label={divider} />}
        {group.userMessage ? <UserMessage message={group.userMessage} agentNames={agentNames} agentPersonalities={agentPersonalities} /> : (
          <div style={{ padding: '8px 16px 2px', fontSize: 11, color: 'rgb(var(--text-muted))' }}>Agent Mission Progress</div>
        )}
        <AgentTurnCard
          group={group}
          activity={displayActivity}
          agentName={currentAgentName}
          agentNames={agentNames}
          agentPersonalities={agentPersonalities}
          defaultExpanded={isLast}
          onAnswerQuestion={handleAnswerQuestion}
          targetAgentId={targetAgentId}
        />
      </div>
    )
  }, [totalGroups, dividerLabels, currentMergedActivity, groupActivities, currentAgentName, agentNames, agentPersonalities, handleAnswerQuestion, targetAgentId])

  const computeKey = useCallback((_: number, group: MessageGroup) => group.id, [])

  const Header = useCallback(() => <div style={{ height: 8 }} />, [])

  const Footer = useCallback(() => (
    <div style={{ paddingBottom: 8 }}>
      {thinking && <ThinkingIndicator agentName={currentAgentName} activity={currentMergedActivity} lastMessageTs={lastMessageTs} />}
      {currentMergedActivity?.phase === 'completed' && !currentMergedActivity.exitReason && Object.keys(expertActivities).length > 0 && (
        <CompletionCeremony expertActivities={expertActivities} agentNames={agentNames} agentPersonalities={agentPersonalities} />
      )}
    </div>
  ), [thinking, currentAgentName, currentMergedActivity, expertActivities, agentNames, agentPersonalities, lastMessageTs])

  const components = useMemo(() => ({ Header, Footer }), [Header, Footer])
  const shouldConcealInitialLayout = messages.length > 0 && coldHydrationRef.current && !initialLayoutReady
  const virtuosoShellStyle = useMemo<React.CSSProperties>(() => ({
    height: '100%',
    visibility: shouldConcealInitialLayout ? 'hidden' : 'visible',
    opacity: shouldConcealInitialLayout ? 0 : 1,
    pointerEvents: shouldConcealInitialLayout ? 'none' : undefined,
    transition: `opacity 140ms ${VIRTUOSO_REVEAL_EASING}`,
  }), [shouldConcealInitialLayout])

  return (
    <div style={MESSAGES_AREA_STYLE} data-render-surface="chat-body">
      {(reconnecting || showReconnected) && messages.length > 0 && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 15,
          padding: '4px 12px',
          background: reconnecting ? 'rgb(var(--accent-yellow, 234 179 8) / 0.12)' : 'rgb(var(--accent-green) / 0.1)',
          borderBottom: `1px solid ${reconnecting ? 'rgb(var(--accent-yellow, 234 179 8) / 0.3)' : 'rgb(var(--accent-green) / 0.3)'}`,
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, fontWeight: 500,
          color: reconnecting ? 'rgb(var(--accent-yellow, 234 179 8))' : 'rgb(var(--accent-green))',
          transition: 'all 0.3s ease',
          animation: showReconnected && !reconnecting ? 'fadeIn 0.3s ease' : undefined,
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: reconnecting ? 'rgb(var(--accent-yellow, 234 179 8))' : 'rgb(var(--accent-green))',
            animation: reconnecting ? 'pulse 1.5s ease-in-out infinite' : undefined,
          }} />
          {reconnecting ? t('reconnection.reconnecting') : t('reconnection.reconnected')}
        </div>
      )}
      <NewMessagesBadge count={newMessageCount} onClick={handleScrollToBottom} />
      {messages.length === 0 ? (
        <EmptyState connected={connected} hasSession={!!currentSessionId} reconnecting={reconnecting} />
      ) : (
        <div style={virtuosoShellStyle} aria-hidden={shouldConcealInitialLayout || undefined}>
          <Virtuoso
            key={viewKey ?? '__all__'}
            ref={virtuosoRef}
            style={VIRTUOSO_STYLE}
            data={groups}
            computeItemKey={computeKey}
            itemContent={renderItem}
            followOutput={followOutput}
            atBottomStateChange={onAtBottomChange}
            atBottomThreshold={50}
            defaultItemHeight={defaultItemHeight}
            heightEstimates={heightEstimates}
            initialTopMostItemIndex={{ index: 'LAST', align: 'end' }}
            increaseViewportBy={{ top: 600, bottom: 600 }}
            itemsRendered={handleInitialItemsRendered}
            totalListHeightChanged={handleInitialTotalListHeightChanged}
            components={components}
          />
        </div>
      )}
    </div>
  )
}

export default ChatBody
