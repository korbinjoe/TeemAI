import { useState, useEffect, useCallback } from 'react'
import { Smartphone, Copy, Check, WifiOff } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { authFetch } from '@/config/api'
import QRCode from 'qrcode'

interface LanStatus {
  enabled: boolean
  lanIp: string
  port: number
  enabledAt: number | null
}

const RemoteControlSettings = () => {
  const [status, setStatus] = useState<LanStatus | null>(null)
  const [lanUrl, setLanUrl] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(false)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await authFetch('/api/lan/status')
      if (res.ok) setStatus(await res.json())
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    fetchStatus()
  }, [fetchStatus])

  useEffect(() => {
    if (!lanUrl) { setQrDataUrl(null); return }
    QRCode.toDataURL(lanUrl, {
      width: 160,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    }).then(setQrDataUrl).catch(() => {})
  }, [lanUrl])

  const handleToggle = async (checked: boolean) => {
    setLoading(true)
    try {
      if (checked) {
        const res = await authFetch('/api/lan/enable', { method: 'POST' })
        if (res.ok) {
          const data = await res.json()
          setLanUrl(data.lanUrl)
        }
      } else {
        await authFetch('/api/lan/disable', { method: 'POST' })
        setLanUrl(null)
      }
      await fetchStatus()
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!lanUrl) return
    await navigator.clipboard.writeText(lanUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const enabled = status?.enabled ?? false

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smartphone size={14} className="text-accent-brand" />
          <div>
            <div className="text-[13px] text-text-primary">Remote Control</div>
            <div className="mt-0.5 text-xs text-text-secondary">
              Control OpenTeam from your phone via LAN
            </div>
          </div>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={loading}
          aria-label="Toggle LAN access"
        />
      </div>

      {enabled && (
        <div className="mt-2 rounded-lg border border-border-subtle bg-bg-primary p-4">
          <div className="flex gap-5">
            <div className="shrink-0 rounded-lg bg-white p-2">
              {qrDataUrl ? (
                <img src={qrDataUrl} width={160} height={160} alt="QR code" className="block" />
              ) : (
                <div className="w-[160px] h-[160px]" />
              )}
            </div>

            <div className="flex flex-1 flex-col gap-3 min-w-0">
              <div>
                <div className="mb-1.5 text-xs font-medium text-text-secondary">
                  Scan with your phone camera
                </div>
                <div className="flex items-center gap-1.5">
                  <code className={cn(
                    'flex-1 truncate rounded border border-border-subtle bg-bg-input px-2.5 py-1.5',
                    'font-mono text-[11px] text-accent-brand-light',
                  )}>
                    {lanUrl ?? `http://${status?.lanIp}:${status?.port}/mobile`}
                  </code>
                  <button
                    onClick={handleCopy}
                    className={cn(
                      'shrink-0 rounded border border-border-subtle px-2 py-1.5 text-xs transition-colors',
                      copied
                        ? 'border-accent-green text-accent-green'
                        : 'text-text-secondary hover:border-accent-brand hover:bg-bg-hover',
                    )}
                    aria-label="Copy URL"
                  >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-text-muted w-14">LAN IP</span>
                  <span className="text-text-secondary">{status?.lanIp}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-text-muted w-14">Port</span>
                  <span className="text-text-secondary">{status?.port}</span>
                </div>
              </div>

              <div className="flex items-start gap-1.5 text-[11px] text-text-muted leading-relaxed">
                <WifiOff size={12} className="mt-0.5 shrink-0" />
                <span>Your phone must be on the same Wi-Fi network. Token resets when disabled or server restarts.</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default RemoteControlSettings
