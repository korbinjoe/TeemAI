import { useEffect, useState, useCallback } from 'react'

const STORAGE_KEY = 'teemai-mobile-token'

export const useMobileAuth = () => {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  )

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlToken = params.get('token')
    if (urlToken) {
      localStorage.setItem(STORAGE_KEY, urlToken)
      setToken(urlToken)
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [])

  const clearToken = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setToken(null)
  }, [])

  return { token, isAuthenticated: !!token, clearToken }
}
