// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import useSenseiUpgradeFull, { type FullSuiteState } from '../../hooks/useSenseiUpgradeFull'

const ORIGINAL_FETCH = globalThis.fetch
const fetchMock = vi.fn()

const makeSseResponse = (events: string[]): Response => {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()
      for (const evt of events) {
        controller.enqueue(encoder.encode(`data: ${evt}\n\n`))
      }
      controller.close()
    },
  })
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

const EMPTY: FullSuiteState = { identity: '', agents: '', soul: '' }

beforeEach(() => {
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH
})

describe('useSenseiUpgradeFull', () => {
  it('parses delta events and complete payload, calls onApply with three sections', async () => {
    fetchMock.mockResolvedValueOnce(
      makeSseResponse([
        JSON.stringify({ type: 'stage', text: 'CurrentlyGenerate...' }),
        JSON.stringify({ type: 'delta:identity', content: 'name: Alice\nanimal: owl' }),
        JSON.stringify({ type: 'delta:agents', content: 'You are Alice...' }),
        JSON.stringify({ type: 'delta:soul', content: '## Personality\nRigorous' }),
        JSON.stringify({
          type: 'complete',
          payload: {
            identity: 'name: Alice\nanimal: owl',
            agents: 'You are Alice...',
            soul: '## Personality\nRigorous',
            partialError: [],
          },
        }),
      ]),
    )
    // generate-avatar fire-and-forget call (mock returns 200 ok)
    fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))

    const onApply = vi.fn()
    const { result } = renderHook(() =>
      useSenseiUpgradeFull('custom-001', EMPTY, onApply),
    )

    await act(async () => {
      await result.current.generate('A data analysis agent')
    })

    expect(result.current.status).toBe('complete')
    expect(result.current.optimized.identity).toContain('Alice')
    expect(result.current.optimized.agents).toContain('You are Alice')
    expect(result.current.optimized.soul).toContain('Rigorous')
    expect(result.current.partialError).toEqual([])

    act(() => result.current.apply())
    expect(onApply).toHaveBeenCalledWith({
      identity: 'name: Alice\nanimal: owl',
      agents: 'You are Alice...',
      soul: '## Personality\nRigorous',
    })
  })

  it('triggers fire-and-forget avatar generation after parsing name+animal', async () => {
    fetchMock.mockResolvedValueOnce(
      makeSseResponse([
        JSON.stringify({ type: 'delta:identity', content: 'name: Bob\nanimal: cat' }),
        JSON.stringify({
          type: 'complete',
          payload: { identity: 'name: Bob\nanimal: cat', agents: 'a', soul: 's' },
        }),
      ]),
    )
    fetchMock.mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }))

    const { result } = renderHook(() =>
      useSenseiUpgradeFull('custom-002', EMPTY, vi.fn()),
    )

    await act(async () => {
      await result.current.generate('cat agent')
    })

    await waitFor(() => {
      const avatarCall = fetchMock.mock.calls.find((c) =>
        String(c[0]).includes('/api/agents/generate-avatar'),
      )
      expect(avatarCall).toBeDefined()
      const body = JSON.parse(avatarCall![1].body as string)
      expect(body).toEqual({ agentId: 'custom-002', name: 'Bob', animal: 'cat' })
    })
  })

  it('does NOT trigger avatar twice across delta + complete fallback', async () => {
    fetchMock.mockResolvedValueOnce(
      makeSseResponse([
        JSON.stringify({ type: 'delta:identity', content: 'name: Bob\nanimal: cat' }),
        JSON.stringify({
          type: 'complete',
          payload: { identity: 'name: Bob\nanimal: cat', agents: 'a', soul: 's' },
        }),
      ]),
    )
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))

    const { result } = renderHook(() =>
      useSenseiUpgradeFull('custom-003', EMPTY, vi.fn()),
    )
    await act(async () => {
      await result.current.generate('x')
    })

    const avatarCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/api/agents/generate-avatar'),
    )
    expect(avatarCalls.length).toBe(1)
  })

  it('does not trigger avatar without agentId', async () => {
    fetchMock.mockResolvedValueOnce(
      makeSseResponse([
        JSON.stringify({ type: 'delta:identity', content: 'name: A\nanimal: owl' }),
        JSON.stringify({
          type: 'complete',
          payload: { identity: 'name: A\nanimal: owl', agents: 'a', soul: 's' },
        }),
      ]),
    )

    const { result } = renderHook(() =>
      useSenseiUpgradeFull(undefined, EMPTY, vi.fn()),
    )
    await act(async () => {
      await result.current.generate('x')
    })

    const avatarCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/api/agents/generate-avatar'),
    )
    expect(avatarCalls.length).toBe(0)
  })

  it('records partialError when SOUL section missing', async () => {
    fetchMock.mockResolvedValueOnce(
      makeSseResponse([
        JSON.stringify({
          type: 'complete',
          payload: {
            identity: 'name: A',
            agents: 'a',
            soul: null,
            partialError: ['soul'],
          },
        }),
      ]),
    )

    const { result } = renderHook(() =>
      useSenseiUpgradeFull('custom-004', EMPTY, vi.fn()),
    )
    await act(async () => {
      await result.current.generate('x')
    })

    expect(result.current.status).toBe('complete')
    expect(result.current.partialError).toEqual(['soul'])
    expect(result.current.optimized.soul).toBe('')
  })

  it('handles error events', async () => {
    fetchMock.mockResolvedValueOnce(
      makeSseResponse([
        JSON.stringify({ type: 'error', error: 'CLI unavailable' }),
      ]),
    )

    const { result } = renderHook(() =>
      useSenseiUpgradeFull('custom-005', EMPTY, vi.fn()),
    )
    await act(async () => {
      await result.current.generate('x')
    })

    expect(result.current.status).toBe('error')
    expect(result.current.error).toBe('CLI unavailable')
  })

  it('retrySegment only updates the targeted segment', async () => {
    // First generate full
    fetchMock.mockResolvedValueOnce(
      makeSseResponse([
        JSON.stringify({
          type: 'complete',
          payload: { identity: 'name: A', agents: 'AG1', soul: 'S1' },
        }),
      ]),
    )
    // Avatar fire-and-forget (no name+animal so no actual call), then retry
    fetchMock.mockResolvedValueOnce(
      makeSseResponse([
        JSON.stringify({
          type: 'complete',
          payload: { identity: 'name: A', agents: 'AG2_RETRIED', soul: 'S2_IGNORED' },
        }),
      ]),
    )

    const onApply = vi.fn()
    const { result } = renderHook(() =>
      useSenseiUpgradeFull('custom-006', EMPTY, onApply),
    )

    await act(async () => {
      await result.current.generate('first run')
    })
    await act(async () => {
      await result.current.retrySegment('agents')
    })

    expect(result.current.optimized.agents).toBe('AG2_RETRIED')
    expect(result.current.optimized.soul).toBe('S1')
  })
})
