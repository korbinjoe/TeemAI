import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, CheckCircle, CloudDownload, RotateCcw, AlertTriangle, Package } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

interface BundleInfo {
  url: string
  sha256: string
  size: number
}

interface VersionManifest {
  version: string
  minShellVersion: string
  releaseDate: string
  bundles: { ui: BundleInfo, server: BundleInfo }
  changelog: string
  rollbackTo?: string
}

interface ReleaseStrategy {
  type: 'canary' | 'gradual' | 'full' | 'pinned'
  rolloutPercent: number
}

interface ReleaseRecord {
  version: string
  manifest: VersionManifest
  strategy: ReleaseStrategy
  createdAt: string
  active: boolean
}

interface UpdateStatus {
  currentVersion: string | null
  installedVersions: string[]
  activeRelease: ReleaseRecord | null
}

type CheckState = 'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'success' | 'error'

const API = '/api/update'

const UpdateSettings = () => {
  const { t } = useTranslation('settings')
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const [checkState, setCheckState] = useState<CheckState>('idle')
  const [updateInfo, setUpdateInfo] = useState<{ version: string, changelog: string } | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(true)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API}/status`)
      if (res.ok) {
        setStatus(await res.json())
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  const handleCheckUpdate = async () => {
    setCheckState('checking')
    setErrorMsg('')
    setUpdateInfo(null)

    try {
      const params = new URLSearchParams({ currentVersion: __APP_VERSION__ })
      const res = await fetch(`${API}/check-npm?${params}`)
      if (!res.ok) {
        setCheckState('error')
        setErrorMsg(t('updateSettings.cannotConnect'))
        return
      }

      const data = await res.json() as {
        hasUpdate: boolean
        currentVersion: string
        latestVersion: string | null
        error?: string
      }

      if (data.error) {
        setCheckState('error')
        setErrorMsg(data.error)
        return
      }

      if (data.hasUpdate && data.latestVersion) {
        setUpdateInfo({ version: data.latestVersion, changelog: '' })
        setCheckState('available')
      } else {
        setCheckState('up-to-date')
      }
    } catch (err) {
      setCheckState('error')
      setErrorMsg(err instanceof Error ? err.message : t('updateSettings.checkFailed2'))
    }
  }

  const handleRollback = async () => {
    if (!status || status.installedVersions.length < 2) return

    const currentIdx = status.installedVersions.indexOf(status.currentVersion ?? '')
    const previousVersion = currentIdx > 0
      ? status.installedVersions[currentIdx - 1]
      : status.installedVersions.find((v) => v !== status.currentVersion)

    if (!previousVersion) return
    if (!confirm(t('updateSettings.confirmRollback', { version: previousVersion }))) return

    try {
      const res = await fetch(`${API}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetVersion: previousVersion }),
      })
      if (res.ok) {
        fetchStatus()
        setCheckState('idle')
      }
    } catch {
      // ignore
    }
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-border-subtle bg-bg-secondary p-4">
        <div className="text-xs text-text-secondary">{t('updateSettings.loading')}</div>
      </div>
    )
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-secondary p-4 space-y-4">
      {/* CurrentVersion */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package size={14} className="text-text-secondary" />
          <div>
            <div className="text-[13px] text-text-primary">
              TeemAI
              <span className="ml-1.5 font-mono text-accent-brand font-medium">
                v{__APP_VERSION__}
              </span>
              {status?.currentVersion && status.currentVersion !== __APP_VERSION__ && (
                <span className="ml-1.5 font-mono text-text-tertiary text-xs">
                  (bundle v{status.currentVersion})
                </span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-text-secondary">
              {status?.installedVersions.length
                ? t('updateSettings.installed', { versions: status.installedVersions.map((v) => `v${v}`).join(', ') })
                : t('updateSettings.noInstalled')}
            </div>
          </div>
        </div>

        <button
          onClick={handleCheckUpdate}
          disabled={checkState === 'checking' || checkState === 'downloading'}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer',
            'border border-border-subtle hover:bg-bg-hover-muted text-text-primary',
            'disabled:opacity-50 disabled:cursor-not-allowed',
          )}
        >
          <RefreshCw size={12} className={cn(checkState === 'checking' && 'animate-spin')} />
          {checkState === 'checking' ? t('updateSettings.checking') : t('updateSettings.checkUpdate')}
        </button>
      </div>

      {checkState === 'up-to-date' && (
        <StatusBanner
          icon={<CheckCircle size={14} className="text-accent-green" />}
          bgClass="bg-green-500/5 border-green-500/20"
          title={t('updateSettings.upToDate')}
          sub={t('updateSettings.upToDateDesc')}
        />
      )}

      {checkState === 'available' && updateInfo && (
        <div className="rounded-md border border-accent-brand/20 bg-accent-brand/5 p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CloudDownload size={14} className="text-accent-brand" />
              <span className="text-xs font-medium text-text-emphasis">
                {t('updateSettings.newVersion', { version: updateInfo.version })}
              </span>
            </div>
            <span className="text-[11px] text-text-secondary font-mono">
              npm update teemai
            </span>
          </div>
          {updateInfo.changelog && (
            <pre className="mt-2 text-[11px] text-text-secondary font-mono whitespace-pre-wrap max-h-24 overflow-y-auto">
              {updateInfo.changelog}
            </pre>
          )}
        </div>
      )}

      {checkState === 'error' && (
        <StatusBanner
          icon={<AlertTriangle size={14} className="text-red-500" />}
          bgClass="bg-red-500/5 border-red-500/20"
          title={t('updateSettings.checkFailed')}
          sub={errorMsg}
        />
      )}

      {/* RollbackActions */}
      {status && status.installedVersions.length >= 2 && (
        <div className="flex items-center justify-between pt-1 border-t border-border-subtle">
          <div>
            <div className="text-[13px] text-text-primary">{t('updateSettings.rollbackTitle')}</div>
            <div className="mt-0.5 text-xs text-text-secondary">
              {t('updateSettings.rollbackDesc')}
            </div>
          </div>
          <button
            onClick={handleRollback}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer border border-amber-500/20 text-amber-600 hover:bg-amber-500/5"
          >
            <RotateCcw size={12} />
            {t('updateSettings.rollback')}
          </button>
        </div>
      )}

      {status?.activeRelease && (
        <div className="pt-1 border-t border-border-subtle">
          <div className="flex items-center gap-2 text-xs text-text-tertiary">
            <span>{t('updateSettings.activeRelease')}</span>
            <span className="font-mono text-text-secondary">v{status.activeRelease.version}</span>
            <span className={cn(
              'px-1.5 py-0.5 rounded text-[10px]',
              status.activeRelease.strategy.type === 'full'
                ? 'bg-green-500/10 text-green-600'
                : 'bg-amber-500/10 text-amber-600',
            )}>
              {t(`update.strategy.${status.activeRelease.strategy.type}`)}
              {status.activeRelease.strategy.type === 'gradual' && ` ${status.activeRelease.strategy.rolloutPercent}%`}
            </span>
            <span>{formatTime(status.activeRelease.createdAt, t)}</span>
          </div>
        </div>
      )}
    </div>
  )
}

const StatusBanner = ({ icon, bgClass, title, sub }: { icon: React.ReactNode, bgClass: string, title: string, sub: string }) => (
  <div className={cn('rounded-md border p-3 flex items-start gap-2', bgClass)}>
    <div className="mt-0.5">{icon}</div>
    <div>
      <div className="text-xs font-medium text-text-emphasis">{title}</div>
      {sub && <div className="text-[11px] text-text-secondary mt-0.5">{sub}</div>}
    </div>
  </div>
)

const formatTime = (iso: string, t: (key: string, opts?: Record<string, unknown>) => string): string => {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return t('update.time.justNow')
  if (diff < 3600_000) return t('update.time.minutesAgo', { count: Math.floor(diff / 60_000) })
  if (diff < 86400_000) return t('update.time.hoursAgo', { count: Math.floor(diff / 3600_000) })
  return d.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default UpdateSettings
