import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import express from 'express'
import { createServer, type Server } from 'http'
import { AddressInfo } from 'net'
import { promises as fs } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const TMP_HOME = join(tmpdir(), `teemai-route-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)

vi.mock('os', async () => {
  const actual = await vi.importActual<typeof import('os')>('os')
  return { ...actual, homedir: () => TMP_HOME }
})

const ORIGINAL_FETCH = globalThis.fetch
const upstreamMock = vi.fn()

const dispatchFetch: typeof fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
  if (url.includes('generativelanguage.googleapis.com')) {
    return upstreamMock(input, init)
  }
  return ORIGINAL_FETCH(input, init)
}

let createAgentRoutes: typeof import('../routes/agent/agentRoutes').createAgentRoutes
let avatarStorage: typeof import('../lib/avatarStorage')
let geminiImage: typeof import('../lib/geminiImage')

const makeStubDeps = () => ({
  agentRegistry: { list: () => [], get: () => undefined, onReload: () => undefined } as any,
  agentStore: {
    list: () => [],
    get: () => undefined,
    upsert: async () => undefined,
    remove: async () => true,
    getByName: () => undefined,
  } as any,
  skillManager: {
    listSkills: () => [],
    getSkill: () => undefined,
    registerCustomSkill: () => undefined,
    removeSkill: () => true,
  } as any,
  senseiPromptPaths: [] as string[],
})

describe('agentRoutes — avatar endpoints', () => {
  let server: Server
  let baseUrl: string

  beforeAll(async () => {
    await fs.mkdir(TMP_HOME, { recursive: true })
    vi.resetModules()
    const routesMod = await import('../routes/agent/agentRoutes')
    createAgentRoutes = routesMod.createAgentRoutes
    avatarStorage = await import('../lib/avatarStorage')
    geminiImage = await import('../lib/geminiImage')
    await avatarStorage.ensureAvatarDir()

    globalThis.fetch = dispatchFetch

    const app = express()
    app.use(express.json())
    app.use(createAgentRoutes(makeStubDeps()))
    server = createServer(app)
    await new Promise<void>((res) => server.listen(0, '127.0.0.1', res))
    const { port } = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${port}`
  })

  afterAll(async () => {
    globalThis.fetch = ORIGINAL_FETCH
    await new Promise<void>((res) => server.close(() => res()))
    await fs.rm(TMP_HOME, { recursive: true, force: true })
  })

  beforeEach(() => {
    upstreamMock.mockReset()
    geminiImage.__resetGeminiCache()
    process.env.GEMINI_API_KEY = 'test-key'
  })

  afterEach(() => {
    delete process.env.GEMINI_API_KEY
  })

  it('POST /api/agents/generate-avatar 400 without required fields', async () => {
    const res = await fetch(`${baseUrl}/api/agents/generate-avatar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'custom-001' }),
    })
    expect(res.status).toBe(400)
  })

  it('POST /api/agents/generate-avatar 400 on invalid agentId', async () => {
    const res = await fetch(`${baseUrl}/api/agents/generate-avatar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'BAD/ID', name: 'A', animal: 'owl' }),
    })
    expect(res.status).toBe(400)
  })

  it('POST /api/agents/generate-avatar runs 2 styles in parallel and writes files', { timeout: 30000 }, async () => {
    const base64 = Buffer.from('FAKEPNG').toString('base64')
    for (let i = 0; i < 2; i++) {
      upstreamMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ inlineData: { data: base64 } }] } }],
          }),
          { status: 200 },
        ),
      )
    }

    const res = await fetch(`${baseUrl}/api/agents/generate-avatar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'custom-002', name: 'Tester', animal: 'owl' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; succeeded: number; failed: number }
    expect(body.ok).toBe(true)
    expect(body.succeeded).toBe(2)
    expect(body.failed).toBe(0)

    const files = await fs.readdir(join(avatarStorage.AVATAR_ROOT, 'custom-002'))
    expect(files.sort()).toEqual([
      'brush.png', 'default.png',
    ])
  })

  it('POST /api/agents/generate-avatar reports partial failures without throwing', { timeout: 60000 }, async () => {
    const base64 = Buffer.from('OK').toString('base64')
    // 1 success + 1 failure (rate limited, including retries)
    for (let i = 0; i < 1; i++) {
      upstreamMock.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ inlineData: { data: base64 } }] } }],
          }),
          { status: 200 },
        ),
      )
    }
    // Last style fails on initial + 2 retries (MAX_RETRIES = 2)
    for (let i = 0; i < 3; i++) {
      upstreamMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'rate_limited' } }), { status: 200 }),
      )
    }

    const res = await fetch(`${baseUrl}/api/agents/generate-avatar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'custom-003', name: 'Tester', animal: 'owl' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean; succeeded: number; failed: number }
    expect(body.ok).toBe(true)
    expect(body.succeeded + body.failed).toBe(2)
    expect(body.failed).toBeGreaterThanOrEqual(1)
  })

  it('GET /api/avatars/custom/:id/:style returns the saved png', async () => {
    await avatarStorage.saveAvatar('custom-004', 'brush', Buffer.from('PNGDATA'))
    const res = await fetch(`${baseUrl}/api/avatars/custom/custom-004/brush`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/png')
    const text = await res.text()
    expect(text).toBe('PNGDATA')
  })

  it('GET /api/avatars/custom/:id/:style returns 404 for unknown', async () => {
    const res = await fetch(`${baseUrl}/api/avatars/custom/never-existed/brush`)
    expect(res.status).toBe(404)
  })

  it('GET /api/avatars/custom/:id/:style rejects path traversal', async () => {
    // Express normalizes ".." in path so this likely 404s before reaching handler;
    // accept any non-2xx response as long as no file leaks out
    const res = await fetch(`${baseUrl}/api/avatars/custom/..%2Fetc/brush`)
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('DELETE /api/agents/:id removes the avatar folder', async () => {
    await avatarStorage.saveAvatar('custom-005', 'brush', Buffer.from('a'))
    const res = await fetch(`${baseUrl}/api/agents/custom-005`, { method: 'DELETE' })
    expect(res.status).toBe(200)
    const after = await avatarStorage.resolveAvatarPath('custom-005', 'brush')
    expect(after).toBeNull()
  })
})
