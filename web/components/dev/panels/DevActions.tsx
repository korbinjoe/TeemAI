import { RotateCcw, Download } from 'lucide-react'
import type { DevSnapshot, DevEvent } from '@/hooks/useDevPanel'
import { Section, ActionBtn } from './helpers'

export const DevActions = ({ chatId, snapshot, events, onAction }: {
  chatId: string
  snapshot: DevSnapshot | null
  events: DevEvent[]
  onAction: (action: string, params?: Record<string, unknown>) => void
}) => {
  const handleExportDiagnostic = () => {
    const report = {
      exportedAt: new Date().toISOString(),
      chatId,
      snapshot,
      recentEvents: events.slice(0, 200),
      environment: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        url: window.location.href,
      },
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dev-diagnostic-${chatId}-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Section title="Quick Actions">
      <div className="flex flex-wrap gap-1">
        <ActionBtn icon={<RotateCcw size={11} />} label="Restart Watcher" onClick={() => onAction('restart-watcher')} />
        <ActionBtn icon={<Download size={11} />} label="Export Diagnostic" onClick={handleExportDiagnostic} />
      </div>
    </Section>
  )
}
