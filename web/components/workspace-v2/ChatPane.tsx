import { useWorkspace } from '../../contexts/WorkspaceContext'
import { Square } from './icons'

const MOCK_AGENT_NAMES: Record<string, string> = {
  'agent-1': 'Fullstack',
  'agent-2': 'Reviewer',
  'agent-3': 'Shield',
  'agent-4': 'Designer',
}

const MOCK_MESSAGES: Record<string, { type: string; text: string; detail?: string }[]> = {
  'agent-1': [
    { type: 'start', text: 'Agent Fullstack started at 14:20' },
    { type: 'msg', text: "I'll implement the user authentication flow with login, register, and session management." },
    { type: 'done', text: 'Write server/routes/auth.ts', detail: 'new' },
    { type: 'done', text: 'Write web/hooks/useAuth.ts', detail: 'new' },
    { type: 'waiting', text: 'Should I use JWT or session-based auth?' },
  ],
  'agent-2': [
    { type: 'start', text: 'Agent Reviewer started at 14:33' },
    { type: 'tool', text: 'Read server/routes/auth.ts', detail: '128 lines' },
    { type: 'tool', text: 'Grep "password" in src/', detail: '3 matches' },
    { type: 'progress', text: 'Analyzing security patterns...' },
  ],
  'agent-3': [
    { type: 'start', text: 'Agent Shield started at 14:20' },
    { type: 'tool', text: 'Read Dockerfile', detail: '42 lines' },
    { type: 'done', text: 'Scanned docker-compose.yml' },
    { type: 'error', text: 'Permission denied: /etc/docker/daemon.json' },
  ],
  'agent-4': [
    { type: 'start', text: 'Agent Designer started at 14:32' },
    { type: 'msg', text: "I'll redesign the settings page with a cleaner layout using tabbed sections." },
    { type: 'tool', text: 'Read web/pages/SettingsPage.tsx', detail: '428 lines' },
    { type: 'tool', text: 'Read web/components/settings/', detail: '6 files' },
    { type: 'done', text: 'Write web/pages/SettingsPage.tsx', detail: '+84 -156' },
    { type: 'done', text: 'Write web/components/settings/SettingsTabs.tsx', detail: 'new' },
    { type: 'progress', text: 'Working on AppearanceTab...' },
  ],
}

const ChatPane = () => {
  const { selectedAgentId } = useWorkspace()
  const agentId = selectedAgentId || 'agent-4'
  const agentName = MOCK_AGENT_NAMES[agentId] || 'Agent'
  const messages = MOCK_MESSAGES[agentId] || MOCK_MESSAGES['agent-4']!

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-3 font-mono text-[11.5px] leading-relaxed">
        {messages.map((m, i) => (
          <ChatMessageLine key={i} msg={m} />
        ))}
      </div>

      <div className="px-3 py-2 border-t border-border-subtle flex items-center gap-1.5 flex-shrink-0">
        <div className="flex-1 flex items-center gap-1.5 px-3 py-2 rounded-[7px] border border-border bg-bg-tertiary">
          <input
            className="flex-1 bg-transparent border-none outline-none text-xs text-text-primary font-sans placeholder:text-text-muted"
            placeholder={`Message ${agentName}...`}
          />
          <span className="font-mono text-[9px] text-text-muted">↵</span>
        </div>
        <button
          className="w-7 h-7 rounded-md border border-accent-red/20 bg-accent-red/[0.06] flex items-center justify-center cursor-pointer"
          title="Stop"
        >
          <Square size={9} className="text-accent-red" />
        </button>
      </div>
    </div>
  )
}

const ChatMessageLine = ({ msg }: { msg: { type: string; text: string; detail?: string } }) => {
  if (msg.type === 'start') {
    return (
      <div className="text-text-muted mb-1">
        <span className="text-accent-green">●</span> {msg.text}
      </div>
    )
  }
  if (msg.type === 'msg') {
    return (
      <div className="text-text-secondary mb-2.5 border-l-2 border-border pl-2.5 font-sans text-xs">
        {msg.text}
      </div>
    )
  }
  if (msg.type === 'tool') {
    return (
      <div className="text-text-muted mb-1">
        <span className="text-accent-yellow">⚡</span> {msg.text}
        {msg.detail && <span className="text-text-muted"> ({msg.detail})</span>}
      </div>
    )
  }
  if (msg.type === 'done') {
    return (
      <div className="text-text-muted mb-1">
        <span className="text-accent-green">✓</span> {msg.text}
        {msg.detail && <span className="text-accent-green"> {msg.detail}</span>}
      </div>
    )
  }
  if (msg.type === 'error') {
    return (
      <div className="text-accent-red mb-1">
        <span>✗</span> {msg.text}
      </div>
    )
  }
  if (msg.type === 'waiting') {
    return (
      <div className="text-accent-yellow mb-1 flex items-center gap-1.5 mt-2">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-yellow" />
        <span className="text-[11px]">{msg.text}</span>
      </div>
    )
  }
  if (msg.type === 'progress') {
    return (
      <div className="flex items-center gap-1.5 mt-2">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-brand animate-pulse" />
        <span className="text-[11px] text-accent-brand-light">{msg.text}</span>
      </div>
    )
  }
  return null
}

export default ChatPane
