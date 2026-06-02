import { useEffect, useState } from 'react'
import { Wifi, WifiOff } from 'lucide-react'
import { API_BASE, authFetch } from '@/config/api'
import { cn } from '@/lib/utils'

type Status = 'connected' | 'checking' | 'disconnected'

const ConnectionStatus = () => {
  const [status, setStatus] = useState<Status>('checking')

  useEffect(() => {
    let mounted = true

    const check = async () => {
      try {
        const res = await authFetch(`${API_BASE}/api/lan/status`)
        if (!mounted) return
        if (res.status === 401) {
          setStatus('disconnected')
          return
        }
        setStatus(res.ok ? 'connected' : 'disconnected')
      } catch {
        if (mounted) setStatus('disconnected')
      }
    }

    void check()
    const timer = setInterval(check, 10_000)
    return () => { mounted = false; clearInterval(timer) }
  }, [])

  if (status === 'connected') return null

  return (
    <div className={cn(
      'flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium',
      status === 'checking'
        ? 'bg-accent-yellow/20 text-accent-yellow'
        : 'bg-accent-red/20 text-accent-red',
    )}>
      {status === 'checking' ? (
        <>
          <Wifi size={14} className="animate-pulse" />
          <span>Connecting...</span>
        </>
      ) : (
        <>
          <WifiOff size={14} />
          <span>Connection lost — scan QR code again</span>
        </>
      )}
    </div>
  )
}

export default ConnectionStatus
