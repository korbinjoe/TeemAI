import GroupChatMessage, { type GroupMessage } from './GroupChatMessage'
import GroupChatInput from './GroupChatInput'

const MOCK_MESSAGES: GroupMessage[] = [
  { type: 'system', text: 'Task created: Implement user auth flow', time: '14:20' },
  { type: 'start', agent: 'Fullstack', agentId: 'agent-1', agentRole: 'lead', text: 'Agent Fullstack started at 14:20' },
  { type: 'msg', agent: 'Fullstack', agentId: 'agent-1', agentRole: 'lead', text: "I'll implement the user authentication flow with login, register, and session management." },
  { type: 'done', agent: 'Fullstack', agentId: 'agent-1', agentRole: 'lead', text: 'Write server/routes/auth.ts', meta: 'new' },
  { type: 'done', agent: 'Fullstack', agentId: 'agent-1', agentRole: 'lead', text: 'Write web/hooks/useAuth.ts', meta: 'new' },
  { type: 'handoff', text: 'Fullstack → Reviewer (handoff: review auth code)', time: '14:28' },
  { type: 'handoff', text: 'Fullstack → Shield (handoff: security audit)', time: '14:28' },
  { type: 'start', agent: 'Reviewer', agentId: 'agent-2', agentRole: 'worker', text: 'Agent Reviewer started at 14:33' },
  { type: 'tool', agent: 'Reviewer', agentId: 'agent-2', agentRole: 'worker', text: 'Read server/routes/auth.ts', meta: '128 lines' },
  { type: 'tool', agent: 'Reviewer', agentId: 'agent-2', agentRole: 'worker', text: 'Grep "password" in src/', meta: '3 matches' },
  { type: 'progress', agent: 'Reviewer', agentId: 'agent-2', agentRole: 'worker', text: 'Analyzing security patterns...' },
  { type: 'start', agent: 'Shield', agentId: 'agent-3', agentRole: 'worker', text: 'Agent Shield started at 14:20' },
  { type: 'tool', agent: 'Shield', agentId: 'agent-3', agentRole: 'worker', text: 'Read Dockerfile', meta: '42 lines' },
  { type: 'error', agent: 'Shield', agentId: 'agent-3', agentRole: 'worker', text: 'Permission denied: /etc/docker/daemon.json' },
  { type: 'waiting', agent: 'Fullstack', agentId: 'agent-1', agentRole: 'lead', text: 'Should I use JWT or session-based auth?' },
]

const MOCK_AGENTS = [
  { id: 'agent-1', agent: 'Fullstack' },
  { id: 'agent-2', agent: 'Reviewer' },
  { id: 'agent-3', agent: 'Shield' },
]

const GroupChat = () => (
  <div className="flex-1 flex flex-col overflow-hidden">
    <div className="flex-1 overflow-y-auto px-4 py-3">
      {MOCK_MESSAGES.map((msg, i) => (
        <GroupChatMessage key={i} msg={msg} />
      ))}
    </div>
    <GroupChatInput agents={MOCK_AGENTS} />
  </div>
)

export default GroupChat
