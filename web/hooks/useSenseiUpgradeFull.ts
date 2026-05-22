import { useState, useCallback, useRef } from 'react'
import { API_BASE, authFetch } from '@/config/api'
import { generateAvatar } from '@/services/agentApi'
import i18n from '@/i18n'
import type { SenseiLogEntry } from './useSenseiUpgrade'

type FullSuiteStatus = 'idle' | 'analyzing' | 'complete' | 'error'

export type FullSuiteSegment = 'identity' | 'agents' | 'soul'

export interface FullSuiteState {
  identity: string
  agents: string
  soul: string
}

interface CompletePayload {
  identity: string | null
  agents: string | null
  soul: string | null
  partialError?: string[]
}

interface UseSenseiUpgradeFullReturn {
  generate: (description: string) => Promise<void>
  retrySegment: (segment: FullSuiteSegment) => Promise<void>
  cancel: () => void
  apply: () => void
  dismiss: () => void
  status: FullSuiteStatus
  logs: SenseiLogEntry[]
  optimized: FullSuiteState
  partialError: FullSuiteSegment[]
  error: string | null
}

const SEGMENT_ORDER: FullSuiteSegment[] = ['identity', 'agents', 'soul']
const EMPTY_STATE: FullSuiteState = { identity: '', agents: '', soul: '' }

const parseNameAndAnimal = (
  identityRaw: string,
): { name?: string; animal?: string } => {
  const nameMatch = identityRaw.match(/^\s*name\s*:\s*(.+)$/im)
  const animalMatch = identityRaw.match(/^\s*animal\s*:\s*([a-zA-Z][a-zA-Z\s-]*)$/im)
  return {
    name: nameMatch?.[1]?.trim(),
    animal: animalMatch?.[1]?.trim().toLowerCase(),
  }
}

const fireAvatarGeneration = (agentId: string, name: string, animal: string): void => {
  if (!agentId) return
  void generateAvatar(agentId, { name, animal })
}

const useSenseiUpgradeFull = (
  agentId: string | undefined,
  current: FullSuiteState,
  onApply: (next: FullSuiteState) => void,
): UseSenseiUpgradeFullReturn => {
  const [status, setStatus] = useState<FullSuiteStatus>('idle')
  const [logs, setLogs] = useState<SenseiLogEntry[]>([])
  const [optimized, setOptimized] = useState<FullSuiteState>(EMPTY_STATE)
  const [partialError, setPartialError] = useState<FullSuiteSegment[]>([])
  const [error, setError] = useState<string | null>(null)

  const optimizedRef = useRef<FullSuiteState>(EMPTY_STATE)
  const lastDescriptionRef = useRef<string>('')
  const abortRef = useRef<AbortController | null>(null)
  const avatarTriggeredRef = useRef(false)

  const resetForNewRun = useCallback((preserveExisting: boolean) => {
    setStatus('analyzing')
    setLogs([])
    setError(null)
    if (!preserveExisting) {
      setOptimized(EMPTY_STATE)
      optimizedRef.current = EMPTY_STATE
      setPartialError([])
      avatarTriggeredRef.current = false
    }
  }, [])

  const runGenerate = useCallback(
    async (description: string, targetSegment?: FullSuiteSegment): Promise<void> => {
      if (!description.trim()) return

      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      resetForNewRun(!!targetSegment)
      lastDescriptionRef.current = description

      // Local accumulator for streaming payload
      const liveSections: FullSuiteState = { identity: '', agents: '', soul: '' }

      try {
        const response = await authFetch(`${API_BASE}/api/agents/generate-prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description, mode: 'full-suite' }),
          signal: controller.signal,
        })

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${await response.text()}`)
        }

        const reader = response.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const jsonStr = line.slice(6).trim()
            if (!jsonStr) continue
            try {
              const evt = JSON.parse(jsonStr) as {
                type: string
                text?: string
                content?: string
                error?: string
                payload?: CompletePayload
              }

              if (evt.type === 'stage' && evt.text) {
                setLogs((prev) => [
                  ...prev,
                  { time: Date.now(), text: evt.text!, type: 'stage' },
                ])
                continue
              }

              if (evt.type.startsWith('delta:') && evt.content) {
                const seg = evt.type.slice('delta:'.length) as FullSuiteSegment
                if (!SEGMENT_ORDER.includes(seg)) continue
                liveSections[seg] += evt.content
                setOptimized({ ...liveSections })

                // Fire-and-forget avatar trigger when name+animal extractable from identity
                if (
                  seg === 'identity' &&
                  agentId &&
                  !avatarTriggeredRef.current
                ) {
                  const parsed = parseNameAndAnimal(liveSections.identity)
                  if (parsed.name && parsed.animal) {
                    avatarTriggeredRef.current = true
                    fireAvatarGeneration(agentId, parsed.name, parsed.animal)
                  }
                }
                continue
              }

              if (evt.type === 'complete') {
                if (!evt.payload) {
                  setStatus('error')
                  setError(i18n.t('common:upgrade.incompatibleEvent'))
                  continue
                }

                const payload = evt.payload
                const next: FullSuiteState = targetSegment
                  ? { ...optimizedRef.current, [targetSegment]: payload[targetSegment] ?? '' }
                  : {
                      identity: payload.identity ?? '',
                      agents: payload.agents ?? '',
                      soul: payload.soul ?? '',
                    }

                optimizedRef.current = next
                setOptimized(next)
                setPartialError(
                  (payload.partialError ?? []).filter((s): s is FullSuiteSegment =>
                    SEGMENT_ORDER.includes(s as FullSuiteSegment),
                  ),
                )
                setStatus('complete')

                if (!targetSegment && agentId && !avatarTriggeredRef.current && payload.identity) {
                  const parsed = parseNameAndAnimal(payload.identity)
                  if (parsed.name && parsed.animal) {
                    avatarTriggeredRef.current = true
                    fireAvatarGeneration(agentId, parsed.name, parsed.animal)
                  }
                }
                continue
              }

              if (evt.type === 'error') {
                setStatus('error')
                setError(evt.error ?? 'Generation failed')
                continue
              }
            } catch {
              /* skip malformed */
            }
          }
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          setStatus('idle')
          return
        }
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Generation failed. Please retry.')
      }
    },
    [agentId, resetForNewRun],
  )

  const generate = useCallback(
    (description: string) => runGenerate(description),
    [runGenerate],
  )

  const retrySegment = useCallback(
    async (segment: FullSuiteSegment) => {
      const description = lastDescriptionRef.current
      if (!description) {
        setError(i18n.t('common:upgrade.retryMissingDescription'))
        return
      }
      await runGenerate(description, segment)
    },
    [runGenerate],
  )

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStatus('idle')
    setLogs([])
  }, [])

  const apply = useCallback(() => {
    const next = optimizedRef.current
    if (next.identity || next.agents || next.soul) {
      onApply({
        identity: next.identity || current.identity,
        agents: next.agents || current.agents,
        soul: next.soul || current.soul,
      })
    }
    setStatus('idle')
    setLogs([])
    setOptimized(EMPTY_STATE)
    optimizedRef.current = EMPTY_STATE
    setPartialError([])
  }, [current.identity, current.agents, current.soul, onApply])

  const dismiss = useCallback(() => {
    abortRef.current?.abort()
    setStatus('idle')
    setLogs([])
    setOptimized(EMPTY_STATE)
    optimizedRef.current = EMPTY_STATE
    setPartialError([])
    setError(null)
  }, [])

  return {
    generate,
    retrySegment,
    cancel,
    apply,
    dismiss,
    status,
    logs,
    optimized,
    partialError,
    error,
  }
}

export default useSenseiUpgradeFull
