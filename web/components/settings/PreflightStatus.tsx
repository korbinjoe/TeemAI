import { CheckCircle, AlertTriangle, XCircle, RefreshCw, ExternalLink, Copy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { usePreflight, type PreflightItem } from '@/hooks/usePreflight'
import { toast } from 'sonner'
import i18n from '@/i18n'

const statusConfig = {
  pass: { icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-500/10' },
  warn: { icon: AlertTriangle, color: 'text-yellow-500', bg: 'bg-yellow-500/10' },
  fail: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-500/10' },
} as const

const OverallBadge = ({ status }: { status: 'pass' | 'warn' | 'fail' }) => {
  const cfg = statusConfig[status]
  const Icon = cfg.icon
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', cfg.bg, cfg.color)}>
      <Icon size={12} />
      {i18n.t(`common:preflight.${status}`)}
    </span>
  )
}

const handleCopy = (text: string) => {
  navigator.clipboard.writeText(text)
  toast.success(i18n.t('common:admin.copy'))
}

const CheckRow = ({ item }: { item: PreflightItem }) => {
  const cfg = statusConfig[item.status]
  const Icon = cfg.icon

  return (
    <div className="flex items-start gap-2.5 py-2 px-1">
      <Icon size={14} className={cn('mt-0.5 shrink-0', cfg.color)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-text-primary">{item.label}</span>
          {item.current && (
            <span className="text-xs text-text-secondary">{item.current}</span>
          )}
        </div>
        {item.hint && (
          <div className="mt-0.5 text-xs text-text-secondary">{item.hint}</div>
        )}
        {(item.fixCommand || item.fixUrl) && (
          <div className="mt-1 flex items-center gap-2">
            {item.fixCommand && (
              <button
                onClick={() => handleCopy(item.fixCommand!)}
                className="inline-flex items-center gap-1 rounded bg-bg-secondary px-1.5 py-0.5 text-xs font-mono text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors"
              >
                <Copy size={10} />
                {item.fixCommand}
              </button>
            )}
            {item.fixUrl && (
              <a
                href={item.fixUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-xs text-accent-brand hover:underline"
              >
                <ExternalLink size={10} />
                install
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

const PreflightStatus = () => {
  const { data, loading, recheck } = usePreflight()

  if (loading && !data) {
    return (
      <div className="text-xs text-text-secondary py-3">Detecting environment...</div>
    )
  }

  if (!data) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <OverallBadge status={data.overall} />
        <button
          onClick={recheck}
          disabled={loading}
          className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={cn(loading && 'animate-spin')} />
          Re-Detect
        </button>
      </div>
      <div className="divide-y divide-border-subtle">
        {data.items.map((item) => (
          <CheckRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  )
}

export default PreflightStatus
