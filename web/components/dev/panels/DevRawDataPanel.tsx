import type { DevSnapshot, DevEvent } from '@/hooks/useDevPanel'
import { DevEventLog } from './DevEventLog'
import { DevActions } from './DevActions'

export const DevRawDataPanel = ({ snapshot, events, chatId, onAction, onClearEvents }: {
  snapshot: DevSnapshot
  events: DevEvent[]
  chatId: string
  onAction: (action: string, params?: Record<string, unknown>) => void
  onClearEvents: () => void
}) => {
  return (
    <div>
      <DevEventLog events={events} onClear={onClearEvents} />
      <DevActions chatId={chatId} snapshot={snapshot} events={events} onAction={onAction} />
    </div>
  )
}
