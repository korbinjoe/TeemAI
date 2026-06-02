import { useNavigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { chatStatusDot } from '@/components/workspace/MissionSessionRows'
import { useMobileMissions } from '../hooks/useMobileMissions'
import type { Chat } from '@/components/workspace/types'

const statusLabel = (chat: Chat): string => {
  const members = chat.members ?? []
  if (members.some((m) => m.status === 'waiting' || m.status === 'waiting_input')) return 'Needs attention'
  if (members.some((m) => m.status === 'error')) return 'Error'
  if (chat.status === 'running') return 'Running'
  if (chat.status === 'stopped') return 'Done'
  return 'Idle'
}

const MobileDashboard = () => {
  const { missions, loading, refresh } = useMobileMissions()
  const navigate = useNavigate()

  const active = missions.filter((m) => m.status === 'running' || m.status === 'idle')
  const recent = missions.filter((m) => m.status === 'stopped').slice(0, 10)

  return (
    <div className="px-4 pt-4 pb-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-text-primary">Missions</h1>
        <button
          type="button"
          onClick={() => void refresh()}
          className="p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading && missions.length === 0 && (
        <p className="text-sm text-text-secondary">Loading missions...</p>
      )}

      {!loading && missions.length === 0 && (
        <p className="text-sm text-text-secondary">No missions yet. Create one from your desktop.</p>
      )}

      {active.length > 0 && (
        <div className="mb-5">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-2">Active</div>
          <div className="flex flex-col gap-1.5">
            {active.map((m) => (
              <MissionCard key={m.id} chat={m} onClick={() => navigate(`/mobile/mission/${m.id}`)} />
            ))}
          </div>
        </div>
      )}

      {recent.length > 0 && (
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary mb-2">Recent</div>
          <div className="flex flex-col gap-1.5">
            {recent.map((m) => (
              <MissionCard key={m.id} chat={m} onClick={() => navigate(`/mobile/mission/${m.id}`)} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const MissionCard = ({ chat, onClick }: { chat: Chat; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center gap-3 rounded-lg border border-border-subtle bg-bg-secondary px-3 py-3 text-left transition-colors hover:bg-bg-hover active:bg-bg-hover w-full"
  >
    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', chatStatusDot(chat))} />
    <div className="flex-1 min-w-0">
      <div className="text-[13px] font-medium text-text-primary truncate">{chat.title || 'Untitled Mission'}</div>
      <div className="text-[11px] text-text-muted truncate mt-0.5">
        {chat.waitingReason || statusLabel(chat)}
      </div>
    </div>
  </button>
)

export default MobileDashboard
