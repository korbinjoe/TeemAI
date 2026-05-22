/**
 *
 * dev vite proxy  /api -> localhost:13001
 * preview express  API
 *
 *
 *  URL  ?token=xxxauthFetch()  HTTP
 * Authorization: Bearer getWsUrl()  WebSocket
 *  IP  localhost
 */

export const API_BASE = ''

export const getAuthToken = (): string | null => {
  try {
    const params = new URLSearchParams(window.location.search)
    return params.get('token')
  } catch {
    return null
  }
}

/**
 *  Bearer token  fetch
 *
 *  auth  localhost  Bearer token
 *  URL ?token=xxx  token  Authorization
 *  getAuthToken()  null fetch
 *
 *  fetch('/api/xxx', ...)  authFetch('/api/xxx', ...)
 */
export const authFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const token = getAuthToken()
  if (!token) return fetch(input, init)

  const headers = new Headers(init?.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}

export const getWsUrl = (): string => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const base = `${protocol}//${window.location.host}/ws`
  const token = getAuthToken()
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}
