import { describe, expect, it, vi } from 'vitest'
import { MissionAgentHandler } from '../ws/MissionAgentHandler'
import { compositeKey } from '../ws/MissionAgentSessionStore'

function makeWs() {
  const sent: any[] = []
  return {
    ws: {
      send: vi.fn((data: string) => sent.push(JSON.parse(data))),
      readyState: 1,
    } as any,
    sent,
  }
}

function makeHandler(chat: any, agentById: Record<string, any> = {}) {
  const handler = new MissionAgentHandler(
    {} as any,
    {} as any,
    { get: vi.fn((id: string) => agentById[id]) } as any,
    { get: vi.fn((id: string) => (id === chat.id ? chat : undefined)), update: vi.fn().mockResolvedValue(undefined) } as any,
    { get: vi.fn() } as any,
    {} as any,
    {} as any,
    undefined,
    {
      onSessionRemoved: vi.fn(),
      findByChat: vi.fn().mockReturnValue(null),
      findAllByChat: vi.fn().mockReturnValue([]),
    } as any,
    {} as any,
  )
  return handler
}

describe('MissionAgentHandler.handleList', () => {
  it('includes persisted mission agent sessions so terminal view can attach completed missions', () => {
    const handler = makeHandler(
      {
        id: 'chat-1',
        status: 'stopped',
        expertSessions: {
          'agent-a': { cliSessionId: 'cli-a', provider: 'codex', cwd: '/tmp/project', exitCode: 0 },
        },
      },
      { 'agent-a': { name: 'Agent A', icon: 'A' } },
    )
    const { ws, sent } = makeWs()

    handler.handleList(ws, 'conn-1', 'chat-1')

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      type: 'agent:list',
      payload: {
        chatId: 'chat-1',
        agents: [
          {
            agentId: 'agent-a',
            sessionId: 'cli-a',
            agentName: 'Agent A',
            agentIcon: 'A',
            status: 'completed',
            exitCode: 0,
            cwd: '/tmp/project',
          },
        ],
      },
    })
  })

  it('prefers runtime entries over persisted rows for the same agent', () => {
    const handler = makeHandler(
      {
        id: 'chat-1',
        status: 'running',
        expertSessions: {
          'agent-a': { cliSessionId: 'cli-a', provider: 'claude', cwd: '/tmp/project' },
          'agent-b': { cliSessionId: 'cli-b', provider: 'claude', cwd: '/tmp/project' },
        },
      },
      {
        'agent-a': { name: 'Agent A', icon: 'A' },
        'agent-b': { name: 'Agent B', icon: 'B' },
      },
    )
    handler.getExpertStore().set(compositeKey('conn-1', 'chat-1', 'agent-a'), {
      sessionId: 'sess-live',
      acpClient: {} as any,
      agentName: 'Live Agent A',
      agentIcon: 'LA',
      cwd: '/tmp/live',
      cliSessionId: 'cli-a',
      provider: 'claude',
      connectionId: 'conn-1',
      chatId: 'chat-1',
    })
    const { ws, sent } = makeWs()

    handler.handleList(ws, 'conn-1', 'chat-1')

    const agents = sent[0].payload.agents
    expect(agents).toHaveLength(2)
    expect(agents.filter((agent: any) => agent.agentId === 'agent-a')).toHaveLength(1)
    expect(agents.find((agent: any) => agent.agentId === 'agent-a')).toMatchObject({
      agentId: 'agent-a',
      sessionId: 'sess-live',
      agentName: 'Live Agent A',
      status: 'running',
      cwd: '/tmp/live',
    })
    expect(agents.find((agent: any) => agent.agentId === 'agent-b')).toMatchObject({
      agentId: 'agent-b',
      sessionId: 'cli-b',
      agentName: 'Agent B',
      status: 'running',
      cwd: '/tmp/project',
    })
  })
})
