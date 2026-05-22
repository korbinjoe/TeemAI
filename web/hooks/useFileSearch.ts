import { useEffect, useRef, useState } from 'react'
import { API_BASE } from '@/config/api'

export interface FileSearchResult {
  name: string
  path: string
  type: 'file' | 'directory'
  root?: string
}

const DEBOUNCE_MS = 180

export const useFileSearch = (cwd: string | null | undefined, query: string, enabled = true) => {
  const [results, setResults] = useState<FileSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [settled, setSettled] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    abortRef.current?.abort()
    setSettled(false)
    if (!enabled || !cwd) {
      setResults([])
      setSettled(true)
      setLoading(false)
      return
    }

    const ctrl = new AbortController()
    abortRef.current = ctrl
    setLoading(true)

    const cwdList = cwd.split(',')

    const timer = window.setTimeout(async () => {
      try {
        const fetches = cwdList.map(async (root) => {
          const url = `${API_BASE}/api/search-files?root=${encodeURIComponent(root)}&q=${encodeURIComponent(query)}`
          const res = await fetch(url, { signal: ctrl.signal })
          if (!res.ok) return []
          const data = await res.json()
          const items: FileSearchResult[] = Array.isArray(data.results) ? data.results : []
          if (cwdList.length > 1) {
            return items.map(item => ({ ...item, root }))
          }
          return items
        })
        const settled = await Promise.allSettled(fetches)
        const results: FileSearchResult[] = []
        for (const r of settled) {
          if (r.status === 'fulfilled') results.push(...r.value)
        }
        setResults(results)
      } catch (err) {
        if ((err as { name?: string })?.name !== 'AbortError') {
          setResults([])
        }
      } finally {
        if (!ctrl.signal.aborted) {
          setLoading(false)
          setSettled(true)
        }
      }
    }, DEBOUNCE_MS)

    return () => {
      window.clearTimeout(timer)
      ctrl.abort()
    }
  }, [cwd, query, enabled])

  return { results, loading, settled }
}
