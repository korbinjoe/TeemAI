import { describe, it, expect, vi } from 'vitest'
import express from 'express'
import { createServer } from 'http'
import type { AddressInfo } from 'net'
import { createAgentRoutes } from '../routes/agent/agentRoutes'

const makeDeps = (bumpView: (name: string) => void) => ({
  agentRegistry: { list: () => [], get: () => undefined } as any,
  agentStore: {
    list: () => [],
    get: () => undefined,
    upsert: async () => undefined,
    remove: async () => true,
    getByName: () => undefined,
  } as any,
  skillManager: {
    listSkills: () => [],
    getSkill: (name: string) => name === 'user-skill'
      ? { name, description: 'User skill', content: 'Skill body', enabled: true, source: 'custom', evolutionSource: 'user' }
      : undefined,
    registerCustomSkill: () => undefined,
    removeSkill: () => true,
  } as any,
  skillEvolutionStore: {
    list: () => [],
    bumpView,
  } as any,
  senseiPromptPaths: [] as string[],
})

describe('skill telemetry routes', () => {
  it('bumps view_count when skill content is requested', async () => {
    const bumpView = vi.fn()
    const app = express()
    app.use(express.json())
    app.use(createAgentRoutes(makeDeps(bumpView)))

    const server = createServer(app)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo

    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/skills/user-skill/content`)
      expect(res.status).toBe(200)
      expect(await res.json()).toMatchObject({ content: 'Skill body' })
      expect(bumpView).toHaveBeenCalledWith('user-skill')
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
