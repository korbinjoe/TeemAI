import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getWebSocketClient } from '../services/WebSocketClient'

/**
 *  system:env-check WS Node.js/npm
 *  MainLayout
 */
export const useEnvCheck = () => {
  const { t } = useTranslation('common')
  const shownRef = useRef(false)

  useEffect(() => {
    const ws = getWebSocketClient()

    const handleEnvCheck = (data: { npmAvailable: boolean }) => {
      if (!shownRef.current && !data.npmAvailable) {
        shownRef.current = true
        toast.warning(t('envCheck.nodeNotFound'), {
          duration: Infinity,
          action: {
            label: t('envCheck.installLink'),
            onClick: () => window.open('https://nodejs.org/', '_blank'),
          },
        })
      }
    }

    ws.on('system:env-check', handleEnvCheck)
    return () => { ws.off('system:env-check', handleEnvCheck) }
  }, [t])
}
