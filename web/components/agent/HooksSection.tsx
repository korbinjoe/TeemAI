import { Plus, Trash2 } from 'lucide-react'
import type { Agent, HookEntry } from '../../types/agentConfig'
import { Section } from './Section'

const HOOK_EVENTS = ['PreToolUse', 'PostToolUse', 'Notification', 'Stop'] as const
type HookEvent = typeof HOOK_EVENTS[number]

const HooksSection = ({ hooks, onChange, disabled }: {
  hooks: Agent['hooks']
  onChange: (v: Agent['hooks']) => void
  disabled: boolean
}) => {
  const handleAddHook = (event: HookEvent) => {
    const current = hooks || {}
    const entries = current[event] || []
    const newEntry: HookEntry = { hooks: [{ type: 'command', command: '' }] }
    onChange({ ...current, [event]: [...entries, newEntry] })
  }

  const handleUpdateCommand = (event: HookEvent, entryIdx: number, command: string) => {
    const current = hooks || {}
    const entries = [...(current[event] || [])]
    entries[entryIdx] = { ...entries[entryIdx], hooks: [{ type: 'command', command }] }
    onChange({ ...current, [event]: entries })
  }

  const handleUpdateMatcher = (event: HookEvent, entryIdx: number, matcher: string) => {
    const current = hooks || {}
    const entries = [...(current[event] || [])]
    entries[entryIdx] = { ...entries[entryIdx], matcher: matcher || undefined }
    onChange({ ...current, [event]: entries })
  }

  const handleRemoveHook = (event: HookEvent, entryIdx: number) => {
    const current = hooks || {}
    const entries = (current[event] || []).filter((_, i) => i !== entryIdx)
    const next = { ...current, [event]: entries }
    if (entries.length === 0) delete next[event]
    const hasAny = Object.values(next).some((v) => v && v.length > 0)
    onChange(hasAny ? next : undefined)
  }

  return (
    <Section title="Hooks">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {HOOK_EVENTS.map((event) => {
          const entries = hooks?.[event] || []
          return (
            <div key={event}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4,
              }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'rgb(var(--text-primary))' }}>{event}</span>
                {!disabled && (
                  <button
                    onClick={() => handleAddHook(event)}
                    aria-label={`Add ${event} hook`}
                    tabIndex={0}
                    className="p-1 text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <Plus size={11} />
                  </button>
                )}
              </div>
              {entries.length === 0 ? (
                <div style={{ fontSize: 11, color: 'rgb(var(--text-muted))', padding: '2px 0' }}>No hooks</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {entries.map((entry, idx) => (
                    <div key={idx} style={{
                      display: 'flex', gap: 6, alignItems: 'center',
                      padding: '4px 6px', borderRadius: 'var(--radius-sm)',
                      border: '1px solid rgb(var(--border-subtle))',
                    }}>
                      <input
                        placeholder="Matcher (optional)"
                        value={entry.matcher || ''}
                        onChange={(e) => handleUpdateMatcher(event, idx, e.target.value)}
                        disabled={disabled}
                        className="w-[140px] rounded-md border border-border bg-bg-input px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-brand disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <input
                        placeholder="Command"
                        value={entry.hooks[0]?.command || ''}
                        onChange={(e) => handleUpdateCommand(event, idx, e.target.value)}
                        disabled={disabled}
                        className="flex-1 rounded-md border border-border bg-bg-input px-2 py-1 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent-brand disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      {!disabled && (
                        <button
                          onClick={() => handleRemoveHook(event, idx)}
                          aria-label="Remove hook"
                          tabIndex={0}
                          className="p-1 text-red-400 hover:text-red-300 transition-colors"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

export default HooksSection
