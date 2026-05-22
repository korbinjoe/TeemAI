// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useExpertActivities } from '../../hooks/useExpertActivities'
import type { AgentActivity } from '../../types/chat'

const activity = (overrides: Partial<AgentActivity> = {}): AgentActivity => ({
  phase: 'thinking',
  background: false,
  toolCount: 0,
  toolCompleted: 0,
  hasText: false,
  updatedAt: Date.now(),
  ...overrides,
})

describe('useExpertActivities', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('initial status is empty', () => {
    const { result } = renderHook(() => useExpertActivities())
    expect(result.current.expertActivities).toEqual({})
    expect(result.current.currentMergedActivity).toBeNull()
  })

  it('single expert activity → merged reflects directly', () => {
    const { result } = renderHook(() => useExpertActivities())
    act(() => {
      result.current.setExpertActivities({ agent1: activity({ phase: 'tool_running', toolCount: 3, toolCompleted: 1 }) })
    })
    expect(result.current.currentMergedActivity?.phase).toBe('tool_running')
    expect(result.current.currentMergedActivity?.toolCount).toBe(3)
  })

  it('multiple experts → phase merged by priority', () => {
    const { result } = renderHook(() => useExpertActivities())
    act(() => {
      result.current.setExpertActivities({
        agent1: activity({ phase: 'completed' }),
        agent2: activity({ phase: 'tool_running' }),
        agent3: activity({ phase: 'thinking' }),
      })
    })
    expect(result.current.currentMergedActivity?.phase).toBe('tool_running')
  })

  it('multiple experts → toolCount / cost accumulated', () => {
    const { result } = renderHook(() => useExpertActivities())
    act(() => {
      result.current.setExpertActivities({
        a1: activity({ toolCount: 5, toolCompleted: 3, cost: 0.01 }),
        a2: activity({ toolCount: 10, toolCompleted: 8, cost: 0.02 }),
      })
    })
    expect(result.current.currentMergedActivity?.toolCount).toBe(15)
    expect(result.current.currentMergedActivity?.toolCompleted).toBe(11)
    expect(result.current.currentMergedActivity?.cost).toBeCloseTo(0.03)
  })

  it('All completed + toolCompleted > 0 → Trigger showCompletion', () => {
    const { result } = renderHook(() => useExpertActivities())
    act(() => {
      result.current.setExpertActivities({
        a1: activity({ phase: 'completed', toolCompleted: 5 }),
      })
    })
    expect(result.current.showCompletion).toBe(true)
  })

  it('cleaned up 30s after completed', () => {
    const { result } = renderHook(() => useExpertActivities())
    act(() => {
      result.current.setExpertActivities({
        a1: activity({ phase: 'completed', toolCompleted: 1 }),
      })
    })
    expect(Object.keys(result.current.expertActivities)).toHaveLength(1)
    act(() => { vi.advanceTimersByTime(31_000) })
    expect(Object.keys(result.current.expertActivities)).toHaveLength(0)
  })
})
