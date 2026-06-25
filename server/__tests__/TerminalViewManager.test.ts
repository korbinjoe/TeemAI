import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ptyMock = vi.hoisted(() => ({
  ptys: [] as any[],
  spawn: vi.fn(),
}))

const codexEnvMock = vi.hoisted(() => ({
  resolveCodexProviderEnv: vi.fn(async () => ({ IDEALAB_API_TOKEN: 'from-config' })),
}))

const transcriptMock = vi.hoisted(() => {
  const watchers: any[] = []
  const resolveSessionTranscript = vi.fn((): any => null)
  class FakeSessionFileWatcher {
    handlers = new Map<string, Set<(payload: any) => void>>()
    messages: any[] = []
    start = vi.fn(async () => {})
    stop = vi.fn()

    constructor(
      public filePath: string,
      public parser: unknown,
    ) {
      watchers.push(this)
    }

    on(event: string, handler: (payload: any) => void) {
      const set = this.handlers.get(event) ?? new Set()
      set.add(handler)
      this.handlers.set(event, set)
      return this
    }

    emitEvent(event: string, payload: any) {
      for (const handler of this.handlers.get(event) ?? []) {
        handler(payload)
      }
    }

    getFullMessages() {
      return this.messages
    }
  }

  return {
    watchers,
    resolveSessionTranscript,
    SessionFileWatcher: vi.fn(function (filePath: string, parser: unknown) {
      return new FakeSessionFileWatcher(filePath, parser)
    }),
  }
})

vi.mock('node-pty', () => {
  ptyMock.spawn.mockImplementation((_command: string, _args: string[], _opts: Record<string, unknown>) => {
    const handlers: {
      data?: (data: string) => void
      exit?: (event: { exitCode?: number }) => void
    } = {}
    const fake = {
      pid: 123,
      onData: vi.fn((cb: (data: string) => void) => { handlers.data = cb }),
      onExit: vi.fn((cb: (event: { exitCode?: number }) => void) => { handlers.exit = cb }),
      write: vi.fn(),
      resize: vi.fn(),
      kill: vi.fn(() => handlers.exit?.({ exitCode: 0 })),
      emitData: (data: string) => handlers.data?.(data),
    }
    ptyMock.ptys.push(fake)
    return fake
  })
  return { spawn: ptyMock.spawn }
})

vi.mock('../lib/codexConfigEnv', () => ({
  resolveCodexProviderEnv: codexEnvMock.resolveCodexProviderEnv,
}))

vi.mock('../lib/resolveCliCommand', () => ({
  resolveCliCommandAsync: vi.fn(async (command: string) => command),
  resolveInterpreter: vi.fn((command: string) => ({ command, prependArgs: [] })),
}))

vi.mock('../terminal/SessionTranscript', () => ({
  resolveSessionTranscript: transcriptMock.resolveSessionTranscript,
}))

vi.mock('../terminal/SessionFileWatcher', () => ({
  SessionFileWatcher: transcriptMock.SessionFileWatcher,
}))

import { TerminalViewManager } from '../terminal/TerminalViewManager'

const makeWs = () => {
  const sent: any[] = []
  return {
    ws: {
      readyState: 1,
      send: vi.fn((frame: string) => sent.push(JSON.parse(frame))),
    } as any,
    sent,
  }
}

const makeManager = () => new TerminalViewManager(
  { findByChat: vi.fn(() => null) } as any,
  {
    get: vi.fn(() => ({
      expertSessions: {
        lead: {
          cliSessionId: 'cli-1',
          cwd: process.cwd(),
          provider: 'claude',
        },
      },
    })),
  } as any,
)

describe('TerminalViewManager replay snapshots', () => {
  beforeEach(() => {
    vi.useRealTimers()
    ptyMock.ptys.length = 0
    ptyMock.spawn.mockClear()
    codexEnvMock.resolveCodexProviderEnv.mockClear()
    transcriptMock.watchers.length = 0
    transcriptMock.resolveSessionTranscript.mockReset()
    transcriptMock.resolveSessionTranscript.mockReturnValue(null)
    transcriptMock.SessionFileWatcher.mockClear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits for printable data before the first snapshot and preserves prior control sequences', async () => {
    const manager = makeManager()
    const { ws, sent } = makeWs()

    await manager.handleAttach(ws, { chatId: 'chat-1', agentId: 'lead', cols: 80, rows: 24 }, 'conn-1')
    ptyMock.ptys[0].emitData('\x1b[?1049h')
    ptyMock.ptys[0].emitData('hello')

    const dataFrames = sent.filter(frame => frame.type === 'agent:data')
    expect(dataFrames).toHaveLength(2)
    expect(dataFrames[0].payload).toMatchObject({
      snapshot: false,
      data: '\x1b[?1049h',
    })
    expect(dataFrames[1].payload).toMatchObject({
      snapshot: true,
      data: '\x1b[?1049hhello',
    })
  })

  it('reuses an existing view PTY and replays buffered output on attach', async () => {
    const manager = makeManager()
    const { ws, sent } = makeWs()

    await manager.handleAttach(ws, { chatId: 'chat-1', agentId: 'lead', cols: 80, rows: 24 }, 'conn-1')
    ptyMock.ptys[0].emitData('\x1b[?1049h')
    ptyMock.ptys[0].emitData('hello')
    sent.length = 0

    await manager.handleAttach(ws, { chatId: 'chat-1', agentId: 'lead', cols: 100, rows: 30 }, 'conn-1')

    expect(ptyMock.spawn).toHaveBeenCalledTimes(1)
    expect(ptyMock.ptys[0].resize).toHaveBeenCalledWith(100, 30)
    expect(sent.map(frame => frame.type)).toEqual(['agent:view-attached', 'agent:data'])
    expect(sent[1].payload).toMatchObject({
      snapshot: true,
      data: '\x1b[?1049hhello',
      ptySize: { cols: 100, rows: 30 },
    })
  })

  it('shares one view PTY across connections and keeps it alive until the last detach', async () => {
    const manager = makeManager()
    const first = makeWs()
    const second = makeWs()

    await manager.handleAttach(first.ws, { chatId: 'chat-1', agentId: 'lead', cols: 80, rows: 24 }, 'conn-1')
    await manager.handleAttach(second.ws, { chatId: 'chat-1', agentId: 'lead', cols: 90, rows: 28 }, 'conn-2')

    expect(ptyMock.spawn).toHaveBeenCalledTimes(1)
    expect(manager.has('conn-1', 'chat-1', 'lead')).toBe(true)
    expect(manager.has('conn-2', 'chat-1', 'lead')).toBe(true)

    ptyMock.ptys[0].emitData('shared')
    expect(first.sent.some(frame => frame.type === 'agent:data' && frame.payload.data.includes('shared'))).toBe(true)
    expect(second.sent.some(frame => frame.type === 'agent:data' && frame.payload.data.includes('shared'))).toBe(true)

    manager.handleDetach({ chatId: 'chat-1', agentId: 'lead' }, 'conn-1')
    expect(manager.has('conn-1', 'chat-1', 'lead')).toBe(false)
    expect(manager.has('conn-2', 'chat-1', 'lead')).toBe(true)
    expect(ptyMock.ptys[0].kill).not.toHaveBeenCalled()
  })

  it('injects Codex provider env into terminal resume PTY', async () => {
    const cwd = process.cwd()
    const manager = new TerminalViewManager(
      { findByChat: vi.fn(() => null) } as any,
      {
        get: vi.fn(() => ({
          expertSessions: {
            'fullstack-engineer': {
              cliSessionId: 'codex-thread-1',
              cwd,
              provider: 'codex',
            },
          },
        })),
      } as any,
    )
    const { ws } = makeWs()

    await manager.handleAttach(ws, {
      chatId: 'chat-1',
      agentId: 'fullstack-engineer',
      cols: 80,
      rows: 24,
    }, 'conn-1')

    expect(codexEnvMock.resolveCodexProviderEnv).toHaveBeenCalledWith(cwd)
    expect(ptyMock.spawn).toHaveBeenCalledWith(
      'codex',
      ['resume', '--include-non-interactive', 'codex-thread-1'],
      expect.objectContaining({
        env: expect.objectContaining({
          IDEALAB_API_TOKEN: 'from-config',
          TERM: 'xterm-256color',
        }),
      }),
    )
  })

  it('emits structured transcript batches from the watched session JSONL', async () => {
    transcriptMock.resolveSessionTranscript.mockReturnValue({
      filePath: '/tmp/cli-1.jsonl',
      parser: { kind: 'test-parser' },
    })
    const manager = makeManager()
    const { ws, sent } = makeWs()

    await manager.handleAttach(ws, { chatId: 'chat-1', agentId: 'lead', cols: 80, rows: 24 }, 'conn-1')

    expect(transcriptMock.SessionFileWatcher).toHaveBeenCalledWith('/tmp/cli-1.jsonl', { kind: 'test-parser' })
    const watcher = transcriptMock.watchers[0]
    const fullMessage = {
      id: 'msg-1',
      role: 'user',
      content: 'hello',
      timestamp: 1,
      type: 'text',
    }
    const deltaMessage = {
      id: 'msg-2',
      role: 'agent',
      content: 'world',
      timestamp: 2,
      type: 'text',
    }

    watcher.emitEvent('message:full', { messages: [fullMessage] })
    watcher.emitEvent('message:delta', { newMessages: [deltaMessage], replacedStatsId: 'stats-0' })

    const structured = sent.filter(frame => frame.type === 'agent:structured-message')
    expect(structured).toHaveLength(2)
    expect(structured[0].payload).toMatchObject({
      agentId: 'lead',
      chatId: 'chat-1',
      sessionId: 'cli-1',
      type: 'full',
      messages: [fullMessage],
      replacedStatsId: null,
    })
    expect(structured[1].payload).toMatchObject({
      agentId: 'lead',
      chatId: 'chat-1',
      sessionId: 'cli-1',
      type: 'delta',
      messages: [deltaMessage],
      replacedStatsId: 'stats-0',
    })
  })

  it('renders a JSONL transcript snapshot when the PTY has no printable output', async () => {
    transcriptMock.resolveSessionTranscript.mockReturnValue({
      filePath: '/tmp/cli-1.jsonl',
      parser: { kind: 'test-parser' },
    })
    const manager = makeManager()
    const { ws, sent } = makeWs()

    await manager.handleAttach(ws, { chatId: 'chat-1', agentId: 'lead', cols: 80, rows: 24 }, 'conn-1')
    vi.useFakeTimers()

    const watcher = transcriptMock.watchers[0]
    watcher.emitEvent('message:full', {
      messages: [
        { id: 'msg-1', role: 'user', content: 'hello from transcript', timestamp: 1, type: 'text' },
        { id: 'msg-2', role: 'agent', content: 'reply from jsonl', timestamp: 2, type: 'text' },
      ],
    })

    await vi.advanceTimersByTimeAsync(600)

    const fallbackFrame = sent.find(frame =>
      frame.type === 'agent:data' &&
      frame.payload.snapshot === true &&
      String(frame.payload.data).includes('Transcript loaded from session JSONL'),
    )
    expect(fallbackFrame?.payload.data).toContain('hello from transcript')
    expect(fallbackFrame?.payload.data).toContain('reply from jsonl')
  })
})
