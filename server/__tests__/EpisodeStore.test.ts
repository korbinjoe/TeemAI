import { describe, it, expect } from 'vitest'
import { rankEpisodes, toFtsQuery, type Episode } from '../stores/EpisodeStore'
import { extractEpisodeFromTranscript } from '../services/agent-evolution/EpisodicMemoryService'

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

  it('can distinguish failed episodes that have lessons', () => {
    const ranked = rankEpisodes([
      episode({ id: 'failed-no-lesson', outcome: 'failed', hasLesson: false, ftsScore: 5 }),
      episode({ id: 'failed-with-lesson', outcome: 'failed', hasLesson: true, lesson: 'Check permissions first.', ftsScore: 5 }),
    ], 'fullstack-engineer')

    expect(ranked.find((item) => item.id === 'failed-with-lesson')?.hasLesson).toBe(true)
  })
})

describe('episode extraction', () => {
  it('extracts correction and acceptance signals from transcript messages', () => {
    const extracted = extractEpisodeFromTranscript([
      { id: 'u1', role: 'user', content: 'Fix stale callback in server/routes/auth.ts', timestamp: 1, type: 'text' },
      { id: 'u2', role: 'user', content: '不对，还是没刷新', timestamp: 2, type: 'text' },
      { id: 'a1', role: 'agent', content: 'Computed the callback state at click time in server/routes/auth.ts', timestamp: 3, type: 'text' },
      { id: 'u3', role: 'user', content: '好了 looks good', timestamp: 4, type: 'text' },
    ], 'success')

    expect(extracted?.hasLesson).toBe(true)
    expect(extracted?.summary).toContain('Correction pattern')
    expect(extracted?.summary).toContain('Accepted signal')
    expect(extracted?.files).toContain('server/routes/auth.ts')
  })
})
