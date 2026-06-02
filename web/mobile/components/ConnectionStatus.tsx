import { useEffect, useState } from 'react'
import { WifiOff } from 'lucide-react'
import { API_BASE, authFetch } from '@/config/api'

type Status = 'connected' | 'checking' | 'disconnected'

const ConnectionStatus = ({ inline = true }: { inline?: boolean }) => {
  const [status, setStatus] = useState<Status>('checking')

  useEffect(() => {
    let mounted = true

    const check = async () => {
      try {
        const res = await authFetch(`${API_BASE}/api/lan/status`)
        if (!mounted) return
        if (res.status === 401) { setStatus('disconnected'); return }
        setStatus(res.ok ? 'connected' : 'disconnected')
      } catch {
        if (mounted) setStatus('disconnected')
      }
    }

    void check()
    const timer = setInterval(check, 10_000)
    return () => { mounted = false; clearInterval(timer) }
  }, [])

  if (inline) {
    if (status === 'disconnected') {
      return (
        <div className="flex items-center gap-1.5 text-[11px] text-accent-red bg-accent-red/10 px-2.5 py-1 rounded-xl">
          <WifiOff size={12} />
          Disconnected
        </div>
      )
    }
    if (status === 'checking') return null
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-accent-green bg-accent-green/10 px-2.5 py-1 rounded-xl">
        <span className="w-1.5 h-1.5 bg-accent-green rounded-full animate-pulse" />
        Connected
      </div>
    )
  }

  if (status === 'connected' || status === 'checking') return null

  return (
    <div className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-accent-red/20 text-accent-red shrink-0">
      <WifiOff size={14} />
      <span>Connection lost — scan QR code again</span>
    </div>
  )
}

export default ConnectionStatus
