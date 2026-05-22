import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DevEvent } from '@/hooks/useDevPanel'
import { Section, phaseColor, fmtTime } from './helpers'

const EventRow = ({ event }: { event: DevEvent }) => {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="group">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-1.5 text-[10px] py-0.5 hover:bg-zinc-800/50 rounded px-1"
      >
        <span className="text-zinc-600 font-mono shrink-0">{fmtTime(event.timestamp)}</span>
        <span className={cn('font-medium', phaseColor(event.type.split(':')[0]))}>{event.type}</span>
        {event.agentId && <span className="text-zinc-600">{event.agentId}</span>}
      </button>
      {expanded && event.data && (
        <pre className="text-[10px] font-mono text-zinc-500 bg-zinc-900/50 rounded px-2 py-1 ml-4 overflow-x-auto">
          {JSON.stringify(event.data, null, 2)}
        </pre>
      )}
    </div>
  )
}

export const DevEventLog = ({ events, onClear }: { events: DevEvent[]; onClear: () => void }) => {
  const { t } = useTranslation('chat')
  const [filter, setFilter] = useState('')
  const filtered = filter
    ? events.filter((e) => e.type.includes(filter))
    : events

  return (
    <Section title={`EventLog (${events.length})`}>
      <div className="flex items-center gap-1 mb-1">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="FilterEventType..."
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-300 placeholder:text-zinc-600 outline-none focus:border-zinc-500"
        />
        <button onClick={onClear} className="text-zinc-500 hover:text-zinc-300 p-0.5" title="Clear">
          <Trash2 size={12} />
        </button>
      </div>
      <div className="max-h-[300px] overflow-y-auto space-y-0.5">
        {filtered.length === 0 ? (
          <div className="text-xs text-zinc-600 italic py-2 text-center">{t('dev.noEvents')}</div>
        ) : (
          filtered.map((evt, i) => (
            <EventRow key={`${evt.timestamp}-${i}`} event={evt} />
          ))
        )}
      </div>
    </Section>
  )
}
