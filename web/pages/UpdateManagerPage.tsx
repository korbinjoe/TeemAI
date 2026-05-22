import { useState, useEffect, useCallback } from 'react'
import {
  CloudDownload, RefreshCw, RotateCcw,
  AlertTriangle, CheckCircle, Monitor, Server, Package,
  ChevronDown, ChevronUp,
} from 'lucide-react'
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
  targetGroup: string[]
  autoRollback: { enabled: boolean, errorThreshold: number, windowMinutes: number }
}

interface ReleaseRecord {
  version: string
  manifest: VersionManifest
  strategy: ReleaseStrategy
  createdAt: string
  active: boolean
}

interface DeviceInfo {
  deviceId: string
  clientType: 'cli' | 'electron'
  currentVersion: string
  shellVersion: string
  platform: string
  lastSeen: string
}

interface UpdateAlert {
  id: string
  level: 'info' | 'warning' | 'critical'
  type: string
  title: string
  message: string
  version?: string
  timestamp: string
}

interface Metrics {
  totalDevices: number
  versionDistribution: Record<string, number>
  activeVersion: string | null
  recentErrors: { total: number, byVersion: Record<string, number>, byType: Record<string, number> }
  adoptionRate: number | null
  alerts: UpdateAlert[]
}

interface StorageStats {
  totalSize: number
  versionCount: number
  versions: Record<string, number>
}

const API = '/api/update'

const UpdateManagerPage = () => {
  const { t } = useTranslation('settings')
  const [tab, setTab] = useState<'overview' | 'releases' | 'devices' | 'alerts' | 'storage'>('overview')
  const [releases, setReleases] = useState<ReleaseRecord[]>([])
  const [devices, setDevices] = useState<DeviceInfo[]>([])
  const [distribution, setDistribution] = useState<Record<string, number>>({})
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [storage, setStorage] = useState<{ stats: StorageStats, versions: { version: string }[] } | null>(null)
  const [status, setStatus] = useState<{ currentVersion: string | null, installedVersions: string[], activeRelease: ReleaseRecord | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [strategyEdit, setStrategyEdit] = useState<{ version: string, percent: number } | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [releasesRes, devicesRes, statusRes, storageRes, metricsRes] = await Promise.all([
        fetch(`${API}/releases`).then((r) => r.json()),
        fetch(`${API}/devices`).then((r) => r.json()),
        fetch(`${API}/status`).then((r) => r.json()),
        fetch(`${API}/storage`).then((r) => r.json()),
        fetch(`${API}/metrics`).then((r) => r.json()).catch(() => null),
      ])
      setReleases(releasesRes.releases ?? [])
      setDevices(devicesRes.devices ?? [])
      setDistribution(devicesRes.distribution ?? {})
      setStatus(statusRes)
      setStorage(storageRes)
      setMetrics(metricsRes)
    } catch (err) {
      console.error('Failed to fetch update data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleRollback = async (targetVersion: string) => {
    if (!confirm(t('update.confirmRollback', { version: targetVersion }))) return
    await fetch(`${API}/rollback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetVersion }),
    })
    fetchAll()
  }

  const handleUpdateStrategy = async (version: string, percent: number) => {
    await fetch(`${API}/strategy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version, strategy: { rolloutPercent: percent } }),
    })
    setStrategyEdit(null)
    fetchAll()
  }

  const activeRelease = releases.find((r) => r.active)
  const totalDevices = Object.values(distribution).reduce((a, b) => a + b, 0)

  const tabs = [
    { id: 'overview' as const, labelKey: 'update.tabs.overview', icon: Monitor },
    { id: 'releases' as const, labelKey: 'update.tabs.releases', icon: Package },
    { id: 'devices' as const, labelKey: 'update.tabs.devices', icon: Server },
    { id: 'alerts' as const, labelKey: 'update.tabs.alerts', icon: AlertTriangle },
    { id: 'storage' as const, labelKey: 'update.tabs.storage', icon: CloudDownload },
  ]

  return (
    <div className="flex h-full flex-col bg-bg-primary">
      {/* Header */}
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border-subtle px-4">
        <div className="flex items-center gap-2">
          <CloudDownload size={14} className="text-text-secondary" />
          <span className="text-xs font-semibold text-text-primary">{t('update.title')}</span>
          {status?.currentVersion && (
            <span className="text-xs text-text-tertiary">
              {t('update.currentVersion', { version: status.currentVersion })}
            </span>
          )}
        </div>
        <button
          onClick={fetchAll}
          disabled={loading}
          className="p-1 rounded hover:bg-bg-hover-muted text-text-secondary cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border-subtle px-4 gap-0.5">
        {tabs.map(({ id, labelKey, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1 px-3 py-1.5 text-xs transition-colors cursor-pointer border-b-2',
              tab === id
                ? 'border-accent-brand text-text-emphasis font-medium'
                : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            <Icon size={12} />
            {t(labelKey)}
            {id === 'alerts' && metrics && metrics.alerts.length > 0 && (
              <span className="ml-1 px-1 py-0.5 rounded-full bg-red-500/10 text-red-500 text-[10px] leading-none">
                {metrics.alerts.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'overview' && (
          <OverviewTab
            activeRelease={activeRelease ?? null}
            distribution={distribution}
            totalDevices={totalDevices}
            metrics={metrics}
            onRollback={handleRollback}
            strategyEdit={strategyEdit}
            onStrategyEdit={setStrategyEdit}
            onUpdateStrategy={handleUpdateStrategy}
          />
        )}
        {tab === 'releases' && <ReleasesTab releases={releases} onRollback={handleRollback} />}
        {tab === 'devices' && <DevicesTab devices={devices} />}
        {tab === 'alerts' && <AlertsTab alerts={metrics?.alerts ?? []} />}
        {tab === 'storage' && <StorageTab storage={storage} />}
      </div>
    </div>
  )
}

// ── Overview Tab ──

const OverviewTab = ({
  activeRelease, distribution, totalDevices, metrics,
  onRollback, strategyEdit, onStrategyEdit, onUpdateStrategy,
}: {
  activeRelease: ReleaseRecord | null
  distribution: Record<string, number>
  totalDevices: number
  metrics: Metrics | null
  onRollback: (v: string) => void
  strategyEdit: { version: string, percent: number } | null
  onStrategyEdit: (v: { version: string, percent: number } | null) => void
  onUpdateStrategy: (v: string, p: number) => void
}) => {
  const { t } = useTranslation('settings')

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="grid grid-cols-4 gap-3">
        <MetricCard
          label={t('update.metrics.activeVersion')}
          value={activeRelease ? `v${activeRelease.version}` : '-'}
          sub={activeRelease ? t(`update.strategy.${activeRelease.strategy.type}`) : t('update.metrics.noRelease')}
        />
        <MetricCard
          label={t('update.metrics.onlineDevices')}
          value={String(totalDevices)}
          sub={t('update.metrics.versionCount', { count: Object.keys(distribution).length })}
        />
        <MetricCard
          label={t('update.metrics.adoptionRate')}
          value={metrics?.adoptionRate !== null && metrics?.adoptionRate !== undefined ? `${metrics.adoptionRate}%` : '-'}
          sub={t('update.metrics.adoptionSub')}
        />
        <MetricCard
          label={t('update.metrics.recentErrors')}
          value={String(metrics?.recentErrors.total ?? 0)}
          sub={t('update.metrics.recentErrorsSub')}
          alert={metrics ? metrics.recentErrors.total > 0 : undefined}
        />
      </div>

      {activeRelease && (
        <div className="border border-border-subtle rounded-lg p-4 bg-bg-secondary">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <CheckCircle size={14} className="text-accent-green" />
              <span className="text-sm font-medium text-text-emphasis">
                {t('update.release.currentRelease', { version: activeRelease.version })}
              </span>
              <StrategyBadge strategy={activeRelease.strategy} />
            </div>
            <div className="flex items-center gap-2">
              {activeRelease.strategy.type === 'gradual' && (
                <>
                  {strategyEdit?.version === activeRelease.version ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={strategyEdit.percent}
                        onChange={(e) => onStrategyEdit({ ...strategyEdit, percent: Number(e.target.value) })}
                        className="w-24 h-1"
                      />
                      <span className="text-xs text-text-secondary w-8">{strategyEdit.percent}%</span>
                      <button
                        onClick={() => onUpdateStrategy(activeRelease.version, strategyEdit.percent)}
                        className="text-xs px-2 py-0.5 rounded bg-accent-brand text-white cursor-pointer"
                      >
                        {t('update.release.confirm')}
                      </button>
                      <button
                        onClick={() => onStrategyEdit(null)}
                        className="text-xs px-2 py-0.5 rounded bg-bg-hover-muted text-text-secondary cursor-pointer"
                      >
                        {t('update.release.cancel')}
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => onStrategyEdit({ version: activeRelease.version, percent: activeRelease.strategy.rolloutPercent })}
                      className="text-xs px-2 py-1 rounded border border-border-subtle hover:bg-bg-hover-muted text-text-secondary cursor-pointer"
                    >
                      {t('update.release.adjustRollout')}
                    </button>
                  )}
                </>
              )}
              {activeRelease.manifest.rollbackTo && (
                <button
                  onClick={() => onRollback(activeRelease.manifest.rollbackTo!)}
                  className="text-xs px-2 py-1 rounded border border-red-500/20 text-red-500 hover:bg-red-500/5 cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw size={11} />
                  {t('update.release.rollbackTo', { version: activeRelease.manifest.rollbackTo })}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 text-xs text-text-secondary">
            <div>
              <span className="text-text-tertiary">{t('update.release.releaseTime')}</span>
              {formatTime(activeRelease.createdAt, t)}
            </div>
            <div>
              <span className="text-text-tertiary">{t('update.release.minShell')}</span>
              v{activeRelease.manifest.minShellVersion}
            </div>
            <div>
              <span className="text-text-tertiary">{t('update.release.rolloutPercent')}</span>
              {activeRelease.strategy.type === 'full' ? '100%' : `${activeRelease.strategy.rolloutPercent}%`}
            </div>
          </div>

          {activeRelease.manifest.changelog && (
            <div className="mt-2 text-xs text-text-tertiary">
              <span className="text-text-secondary">Changelog: </span>
              <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{activeRelease.manifest.changelog}</pre>
            </div>
          )}
        </div>
      )}

      {Object.keys(distribution).length > 0 && (
        <div className="border border-border-subtle rounded-lg p-4 bg-bg-secondary">
          <h3 className="text-xs font-medium text-text-emphasis mb-3">{t('update.versionDistribution')}</h3>
          <div className="space-y-2">
            {Object.entries(distribution)
              .sort(([, a], [, b]) => b - a)
              .map(([version, count]) => {
                const percent = totalDevices > 0 ? Math.round((count / totalDevices) * 100) : 0
                const isActive = version === activeRelease?.version
                return (
                  <div key={version} className="flex items-center gap-3">
                    <span className={cn('text-xs w-16 font-mono', isActive ? 'text-accent-brand font-medium' : 'text-text-secondary')}>
                      v{version}
                    </span>
                    <div className="flex-1 h-4 bg-bg-hover-muted rounded overflow-hidden">
                      <div
                        className={cn('h-full rounded transition-all', isActive ? 'bg-accent-brand' : 'bg-text-tertiary/30')}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <span className="text-xs text-text-tertiary w-20 text-right">
                      {count} ({percent}%)
                    </span>
                  </div>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}

const ReleasesTab = ({ releases, onRollback }: { releases: ReleaseRecord[], onRollback: (v: string) => void }) => {
  const { t } = useTranslation('settings')
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="max-w-4xl space-y-2">
      {releases.length === 0 && (
        <div className="text-sm text-text-tertiary py-8 text-center">{t('update.release.noRecords')}</div>
      )}
      {[...releases].reverse().map((r) => (
        <div key={`${r.version}-${r.createdAt}`} className="border border-border-subtle rounded-lg bg-bg-secondary overflow-hidden">
          <button
            className="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-bg-hover-muted"
            onClick={() => setExpanded(expanded === r.createdAt ? null : r.createdAt)}
          >
            <div className="flex items-center gap-2">
              <span className={cn('w-2 h-2 rounded-full', r.active ? 'bg-accent-green' : 'bg-text-tertiary/30')} />
              <span className="text-xs font-medium text-text-emphasis">v{r.version}</span>
              <StrategyBadge strategy={r.strategy} />
              {r.active && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-green/10 text-accent-green">{t('update.release.active')}</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-tertiary">{formatTime(r.createdAt, t)}</span>
              {expanded === r.createdAt ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </div>
          </button>

          {expanded === r.createdAt && (
            <div className="px-4 py-3 border-t border-border-subtle space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2 text-text-secondary">
                <div><span className="text-text-tertiary">{t('update.release.minShell')}</span>v{r.manifest.minShellVersion}</div>
                <div><span className="text-text-tertiary">{t('update.release.rolloutPercent')}</span>{r.strategy.rolloutPercent}%</div>
                <div>
                  <span className="text-text-tertiary">UI Bundle: </span>
                  {formatSize(r.manifest.bundles.ui.size)}
                </div>
                <div>
                  <span className="text-text-tertiary">Server Bundle: </span>
                  {formatSize(r.manifest.bundles.server.size)}
                </div>
              </div>
              {r.manifest.changelog && (
                <pre className="text-[11px] text-text-tertiary font-mono whitespace-pre-wrap">{r.manifest.changelog}</pre>
              )}
              {!r.active && (
                <button
                  onClick={() => onRollback(r.version)}
                  className="text-xs px-2 py-1 rounded border border-amber-500/20 text-amber-500 hover:bg-amber-500/5 cursor-pointer flex items-center gap-1"
                >
                  <RotateCcw size={11} />
                  {t('update.release.rollbackToThis')}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const DevicesTab = ({ devices }: { devices: DeviceInfo[] }) => {
  const { t } = useTranslation('settings')
  const headers = [
    t('update.devices.headers.deviceId'),
    t('update.devices.headers.type'),
    t('update.devices.headers.currentVersion'),
    t('update.devices.headers.shellVersion'),
    t('update.devices.headers.platform'),
    t('update.devices.headers.lastSeen'),
  ]

  return (
    <div className="max-w-4xl">
      {devices.length === 0 ? (
        <div className="text-sm text-text-tertiary py-8 text-center">{t('update.devices.noDevices')}</div>
      ) : (
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-bg-secondary z-10">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium text-text-tertiary border-b border-border-subtle">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.deviceId} className="border-b border-border-subtle hover:bg-bg-hover-muted">
                <td className="px-3 py-1.5 font-mono text-text-secondary">{d.deviceId.slice(0, 12)}...</td>
                <td className="px-3 py-1.5">
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-[10px]',
                    d.clientType === 'electron' ? 'bg-blue-500/10 text-blue-500' : 'bg-emerald-500/10 text-emerald-500',
                  )}>
                    {d.clientType}
                  </span>
                </td>
                <td className="px-3 py-1.5 font-mono text-text-primary">v{d.currentVersion}</td>
                <td className="px-3 py-1.5 text-text-secondary">v{d.shellVersion}</td>
                <td className="px-3 py-1.5 text-text-secondary">{d.platform}</td>
                <td className="px-3 py-1.5 text-text-tertiary">{formatTime(d.lastSeen, t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const AlertsTab = ({ alerts }: { alerts: UpdateAlert[] }) => {
  const { t } = useTranslation('settings')
  return (
  <div className="max-w-4xl space-y-2">
    {alerts.length === 0 && (
      <div className="text-sm text-text-tertiary py-8 text-center">{t('update.alerts.noAlerts')}</div>
    )}
    {[...alerts].reverse().map((a) => (
      <div
        key={a.id}
        className={cn(
          'border rounded-lg px-4 py-3',
          a.level === 'critical' ? 'border-red-500/30 bg-red-500/5' :
          a.level === 'warning' ? 'border-amber-500/30 bg-amber-500/5' :
          'border-border-subtle bg-bg-secondary',
        )}
      >
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle
            size={13}
            className={cn(
              a.level === 'critical' ? 'text-red-500' :
              a.level === 'warning' ? 'text-amber-500' :
              'text-blue-500',
            )}
          />
          <span className="text-xs font-medium text-text-emphasis">{a.title}</span>
          <span className={cn(
            'text-[10px] px-1.5 py-0.5 rounded',
            a.level === 'critical' ? 'bg-red-500/10 text-red-500' :
            a.level === 'warning' ? 'bg-amber-500/10 text-amber-500' :
            'bg-blue-500/10 text-blue-500',
          )}>
            {a.level}
          </span>
          <span className="text-[10px] text-text-tertiary ml-auto">{formatTime(a.timestamp, t)}</span>
        </div>
        <p className="text-xs text-text-secondary">{a.message}</p>
      </div>
    ))}
  </div>
  )
}

// ── Store Tab ──

const StorageTab = ({ storage }: { storage: { stats: StorageStats, versions: { version: string }[] } | null }) => {
  const { t } = useTranslation('settings')

  if (!storage) return <div className="text-sm text-text-tertiary py-8 text-center">{t('update.storage.loading')}</div>

  return (
    <div className="max-w-4xl space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label={t('update.storage.versionCount')} value={String(storage.stats.versionCount)} sub="bundle-store" />
        <MetricCard label={t('update.storage.totalSize')} value={formatSize(storage.stats.totalSize)} sub={t('update.storage.allVersions')} />
        <MetricCard label={t('update.storage.versionList')} value={storage.versions.map((v) => v.version).join(', ') || '-'} sub="" />
      </div>

      {Object.keys(storage.stats.versions).length > 0 && (
        <div className="border border-border-subtle rounded-lg p-4 bg-bg-secondary">
          <h3 className="text-xs font-medium text-text-emphasis mb-3">{t('update.storage.perVersion')}</h3>
          <div className="space-y-1">
            {Object.entries(storage.stats.versions).map(([version, size]) => (
              <div key={version} className="flex items-center justify-between text-xs">
                <span className="font-mono text-text-secondary">v{version}</span>
                <span className="text-text-tertiary">{formatSize(size)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const MetricCard = ({ label, value, sub, alert }: { label: string, value: string, sub: string, alert?: boolean }) => (
  <div className="border border-border-subtle rounded-lg p-3 bg-bg-secondary">
    <div className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">{label}</div>
    <div className={cn('text-lg font-semibold', alert ? 'text-red-500' : 'text-text-emphasis')}>{value}</div>
    {sub && <div className="text-[10px] text-text-tertiary mt-0.5">{sub}</div>}
  </div>
)

const StrategyBadge = ({ strategy }: { strategy: ReleaseStrategy }) => {
  const { t } = useTranslation('settings')
  const colors: Record<string, string> = {
    full: 'bg-accent-green/10 text-accent-green',
    gradual: 'bg-amber-500/10 text-amber-500',
    canary: 'bg-blue-500/10 text-blue-500',
    pinned: 'bg-purple-500/10 text-purple-500',
  }
  return (
    <span className={cn('text-[10px] px-1.5 py-0.5 rounded', colors[strategy.type] ?? 'bg-bg-hover-muted text-text-tertiary')}>
      {t(`update.strategy.${strategy.type}`)}
      {strategy.type === 'gradual' && ` ${strategy.rolloutPercent}%`}
    </span>
  )
}

const formatTime = (iso: string, t: (key: string, opts?: Record<string, unknown>) => string): string => {
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()

  if (diff < 60_000) return t('update.time.justNow')
  if (diff < 3600_000) return t('update.time.minutesAgo', { count: Math.floor(diff / 60_000) })
  if (diff < 86400_000) return t('update.time.hoursAgo', { count: Math.floor(diff / 3600_000) })

  return d.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default UpdateManagerPage
