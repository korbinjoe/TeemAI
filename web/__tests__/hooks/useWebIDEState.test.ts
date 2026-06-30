// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useWebIDEState } from '@/hooks/useWebIDEState'

const mocks = vi.hoisted(() => ({
  authFetch: vi.fn(),
}))

vi.mock('@/config/api', () => ({
  API_BASE: '',
  authFetch: mocks.authFetch,
}))

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

describe('useWebIDEState', () => {
  beforeEach(() => {
    mocks.authFetch.mockReset()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('bumps contentRevision when a same-length external refresh updates an open tab', async () => {
    const filePath = '/tmp/project/example.ts'
    mocks.authFetch.mockResolvedValueOnce(jsonResponse({ content: 'alpha = 1\n' }))

    const { result } = renderHook(() => useWebIDEState())

    await act(async () => {
      await result.current.openFile(filePath)
    })

    await waitFor(() => {
      expect(result.current.tabs[0]?.isLoading).toBe(false)
    })

    const initialTab = result.current.tabs[0]
    expect(initialTab?.content).toBe('alpha = 1\n')
    expect(initialTab?.contentRevision).toBeGreaterThan(0)

    vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ content: 'omega = 2\n' }))

    await act(async () => {
      await result.current.refreshOpenTabs()
    })

    const refreshedTab = result.current.tabs[0]
    expect(refreshedTab?.content).toBe('omega = 2\n')
    expect(refreshedTab?.originalContent).toBe('omega = 2\n')
    expect(refreshedTab?.content.length).toBe(initialTab?.content.length)
    expect(refreshedTab?.contentRevision).toBeGreaterThan(initialTab?.contentRevision ?? 0)
  })
})
