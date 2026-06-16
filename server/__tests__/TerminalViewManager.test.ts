import { describe, expect, it, vi, beforeEach } from 'vitest'

const ptyMock = vi.hoisted(() => ({
  ptys: [] as any[],
  spawn: vi.fn(),
}))

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

vi.mock('../lib/resolveCliCommand', () => ({
  resolveCliCommandAsync: vi.fn(async (command: string) => command),
  resolveInterpreter: vi.fn((command: string) => ({ command, prependArgs: [] })),
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
    ptyMock.ptys.length = 0
    ptyMock.spawn.mockClear()
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
})
