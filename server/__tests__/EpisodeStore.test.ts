import { describe, it, expect } from 'vitest'
import { rankEpisodes, toFtsQuery, type Episode } from '../stores/EpisodeStore'

const episode = (overrides: Partial<Episode> & { ftsScore?: number }): Episode & { ftsScore?: number } => ({
  id: 'ep',
  agentId: 'fullstack-engineer',
  missionId: 'mission',
  title: 'OAuth validation',
  summary: 'Validate provider state before token exchange.',
  outcome: 'success',
  tags: ['auth'],
  files: ['server/routes/auth.ts'],
  startedAt: new Date().toISOString(),
  completedAt: new Date().toISOString(),
  ...overrides,
})

describe('EpisodeStore ranking helpers', () => {
  it('builds safe FTS queries from natural language', () => {
    expect(toFtsQuery('OAuth callback validation!')).toBe('"oauth" OR "callback" OR "validation"')
  })

  it('ranks same-agent successful recent episodes higher', () => {
    const ranked = rankEpisodes([
      episode({ id: 'other', agentId: 'growth-marketer', ftsScore: 7 }),
      episode({ id: 'same', agentId: 'fullstack-engineer', ftsScore: 3 }),
      episode({ id: 'failed', agentId: 'fullstack-engineer', outcome: 'failed', ftsScore: 3 }),
    ], 'fullstack-engineer')

    expect(ranked[0].id).toBe('same')
    expect(ranked.findIndex((item) => item.id === 'failed')).toBeGreaterThan(0)
  })
})
