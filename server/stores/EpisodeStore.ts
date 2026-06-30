import { randomUUID } from 'crypto'
import { getDatabase } from './Database'

export type EpisodeOutcome = 'success' | 'failed' | 'blocked' | 'unknown'

export interface Episode {
  id: string
  agentId: string
  missionId: string
  title: string
  summary: string
  outcome: EpisodeOutcome
  tags: string[]
  files: string[]
  lesson?: string
  hasLesson?: boolean
  sourceRef?: string
  startedAt: string
  completedAt?: string
}

export interface EpisodeSearchResult extends Episode {
  score: number
}

export class EpisodeStore {
  private db = getDatabase()

  upsert(params: Omit<Episode, 'id'> & { id?: string }): Episode {
    const episode: Episode = {
      id: params.id ?? randomUUID(),
      agentId: params.agentId,
      missionId: params.missionId,
      title: params.title,
      summary: params.summary,
      outcome: params.outcome,
      tags: params.tags,
      files: params.files,
      lesson: params.lesson,
      hasLesson: params.hasLesson ?? !!params.lesson,
      sourceRef: params.sourceRef,
      startedAt: params.startedAt,
      completedAt: params.completedAt,
    }

    this.db.prepare(`
      INSERT INTO episodes (
        id, agent_id, mission_id, title, summary, outcome, tags_json, files_json,
        lesson, has_lesson, source_ref, started_at, completed_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        agent_id = excluded.agent_id,
        mission_id = excluded.mission_id,
        title = excluded.title,
        summary = excluded.summary,
        outcome = excluded.outcome,
        tags_json = excluded.tags_json,
        files_json = excluded.files_json,
        lesson = excluded.lesson,
        has_lesson = excluded.has_lesson,
        source_ref = excluded.source_ref,
        started_at = excluded.started_at,
        completed_at = excluded.completed_at
    `).run(
      episode.id,
      episode.agentId,
      episode.missionId,
      episode.title,
      episode.summary,
      episode.outcome,
      JSON.stringify(episode.tags),
      JSON.stringify(episode.files),
      episode.lesson ?? null,
      episode.hasLesson ? 1 : 0,
      episode.sourceRef ?? null,
      episode.startedAt,
      episode.completedAt ?? null,
    )

    this.db.prepare('DELETE FROM episodes_fts WHERE id = ?').run(episode.id)
    this.db.prepare(`
      INSERT INTO episodes_fts (id, title, summary, tags, files)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      episode.id,
      episode.title,
      episode.summary,
      episode.tags.join(' '),
      episode.files.join(' '),
    )

    return episode
  }

  search(agentId: string, query: string, limit = 3): EpisodeSearchResult[] {
    const ftsQuery = toFtsQuery(query)
    const candidates = ftsQuery
      ? this.searchFts(ftsQuery, Math.max(limit * 8, 24))
      : this.listRecent(Math.max(limit * 8, 24))

    return rankEpisodes(candidates, agentId)
      .filter((episode) => episode.outcome !== 'failed' && episode.outcome !== 'blocked' || !!episode.hasLesson)
      .filter((episode) => episode.score >= 1)
      .slice(0, limit)
  }

  private searchFts(query: string, limit: number): Array<Episode & { ftsScore: number }> {
    const rows = this.db.prepare(`
      SELECT e.*, bm25(episodes_fts) AS fts_score
      FROM episodes_fts
      JOIN episodes e ON e.id = episodes_fts.id
      WHERE episodes_fts MATCH ?
      ORDER BY fts_score ASC
      LIMIT ?
    `).all(query, limit)
    return rows.map((row) => ({
      ...this.rowToEpisode(row as Record<string, unknown>),
      ftsScore: Math.max(0, -(row as Record<string, unknown>).fts_score as number),
    }))
  }

  private listRecent(limit: number): Array<Episode & { ftsScore: number }> {
    const rows = this.db.prepare(`
      SELECT * FROM episodes
      ORDER BY COALESCE(completed_at, started_at) DESC
      LIMIT ?
    `).all(limit)
    return rows.map((row) => ({ ...this.rowToEpisode(row as Record<string, unknown>), ftsScore: 0 }))
  }

  private rowToEpisode(row: Record<string, unknown>): Episode {
    return {
      id: row.id as string,
      agentId: row.agent_id as string,
      missionId: row.mission_id as string,
      title: row.title as string,
      summary: row.summary as string,
      outcome: row.outcome as EpisodeOutcome,
      tags: JSON.parse(row.tags_json as string),
      files: JSON.parse(row.files_json as string),
      lesson: row.lesson as string | undefined,
      hasLesson: !!row.has_lesson,
      sourceRef: row.source_ref as string | undefined,
      startedAt: row.started_at as string,
      completedAt: row.completed_at as string | undefined,
    }
  }
}

export const toFtsQuery = (query: string): string => {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9_-]+/i)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .slice(0, 8)
  return terms.length > 0 ? terms.map((term) => `"${term.replaceAll('"', '""')}"`).join(' OR ') : ''
}

export const rankEpisodes = (
  episodes: Array<Episode & { ftsScore?: number }>,
  targetAgentId: string,
): EpisodeSearchResult[] => {
  const now = Date.now()
  return episodes
    .map((episode) => {
      const completedAt = episode.completedAt ?? episode.startedAt
      const ageDays = Math.max(0, (now - new Date(completedAt).getTime()) / 86400000)
      const recencyScore = Math.max(0, 2 - ageDays / 30)
      const agentScore = episode.agentId === targetAgentId ? 6 : 1
      const outcomeScore = episode.outcome === 'success'
        ? 3
        : episode.outcome === 'blocked'
          ? 0.5
          : episode.outcome === 'failed'
            ? -1
            : 0
      const queryScore = episode.ftsScore ?? 0
      return {
        ...episode,
        score: queryScore + agentScore + outcomeScore + recencyScore,
      }
    })
    .sort((a, b) => b.score - a.score || (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt))
}
