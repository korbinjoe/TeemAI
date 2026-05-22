/**
 *  API  —  fetch wrapper
 *
 * -  JSON /
 * -  2xx  ApiError
 *
 *   const agents = await api.get<Agent[]>('/api/agents')
 *   await api.post('/api/agents', { name: '...' })
 *   await api.delete(`/api/agents/${id}`)
 */

import { authFetch } from '@/config/api'

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body?: string,
  ) {
    super(`API Error ${status}: ${statusText}`)
    this.name = 'ApiError'
  }
}

async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const headers = new Headers(options?.headers)
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json')

  const res = await authFetch(url, {
    ...options,
    headers,
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new ApiError(res.status, res.statusText, body)
  }

  const text = await res.text()
  if (!text) return undefined as T

  return JSON.parse(text) as T
}

export const api = {
  get: <T>(url: string) => request<T>(url),

  post: <T>(url: string, body?: unknown) =>
    request<T>(url, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  put: <T>(url: string, body?: unknown) =>
    request<T>(url, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),

  delete: <T>(url: string) =>
    request<T>(url, { method: 'DELETE' }),
}
