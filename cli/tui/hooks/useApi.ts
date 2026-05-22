/**
 * TUI REST API hook
 *  server  HTTP
 */

import { useState, useCallback } from 'react'
import http from 'http'

const request = (url: string, options: { method?: string; body?: unknown } = {}): Promise<any> => {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const postData = options.body ? JSON.stringify(options.body) : undefined

    const req = http.request(
      {
        hostname: urlObj.hostname,
        port: urlObj.port,
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: {
          ...(postData ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } : {}),
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch {
            resolve(data)
          }
        })
      },
    )

    req.on('error', reject)
    if (postData) req.write(postData)
    req.end()
  })
}

export const createApiClient = (baseUrl: string) => ({
  get: (path: string) => request(`${baseUrl}${path}`),
  post: (path: string, body?: unknown) => request(`${baseUrl}${path}`, { method: 'POST', body }),
  put: (path: string, body?: unknown) => request(`${baseUrl}${path}`, { method: 'PUT', body }),
  del: (path: string) => request(`${baseUrl}${path}`, { method: 'DELETE' }),
})

export type ApiClient = ReturnType<typeof createApiClient>

export const useApi = (baseUrl: string) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const api = createApiClient(baseUrl)

  const fetch = useCallback(async <T>(fn: () => Promise<T>): Promise<T | null> => {
    setLoading(true)
    setError(null)
    try {
      const result = await fn()
      return result
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  return { api, fetch, loading, error }
}
