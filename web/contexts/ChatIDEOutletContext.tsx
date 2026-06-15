import {
  useEffect,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from 'react'
import type { RightPanelProps } from '@/components/ide/RightPanel'

type Listener = () => void

const store = {
  snapshots: new Map<string, RightPanelProps>(),
  listeners: new Set<Listener>(),
}

const emit = () => {
  store.listeners.forEach((l) => l())
}

const snapshotFingerprint = (s: RightPanelProps): string => {
  const git = s.gitStatus
  return [
    s.chatId,
    s.workingDirectory ?? '',
    s.worktreePath ?? '',
    s.agentActive ? '1' : '0',
    s.changesTabRequest ?? 0,
    git?.branch ?? '',
    String(git?.changedFiles ?? 0),
    String(s.multiGitStatus?.size ?? 0),
    String(s.repositories?.length ?? 0),
  ].join('|')
}

const snapshotsEqual = (a: RightPanelProps, b: RightPanelProps): boolean =>
  snapshotFingerprint(a) === snapshotFingerprint(b)

const subscribe = (listener: Listener): (() => void) => {
  store.listeners.add(listener)
  return () => store.listeners.delete(listener)
}

const upsertSnapshot = (chatId: string, snapshot: RightPanelProps): void => {
  const existing = store.snapshots.get(chatId)
  if (existing && snapshotsEqual(existing, snapshot)) return
  store.snapshots.set(chatId, snapshot)
  emit()
}

const removeSnapshot = (chatId: string): void => {
  if (!store.snapshots.has(chatId)) return
  store.snapshots.delete(chatId)
  emit()
}

const getChatSnapshot = (chatId: string | null): RightPanelProps | null =>
  chatId ? store.snapshots.get(chatId) ?? null : null

/** RightPanel props for the active mission — stable IDE column reads this. */
export const useChatIDEOutletSnapshot = (chatId: string | null): RightPanelProps | null =>
  useSyncExternalStore(
    subscribe,
    () => getChatSnapshot(chatId),
    () => getChatSnapshot(chatId),
  )

/** Publish RightPanel props from the active ChatInstance (survives mission switches). */
export const useChatIDEOutletRegister = (
  enabled: boolean,
  chatId: string,
  snapshot: RightPanelProps,
) => {
  const snapshotRef = useRef(snapshot)
  snapshotRef.current = snapshot

  useLayoutEffect(() => {
    if (!enabled) return
    upsertSnapshot(chatId, snapshotRef.current)
  })

  useEffect(() => {
    if (!enabled) return
    return () => removeSnapshot(chatId)
  }, [enabled, chatId])
}

/** Test-only reset */
export const resetChatIDEOutletStore = (): void => {
  store.snapshots.clear()
  emit()
}

/** No-op provider kept for layout tree stability — store is module-scoped. */
export const ChatIDEOutletProvider = ({ children }: { children: React.ReactNode }) => children
