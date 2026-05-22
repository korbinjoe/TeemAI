import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { AvatarStyleMode } from '@/types/agentConfig'
import { API_BASE, authFetch } from '@/config/api'

interface AvatarStyleContextValue {
  avatarStyle: AvatarStyleMode
  setAvatarStyle: (style: AvatarStyleMode) => void
}

const AvatarStyleContext = createContext<AvatarStyleContextValue>({
  avatarStyle: 'default',
  setAvatarStyle: () => {},
})

export const AvatarStyleProvider = ({ children }: { children: React.ReactNode }) => {
  const [avatarStyle, setStyle] = useState<AvatarStyleMode>('default')

  useEffect(() => {
    authFetch(`${API_BASE}/api/preferences/avatar-style`)
      .then((res) => res.json())
      .then((data) => {
        if (data.style && data.style !== 'default') setStyle(data.style)
      })
      .catch(() => {})
  }, [])

  const setAvatarStyle = useCallback((style: AvatarStyleMode) => {
    setStyle(style)
    authFetch(`${API_BASE}/api/preferences/avatar-style`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ style }),
    }).catch(() => {})
  }, [])

  return (
    <AvatarStyleContext.Provider value={{ avatarStyle, setAvatarStyle }}>
      {children}
    </AvatarStyleContext.Provider>
  )
}

export const useAvatarStyle = () => useContext(AvatarStyleContext)
