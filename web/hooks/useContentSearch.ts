import { useState, useCallback, useRef } from 'react'
import { API_BASE, authFetch } from '@/config/api'

export interface ContentMatch {
  line: number
  content: string
}

export interface ContentResult {
  file: string
  matches: ContentMatch[]
  root?: string
}

export const useContentSearch = (roots: string) => {
  const [results, setResults] = useState<ContentResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [truncated, setTruncated] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const search = useCallback(async (q: string, include?: string, exclude?: string) => {
    if (!q.trim()) {
      setResults([])
      setIsSearching(false)
      setTruncated(false)
      return
    }
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    setIsSearching(true)
    try {
      const rootList = roots ? roots.split(',') : []
      const fetches = rootList.map(async (root) => {
        const params = new URLSearchParams({ root, q, limit: '200' })
        if (include) params.set('include', include)
        if (exclude) params.set('exclude', exclude)
        const res = await authFetch(`${API_BASE}/api/search-content?${params}`, { signal: ctrl.signal })
        const data = await res.json()
        const items: ContentResult[] = (data.results || []).map((r: ContentResult) => ({ ...r, root }))
        return { items, truncated: data.truncated || false }
      })
      const settled = await Promise.allSettled(fetches)
      if (!ctrl.signal.aborted) {
        const allResults: ContentResult[] = []
        let anyTruncated = false
        for (const r of settled) {
          if (r.status === 'fulfilled') {
            allResults.push(...r.value.items)
            if (r.value.truncated) anyTruncated = true
          }
        }
        setResults(allResults)
        setTruncated(anyTruncated)
        setIsSearching(false)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (!ctrl.signal.aborted) setIsSearching(false)
    }
  }, [roots])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setResults([])
    setIsSearching(false)
    setTruncated(false)
  }, [])

  return { results, isSearching, truncated, search, clear, setResults, setTruncated }
}
