import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import express from 'express'
import { createServer, type Server } from 'http'
import { AddressInfo } from 'net'
import { WhiteboardManager } from '../whiteboard/WhiteboardManager'
import { createWhiteboardRoutes } from '../routes/chat/whiteboardRoutes'
import { WHITEBOARD_SUMMARY_MAX } from '../../shared/whiteboard-types'

const makeChatStore = (existingChatId?: string) => {
  const store = new Map<string, Record<string, unknown>>()
  if (existingChatId) store.set(existingChatId, { id: existingChatId })
  return {
    get: (id: string) => store.get(id),
    update: async (id: string, patch: Record<string, unknown>) => {
      const cur = store.get(id) ?? {}
      store.set(id, { ...cur, ...patch })
    },
  } as any
}

describe('whiteboardRoutes (HTTP smoke)', () => {
  let server: Server
  let baseUrl: string
  let wb: WhiteboardManager
  let broadcastEvents: Array<{ chatId: string; msg: Record<string, unknown> }>
  const chatId = `__route_${Date.now()}_${Math.floor(Math.random() * 1e6)}`

  beforeAll(async () => {
    wb = new WhiteboardManager()
    broadcastEvents = []
    const app = express()
    app.use(express.json())
    app.use(createWhiteboardRoutes({
      whiteboardManager: wb,
      chatStore: makeChatStore(chatId),
      broadcastToChat: (cid, msg) => { broadcastEvents.push({ chatId: cid, msg }) },
    }))
    server = createServer(app)
    await new Promise<void>((res) => server.listen(0, '127.0.0.1', res))
    const { port } = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${port}`
  })

  afterAll(async () => {
    await new Promise<void>((res) => server.close(() => res()))
    await wb.cleanupChat(chatId)
  })

  beforeEach(() => { broadcastEvents.length = 0 })

  it('POST entries → 201 + broadcasts entry-added', async () => {
    const r = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'goal', by: 'lead', summary: 'Test Target' }),
    })
    expect(r.status).toBe(201)
    const body = await r.json() as { entry: { id: string; summary: string } }
    expect(body.entry.summary).toBe('Test Target')
    expect(broadcastEvents).toHaveLength(1)
    expect(broadcastEvents[0].msg.type).toBe('whiteboard:entry-added')
  })

  it('GET snapshot → contains goal', async () => {
    const r = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/snapshot`)
    expect(r.status).toBe(200)
    const snap = await r.json() as { goal?: { summary: string } }
    expect(snap.goal?.summary).toBe('Test Target')
  })

  it('GET entries with filter → matches', async () => {
    await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'progress', by: 'forge', summary: 'P1' }),
    })
    const r = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/entries?types=progress`)
    const body = await r.json() as { entries: Array<{ summary: string }> }
    expect(body.entries.some((e) => e.summary === 'P1')).toBe(true)
  })

  it('POST supersede → old entry superseded', async () => {
    const post = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'decision', by: 'lead', summary: 'decision A' }),
    })
    const { entry } = await post.json() as { entry: { id: string } }
    const r = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/entries/${entry.id}/supersede`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'decision', by: 'lead', summary: 'decision B' }),
    })
    expect(r.status).toBe(200)
  })

  it('POST archive → 204 + broadcasts archived', async () => {
    const post = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'open_question', by: 'forge', summary: 'Q?' }),
    })
    const { entry } = await post.json() as { entry: { id: string } }
    broadcastEvents.length = 0
    const r = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/entries/${entry.id}/archive`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ by: 'lead' }),
    })
    expect(r.status).toBe(200)
    expect(broadcastEvents.some((e) => e.msg.type === 'whiteboard:entry-archived')).toBe(true)
  })

  it('ValidateFailed → 400 invalid_input', async () => {
    const r = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'goal', by: 'lead', summary: 'x'.repeat(WHITEBOARD_SUMMARY_MAX + 1) }),
    })
    expect(r.status).toBe(400)
    const body = await r.json() as { error: string }
    expect(body.error).toBe('invalid_input')
  })

  it('chat does not exist → 404 chat_not_found', async () => {
    const r = await fetch(`${baseUrl}/api/chats/__nonexistent__/whiteboard/snapshot`)
    expect(r.status).toBe(404)
  })

  it('summary missing → 400', async () => {
    const r = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'goal', by: 'lead' }),
    })
    expect(r.status).toBe(400)
  })

  describe('refs structure validation', () => {
    it('refs not an object → 400', async () => {
      const r = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'progress', by: 'forge', summary: 'ok', refs: 'not-an-object' }),
      })
      expect(r.status).toBe(400)
      const body = await r.json() as { error: string; message: string }
      expect(body.error).toBe('invalid_input')
      expect(body.message).toMatch(/refs/)
    })

    it('refs.files not a string array → 400', async () => {
      const r = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'artifact',
          by: 'forge',
          summary: 'ok',
          refs: { files: [123, 'valid'] },
        }),
      })
      expect(r.status).toBe(400)
      const body = await r.json() as { error: string; message: string }
      expect(body.message).toMatch(/refs\.files/)
    })

    it('refs.mailbox not a string → 400', async () => {
      const r = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'progress',
          by: 'forge',
          summary: 'ok',
          refs: { mailbox: { weird: true } },
        }),
      })
      expect(r.status).toBe(400)
    })

    it('refs valid → 201 and fields preserved', async () => {
      const r = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'artifact',
          by: 'forge',
          summary: 'PR1 landed',
          refs: { files: ['a.ts', 'b.ts'], artifacts: ['link'], mailbox: 'm1' },
        }),
      })
      expect(r.status).toBe(201)
      const body = await r.json() as { entry: { refs?: { files?: string[]; artifacts?: string[]; mailbox?: string } } }
      expect(body.entry.refs?.files).toEqual(['a.ts', 'b.ts'])
      expect(body.entry.refs?.artifacts).toEqual(['link'])
      expect(body.entry.refs?.mailbox).toBe('m1')
    })

    it('refs unknown fields discarded (allowlist behavior)', async () => {
      const r = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'progress',
          by: 'forge',
          summary: 'clean-refs',
          refs: { files: ['x.ts'], __evil__: 'poison', nested: { attack: 1 } },
        }),
      })
      expect(r.status).toBe(201)
      const body = await r.json() as { entry: { refs?: Record<string, unknown> } }
      expect(body.entry.refs).toEqual({ files: ['x.ts'] })
    })

    it('tags containing non-string → 400', async () => {
      const r = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'progress',
          by: 'forge',
          summary: 'bad tags',
          tags: ['ok', 42],
        }),
      })
      expect(r.status).toBe(400)
      const body = await r.json() as { message: string }
      expect(body.message).toMatch(/tags/)
    })

    it('Invalid status → 400', async () => {
      const r = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'progress',
          by: 'forge',
          summary: 'bad status',
          status: 'not-a-status',
        }),
      })
      expect(r.status).toBe(400)
      const body = await r.json() as { message: string }
      expect(body.message).toMatch(/status/)
    })
  })

  describe('cursor / diff on-demand context', () => {
    it('GET diff?since=0&instanceId=x → returns all entries + advances cursor', async () => {
      const instanceId = 'test-agent#d1'
      const r = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/diff?since=0&instanceId=${instanceId}`)
      expect(r.status).toBe(200)
      const body = await r.json() as { entries: Array<{ seq: number }>; latestSeq: number; since: number }
      expect(body.entries.length).toBeGreaterThan(0)
      expect(body.latestSeq).toBe(body.entries[body.entries.length - 1].seq)
      const c = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/cursor?instanceId=${instanceId}`)
      const cb = await c.json() as { cursor: { lastReadSeq: number } | null; latestSeq: number }
      expect(cb.cursor?.lastReadSeq).toBe(cb.latestSeq)
    })

    it('GET diff second call no increment → entries empty', async () => {
      const instanceId = 'test-agent#d2'
      await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/diff?since=0&instanceId=${instanceId}`)
      const latest = wb.getLatestSeq(chatId)
      const r2 = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/diff?since=${latest}&instanceId=${instanceId}`)
      const body = await r2.json() as { entries: unknown[] }
      expect(body.entries).toEqual([])
    })

    it('POST cursor explicitly sets seq', async () => {
      const instanceId = 'test-agent#c1'
      const r = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/cursor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId, seq: 1 }),
      })
      expect(r.status).toBe(200)
      const get = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/cursor?instanceId=${instanceId}`)
      const cb = await get.json() as { cursor: { lastReadSeq: number } | null }
      expect(cb.cursor?.lastReadSeq).toBeGreaterThanOrEqual(1)
    })

    it('POST cursor missing instanceId → 400', async () => {
      const r = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/cursor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seq: 3 }),
      })
      expect(r.status).toBe(400)
    })

    it('POST cursor Invalid seq → 400', async () => {
      const r = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/cursor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instanceId: 'x', seq: 'abc' }),
      })
      expect(r.status).toBe(400)
    })

    it('GET diff Unknown chat → 404', async () => {
      const r = await fetch(`${baseUrl}/api/chats/__nope__/whiteboard/diff?since=0`)
      expect(r.status).toBe(404)
    })

    it('snapshot?instanceId=x → advances cursor = latestSeq', async () => {
      const instanceId = 'test-agent#s1'
      await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/snapshot?instanceId=${instanceId}`)
      const c = await fetch(`${baseUrl}/api/chats/${chatId}/whiteboard/cursor?instanceId=${instanceId}`)
      const cb = await c.json() as { cursor: { lastReadSeq: number } | null; latestSeq: number }
      expect(cb.cursor?.lastReadSeq).toBe(cb.latestSeq)
    })
  })
})
